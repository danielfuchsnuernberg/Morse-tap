/**
 * Morse Chat relay server.
 *
 * Dead simple: clients join a room by code, anything one client sends is
 * forwarded to everyone else in that room. No database, no accounts,
 * no message history.
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const store = require('./store');
const push = require('./push');

const PORT = process.env.PORT || 8080;
const MAX_ROOM_SIZE = 8;
const MAX_MESSAGE_BYTES = 4096;
const HEARTBEAT_MS = 30000;

/**
 * Shown by /health so it is always possible to tell which code Render is
 * actually running, rather than which code was pushed to GitHub.
 */
const SERVER_VERSION = 'v7';

/** roomCode -> Set of sockets */
const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    store
      .health()
      .then((storage) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            version: SERVER_VERSION,
            rooms: rooms.size,
            clients: [...rooms.values()].reduce((total, set) => total + set.size, 0),
            ...storage,
          })
        );
      })
      .catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', storage: 'error' }));
      });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

function normaliseRoom(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function peersOf(socket) {
  const peers = rooms.get(socket.roomCode);
  if (!peers) return [];
  return [...peers].filter((peer) => peer !== socket);
}

/**
 * Tell everyone in a room how many OTHER PEOPLE are in it.
 *
 * People, not sockets. One phone can hold two connections at once - a
 * reconnect the heartbeat has not reaped yet, or the web version open
 * beside the app - and counting those separately makes the room look
 * occupied when you are sitting in it on your own. The same reasoning
 * already governs who gets sent a message; it belongs here too.
 *
 * A socket that never sent a clientId keeps the unique one assigned on
 * connection, so two anonymous clients still count as two. We cannot
 * tell them apart, and guessing would be worse than counting twice.
 */
function broadcastPeerCount(roomCode) {
  const peers = rooms.get(roomCode);
  if (!peers) return;
  for (const socket of peers) {
    const others = new Set();
    for (const peer of peers) {
      if (peer.clientId === socket.clientId) continue;
      others.add(peer.clientId);
    }
    send(socket, { type: 'peers', count: others.size });
  }
}

function leaveRoom(socket) {
  const { roomCode } = socket;
  if (!roomCode) return;
  const peers = rooms.get(roomCode);
  if (!peers) return;
  peers.delete(socket);
  if (peers.size === 0) {
    rooms.delete(roomCode);
  } else {
    broadcastPeerCount(roomCode);
  }
  socket.roomCode = null;
}

let clientCounter = 0;

/**
 * What must still be OFFERED to a device: anything held for the room it
 * did not send and has not confirmed.
 *
 * Deliberately lenient. Handing a message over is not proof it arrived -
 * a connection can die between the server sending and the phone showing
 * it - so an unconfirmed message is offered again, and countHandouts is
 * what eventually stops that. Do not tighten this without reading
 * "a message handed to a connection that dies is offered again".
 */
function stillOwedTo(clientId, waiting, confirmed) {
  return waiting.filter(
    (message) => message.from !== clientId && !confirmed.includes(String(message.id))
  );
}

/**
 * What a device has never been SHOWN: the same list, minus anything it
 * has already been handed at least once.
 *
 * This is the badge's question, and it is not the same as the one above.
 * Re-offering a message is cheap insurance; counting it again on the app
 * icon is not. Sharing one answer is what left the badge counting every
 * message the room had seen in thirty days, pinned at the MAX_PENDING
 * ceiling of 200 while nothing was actually waiting.
 */
async function unseenBy(roomCode, clientId, waiting, confirmed) {
  const handed = await store.alreadyDelivered(roomCode, clientId);
  return stillOwedTo(clientId, waiting, confirmed).filter(
    (message) => !handed.includes(String(message.id))
  );
}

/**
 * Hand a newly joined client anything that was waiting for this room,
 * skipping whatever it sent itself.
 */
async function deliverPending(socket, roomCode) {
  if (!store.isConfigured) return;
  try {
    const waiting = await store.pending(roomCode);
    const confirmed = await store.confirmedIds(roomCode);
    const forThem = stillOwedTo(socket.clientId, waiting, confirmed);
    if (forThem.length === 0) return;

    for (const message of forThem) {
      send(socket, {
        // Without the id the client cannot confirm receipt, so the
        // message is never dropped and comes back on every single
        // reconnect, for thirty days.
        id: message.id,
        type: 'morse',
        symbols: message.symbols,
        sentAt: message.sentAt,
        held: true,
      });
    }

    // Record what this device has now been shown. It does NOT stop the
    // message being offered again - that is deliberate, see stillOwedTo -
    // it is what lets the badge stop counting something twice. Nothing
    // wrote this list on the delivery path before, so every re-offer was
    // also counted as new on the app icon.
    const ids = forThem.map((message) => message.id);
    await store.markDelivered(roomCode, socket.clientId, ids);

    // Last resort for clients that never confirm: after a few hand-outs
    // the message is dropped rather than offered for ever.
    const spent = await store.countHandouts(roomCode, ids);
    if (spent.length > 0) await store.forget(roomCode, spent);
  } catch (error) {
    console.error('could not deliver held messages:', error.message);
  }
}

/**
 * Tell everyone registered for this room, except the sender, that
 * something is waiting. Says nothing about what it is.
 */
async function notifyAbsent(roomCode, senderId, symbols) {
  if (!store.isConfigured) return;
  try {
    const devices = await store.tokensFor(roomCode, senderId);
    if (devices.length === 0) return;

    const waiting = await store.pending(roomCode);
    const confirmed = await store.confirmedIds(roomCode);

    // The number on the icon is how much this device has never been
    // shown - not how much it may be re-offered. The floor of 1 stands
    // because the message that triggered this is stored without being
    // awaited, so it may not be in the list yet.
    const recipients = await Promise.all(
      devices.map(async ({ clientId, token }) => ({
        token,
        symbols,
        count: (await unseenBy(roomCode, clientId, waiting, confirmed)).length || 1,
      }))
    );

    const { dead } = await push.notify(recipients);
    for (const token of dead) await store.forgetToken(roomCode, token);
  } catch (error) {
    console.error('could not notify:', error.message);
  }
}

wss.on('connection', (socket) => {
  socket.roomCode = null;
  socket.isAlive = true;
  // Identifies this connection, so we never hand someone their own
  // message back when they rejoin.
  socket.clientId = `c${++clientCounter}-${Date.now()}`;
  socket.pushToken = null;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', reason: 'bad-json' });
      return;
    }

    if (message.type === 'join') {
      const roomCode = normaliseRoom(message.room);
      // The device tells us who it is, so a reconnect is recognised as
      // the same person and never gets handed back its own messages.
      if (typeof message.clientId === 'string' && message.clientId.length > 0) {
        socket.clientId = message.clientId.slice(0, 64);
      }
      if (typeof message.pushToken === 'string' && message.pushToken.length > 0) {
        socket.pushToken = message.pushToken.slice(0, 256);
      }
      if (roomCode.length < 3) {
        send(socket, { type: 'error', reason: 'room-too-short' });
        return;
      }

      const existing = rooms.get(roomCode);
      if (existing && existing.size >= MAX_ROOM_SIZE) {
        send(socket, { type: 'error', reason: 'room-full' });
        return;
      }

      leaveRoom(socket);
      socket.roomCode = roomCode;
      if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
      rooms.get(roomCode).add(socket);

      send(socket, { type: 'joined', room: roomCode });
      broadcastPeerCount(roomCode);
      if (socket.pushToken) {
        store.rememberToken(roomCode, socket.clientId, socket.pushToken).catch(() => undefined);
      }
      deliverPending(socket, roomCode);
      return;
    }

    // A client confirming it has received held messages.
    if (message.type === 'received') {
      const ids = Array.isArray(message.ids) ? message.ids.map(String) : [];
      if (socket.roomCode && ids.length > 0) {
        const room = socket.roomCode;
        const who = socket.clientId;
        // Record the confirmation first: that is what makes the message
        // safe to stop offering. Pruning the waiting list is only tidying.
        store
          .confirm(room, ids)
          .then(() => store.markDelivered(room, who, ids))
          .then(() => store.forget(room, ids))
          .catch(() => undefined);
      }
      return;
    }

    // A client asking whether we're still here.
    if (message.type === 'ping') {
      send(socket, { type: 'pong', at: Date.now() });
      return;
    }

    if (message.type === 'leave') {
      leaveRoom(socket);
      return;
    }

    if (message.type === 'morse') {
      if (!socket.roomCode) {
        send(socket, { type: 'error', reason: 'not-in-room', id: message.id });
        return;
      }
      // The id travels with the message, live as well as held. Without
      // it the receiver has nothing to confirm, so the copy kept for
      // safekeeping is never dropped and turns up again on the next
      // connection - the same message, twice.
      const messageId = message.id ?? `s${Date.now()}`;
      const payload = {
        type: 'morse',
        id: messageId,
        symbols: String(message.symbols || '').slice(0, 1000),
        sentAt: Date.now(),
      };

      // Never hand a message back to the phone that sent it. A phone can
      // briefly hold two sockets in a room - during a reconnect, or with
      // the web version open beside the app - and the second one is a
      // peer as far as the room is concerned. Matching on the device's
      // own id is the only reliable way to tell "someone else" from
      // "me again". Sockets that never sent an id are left alone, so an
      // older client is never cut off.
      const peers = peersOf(socket).filter(
        (peer) => !(socket.clientId && peer.clientId && peer.clientId === socket.clientId)
      );
      for (const peer of peers) send(peer, payload);

      // Nobody there? Keep it, so it arrives when they next connect.
      // Also keep it when they ARE there, until they confirm receipt -
      // being connected is not the same as having received it.
      store
        .hold(socket.roomCode, {
          id: messageId,
          from: socket.clientId,
          symbols: payload.symbols,
          sentAt: payload.sentAt,
        })
        .catch(() => undefined);

      // Nobody here to see it? Buzz their phone instead.
      if (peers.length === 0) {
        notifyAbsent(socket.roomCode, socket.clientId, payload.symbols).catch(() => undefined);
      }

      // Tell the sender what actually happened, so the app can stop
      // claiming a message was sent when nobody was there to hear it.
      send(socket, {
        type: 'ack',
        id: message.id ?? null,
        deliveredTo: peers.length,
        held: !store.isConfigured ? false : true,
      });
      return;
    }

    send(socket, { type: 'error', reason: 'unknown-type' });
  });

  socket.on('close', () => leaveRoom(socket));
  socket.on('error', () => leaveRoom(socket));
});

/** Drop sockets that stopped responding, so rooms don't leak. */
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Morse Chat relay listening on port ${PORT}`);
});

module.exports = { server, wss, rooms };

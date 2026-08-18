/**
 * Morse Tap relay server.
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

function broadcastPeerCount(roomCode) {
  const peers = rooms.get(roomCode);
  if (!peers) return;
  for (const socket of peers) {
    send(socket, { type: 'peers', count: peers.size - 1 });
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
 * Hand a newly joined client anything that was waiting for this room,
 * skipping whatever it sent itself.
 */
async function deliverPending(socket, roomCode) {
  if (!store.isConfigured) return;
  try {
    const waiting = await store.pending(roomCode);
    const forThem = waiting.filter((message) => message.from !== socket.clientId);
    if (forThem.length === 0) return;

    for (const message of forThem) {
      send(socket, {
        type: 'morse',
        symbols: message.symbols,
        sentAt: message.sentAt,
        held: true,
      });
    }
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

    // How many are waiting depends on who is being told: their own
    // messages don't count, everyone else's do.
    const recipients = devices.map(({ clientId, token }) => ({
      token,
      symbols,
      count: waiting.filter((message) => message.from !== clientId).length || 1,
    }));

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
        store.forget(socket.roomCode, ids).catch(() => undefined);
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
      const payload = {
        type: 'morse',
        symbols: String(message.symbols || '').slice(0, 1000),
        sentAt: Date.now(),
      };

      const peers = peersOf(socket);
      for (const peer of peers) send(peer, payload);

      // Nobody there? Keep it, so it arrives when they next connect.
      // Also keep it when they ARE there, until they confirm receipt -
      // being connected is not the same as having received it.
      store
        .hold(socket.roomCode, {
          id: message.id ?? `s${Date.now()}`,
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
  console.log(`Morse Tap relay listening on port ${PORT}`);
});

module.exports = { server, wss, rooms };

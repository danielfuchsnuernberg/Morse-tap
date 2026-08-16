/**
 * Morse Tap relay server.
 *
 * Dead simple: clients join a room by code, anything one client sends is
 * forwarded to everyone else in that room. No database, no accounts,
 * no message history.
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_ROOM_SIZE = 8;
const MAX_MESSAGE_BYTES = 4096;
const HEARTBEAT_MS = 30000;

/** roomCode -> Set of sockets */
const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        rooms: rooms.size,
        clients: [...rooms.values()].reduce((total, set) => total + set.size, 0),
      })
    );
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

wss.on('connection', (socket) => {
  socket.roomCode = null;
  socket.isAlive = true;

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

      // Tell the sender what actually happened, so the app can stop
      // claiming a message was sent when nobody was there to hear it.
      send(socket, {
        type: 'ack',
        id: message.id ?? null,
        deliveredTo: peers.length,
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

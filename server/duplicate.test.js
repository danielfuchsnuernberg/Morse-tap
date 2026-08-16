/**
 * The v022 bug: replacing a dead socket left the old one reconnecting,
 * so a client sat in the room twice and received its own messages.
 *
 * These tests describe what the server sees, and prove one client in a
 * room can never be relayed its own message.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const WebSocket = require('ws');

process.env.PORT = process.env.PORT || '8801';
const { server, wss, rooms } = require('./index.js');
const URL = `ws://127.0.0.1:${process.env.PORT}`;

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(URL);
    socket.inbox = [];
    socket.on('message', (raw) => socket.inbox.push(JSON.parse(raw.toString())));
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });
}
function waitFor(socket, predicate, label, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const found = socket.inbox.find(predicate);
    if (found) return resolve(found);
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeout);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (predicate(message)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(message);
      }
    };
    socket.on('message', onMessage);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a single client never receives its own message', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'SOLO01' }));
  await waitFor(alice, (m) => m.type === 'joined', 'joined');

  alice.inbox.length = 0;
  alice.send(JSON.stringify({ type: 'morse', symbols: '.-', id: 'own' }));
  await waitFor(alice, (m) => m.type === 'ack', 'ack');
  await sleep(200);

  assert.equal(alice.inbox.filter((m) => m.type === 'morse').length, 0);
  alice.close();
});

test('two sockets from the same client DO see each other - the v022 symptom', async () => {
  // This is what the bug looked like from the server's side, and why the
  // fix has to be on the client: the server cannot tell them apart.
  const first = await connect();
  const ghost = await connect();
  first.send(JSON.stringify({ type: 'join', room: 'GHOST1' }));
  ghost.send(JSON.stringify({ type: 'join', room: 'GHOST1' }));
  await waitFor(ghost, (m) => m.type === 'joined', 'ghost joined');

  first.send(JSON.stringify({ type: 'morse', symbols: '-...', id: 'dupe' }));
  const bounced = await waitFor(ghost, (m) => m.type === 'morse', 'the ghost got it');
  assert.equal(bounced.symbols, '-...');

  // Which is exactly why peer count is worth watching.
  const peers = await waitFor(first, (m) => m.type === 'peers' && m.count === 1, 'peer count');
  assert.equal(peers.count, 1, 'a lone client showing a partner means a duplicate connection');

  first.close();
  ghost.close();
});

test('a closed socket leaves the room, so the count returns to zero', async () => {
  const alice = await connect();
  const extra = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'CLEAN1' }));
  extra.send(JSON.stringify({ type: 'join', room: 'CLEAN1' }));
  await waitFor(alice, (m) => m.type === 'peers' && m.count === 1, 'paired');

  // Alice already saw a peers:0 when she first joined alone, so clear
  // the inbox or we'd match that stale one instead of the new one.
  alice.inbox.length = 0;
  extra.close();
  await waitFor(alice, (m) => m.type === 'peers' && m.count === 0, 'alone again');
  assert.equal(rooms.get('CLEAN1').size, 1);
  alice.close();
});

test('rejoining the same room twice on one socket does not duplicate it', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'REPEAT' }));
  await waitFor(alice, (m) => m.type === 'joined', 'joined');
  alice.send(JSON.stringify({ type: 'join', room: 'REPEAT' }));
  await sleep(200);

  assert.equal(rooms.get('REPEAT').size, 1, 'joining twice must not add the socket twice');
  alice.close();
});

test.after(() => {
  wss.close();
  server.close();
});

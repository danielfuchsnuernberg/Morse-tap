/**
 * Two bugs that made a message you sent come straight back to you.
 *
 * 1. A phone can hold two sockets in the same room for a moment - during
 *    a reconnect, or with the web version open next to the app. The room
 *    saw the second socket as "somebody else" and posted the message to
 *    it, so your own words arrived as something to decode.
 *
 * 2. Held messages were delivered without their id, so the client could
 *    never say "got it" and the server kept them for thirty days,
 *    handing them out again on every reconnect.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const WebSocket = require('ws');
const Module = require('node:module');

const lists = new Map();
const delivered = new Map();
const handouts = new Map();
const fakeStore = {
  isConfigured: true,
  async countHandouts(room, ids) {
    const spent = [];
    for (const id of ids) {
      const key = `${room}:${id}`;
      const count = (handouts.get(key) ?? 0) + 1;
      handouts.set(key, count);
      if (count >= 4) spent.push(String(id));
    }
    return spent;
  },

  async alreadyDelivered(room, clientId) {
    return [...(delivered.get(`${room}:${clientId}`) ?? [])];
  },
  async markDelivered(room, clientId, ids) {
    if (!clientId || ids.length === 0) return;
    const key = `${room}:${clientId}`;
    delivered.set(key, [...(delivered.get(key) ?? []), ...ids.map(String)]);
  },

  async hold(room, message) {
    if (!lists.has(room)) lists.set(room, []);
    lists.get(room).push(message);
    return lists.get(room).length;
  },
  async pending(room) {
    return [...(lists.get(room) ?? [])];
  },
  async forget(room, ids) {
    lists.set(room, (lists.get(room) ?? []).filter((m) => !ids.includes(m.id)));
  },
  async rememberToken() {},
  async tokensFor() {
    return [];
  },
  async health() {
    return { storage: 'ok' };
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === './store') return fakeStore;
  return originalRequire.apply(this, arguments);
};

process.env.PORT = process.env.PORT || '8823';
const { server, wss } = require('./index.js');
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
const quiet = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const join = async (socket, room, clientId) => {
  socket.send(JSON.stringify({ type: 'join', room, clientId }));
  await waitFor(socket, (m) => m.type === 'joined', 'joined');
};

test('a second socket from the same phone never gets its own message', async () => {
  lists.clear();
  const phone = await connect();
  const samePhoneAgain = await connect();
  const her = await connect();

  await join(phone, 'echo1', 'danny-phone');
  await join(samePhoneAgain, 'echo1', 'danny-phone');
  await join(her, 'echo1', 'her-phone');

  phone.send(JSON.stringify({ type: 'morse', id: 'm1', symbols: '.. / .-.. --- ...- .' }));

  await waitFor(her, (m) => m.type === 'morse', 'her copy');
  await quiet();

  assert.equal(
    samePhoneAgain.inbox.filter((m) => m.type === 'morse').length,
    0,
    'the same phone was handed back its own message'
  );
  assert.equal(
    phone.inbox.filter((m) => m.type === 'morse').length,
    0,
    'the sending socket got its own message'
  );

  const ack = phone.inbox.find((m) => m.type === 'ack');
  assert.equal(ack.deliveredTo, 1, 'delivered count must not include the sender itself');

  for (const socket of [phone, samePhoneAgain, her]) socket.close();
});

test('a different phone still receives normally', async () => {
  lists.clear();
  const phone = await connect();
  const her = await connect();
  await join(phone, 'echo2', 'danny-phone');
  await join(her, 'echo2', 'her-phone');

  phone.send(JSON.stringify({ type: 'morse', id: 'm2', symbols: '-- --- .-. ... .' }));
  const got = await waitFor(her, (m) => m.type === 'morse', 'her copy');
  assert.equal(got.symbols, '-- --- .-. ... .');

  phone.close();
  her.close();
});

test('clients with no id are still relayed to each other', async () => {
  lists.clear();
  const older = await connect();
  const otherOlder = await connect();
  older.send(JSON.stringify({ type: 'join', room: 'echo3' }));
  otherOlder.send(JSON.stringify({ type: 'join', room: 'echo3' }));
  await waitFor(older, (m) => m.type === 'joined', 'joined');
  await waitFor(otherOlder, (m) => m.type === 'joined', 'joined');

  older.send(JSON.stringify({ type: 'morse', id: 'm3', symbols: '.-' }));
  const got = await waitFor(otherOlder, (m) => m.type === 'morse', 'relayed');
  assert.equal(got.symbols, '.-');

  older.close();
  otherOlder.close();
});

test('a held message arrives with its id, and confirming it drops it', async () => {
  lists.clear();
  const sender = await connect();
  await join(sender, 'echo4', 'her-phone');
  sender.send(JSON.stringify({ type: 'morse', id: 'held-1', symbols: '.... ..' }));
  await waitFor(sender, (m) => m.type === 'ack', 'ack');
  sender.close();
  await quiet();

  const phone = await connect();
  await join(phone, 'echo4', 'danny-phone');
  const held = await waitFor(phone, (m) => m.type === 'morse' && m.held, 'held message');
  assert.equal(held.id, 'held-1', 'held messages must carry their id or they can never be dropped');

  phone.send(JSON.stringify({ type: 'received', ids: [held.id] }));
  await quiet();
  assert.equal(lists.get('ECHO4').length, 0, 'confirmed message was not dropped');

  // And it must not come back on the next connection.
  phone.close();
  const again = await connect();
  await join(again, 'echo4', 'danny-phone');
  await quiet();
  assert.equal(
    again.inbox.filter((m) => m.type === 'morse').length,
    0,
    'a confirmed message came back again'
  );
  again.close();
});

test.after(() => {
  wss.close();
  server.close();
});

test('a client that never confirms is still not given the same message twice', async () => {
  lists.clear();
  delivered.clear();

  const her = await connect();
  await join(her, 'echo5', 'her-phone');
  her.send(JSON.stringify({ type: 'morse', id: 'stuck-1', symbols: '- .' }));
  await waitFor(her, (m) => m.type === 'ack', 'ack');
  her.close();
  await quiet();

  // Open the app five times over. Never confirm anything.
  const seen = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const phone = await connect();
    await join(phone, 'echo5', 'danny-phone');
    await quiet(250);
    seen.push(phone.inbox.filter((m) => m.type === 'morse').length);
    phone.close();
  }

  assert.deepEqual(seen, [1, 0, 0, 0, 0], `message arrived on each open: ${seen.join(',')}`);

  // It is still waiting for anyone else who has not seen it.
  const otherPhone = await connect();
  await join(otherPhone, 'echo5', 'third-phone');
  const got = await waitFor(otherPhone, (m) => m.type === 'morse', 'still waiting for someone new');
  assert.equal(got.symbols, '- .');
  otherPhone.close();
});

test('an old client that cannot identify itself is not looped for ever', async () => {
  lists.clear();
  delivered.clear();
  handouts.clear();

  const her = await connect();
  await join(her, 'echo6', 'her-phone');
  her.send(JSON.stringify({ type: 'morse', id: 'old-1', symbols: '.- -...' }));
  await waitFor(her, (m) => m.type === 'ack', 'ack');
  her.close();
  await quiet();

  // An older build: it never sends a clientId, so every connection looks
  // like a stranger. Open the app six times.
  const seen = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const phone = await connect();
    phone.send(JSON.stringify({ type: 'join', room: 'echo6' }));
    await waitFor(phone, (m) => m.type === 'joined', 'joined');
    await quiet(250);
    seen.push(phone.inbox.filter((m) => m.type === 'morse').length);
    phone.close();
  }

  assert.deepEqual(seen, [1, 1, 1, 1, 0, 0], `hand-outs went ${seen.join(',')}`);
  assert.equal(lists.get('ECHO6').length, 0, 'the message should have been dropped');
});

test('/health says which version is running', async () => {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT}/health`);
  const body = await response.json();
  assert.equal(body.version, 'v5', 'health must name the running version');
  assert.equal(body.status, 'ok');
});

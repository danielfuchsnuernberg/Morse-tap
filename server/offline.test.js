/**
 * The whole point of the storage: a message sent while the other person
 * is offline must reach them when they come back.
 *
 * Upstash is replaced with an in-memory stand-in so this runs anywhere,
 * exercising the real server logic without touching the real database.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const WebSocket = require('ws');
const Module = require('node:module');

/* ---- stand in for Upstash before the server loads ---- */
const lists = new Map();
const delivered = new Map();
const fakeStore = {
  isConfigured: true,
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
  async health() {
    return { storage: 'ok' };
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === './store') return fakeStore;
  return originalRequire.apply(this, arguments);
};

process.env.PORT = process.env.PORT || '8811';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a message sent to an empty room reaches whoever joins next', async () => {
  lists.clear();

  // She sends while he is nowhere to be seen.
  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'ALONE', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'she joined');

  her.send(JSON.stringify({ type: 'morse', symbols: '.. / .-.. --- ...- . / -.-- --- ..-', id: 'love' }));
  const ack = await waitFor(her, (m) => m.type === 'ack', 'ack');
  assert.equal(ack.deliveredTo, 0, 'nobody was there');
  assert.equal(ack.held, true, 'but it should have been kept');

  her.close();
  await sleep(150);

  // Hours later, he opens the app.
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'ALONE', clientId: 'his-phone' }));
  const delivered = await waitFor(him, (m) => m.type === 'morse', 'he got it');
  assert.equal(delivered.symbols, '.. / .-.. --- ...- . / -.-- --- ..-');
  assert.equal(delivered.held, true, 'it should be marked as having waited');

  him.close();
});

test('you never receive your own held message back, even after reconnecting', async () => {
  lists.clear();
  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'SELF01', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '...', id: 'mine' }));
  await waitFor(her, (m) => m.type === 'ack', 'ack');
  her.close();
  await sleep(150);

  // Same phone, new connection. It must be recognised as her.
  const herAgain = await connect();
  herAgain.send(JSON.stringify({ type: 'join', room: 'SELF01', clientId: 'her-phone' }));
  await waitFor(herAgain, (m) => m.type === 'joined', 'rejoined');
  await sleep(300);

  assert.equal(
    herAgain.inbox.filter((m) => m.type === 'morse').length,
    0,
    'she must not be handed back her own message'
  );

  // And it is still there for him.
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'SELF01', clientId: 'his-phone' }));
  const forHim = await waitFor(him, (m) => m.type === 'morse', 'he still gets it');
  assert.equal(forHim.symbols, '...');

  herAgain.close();
  him.close();
});

test('a received message is forgotten once confirmed', async () => {
  lists.clear();
  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'CONFIRM', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '-.-', id: 'k1' }));
  await waitFor(her, (m) => m.type === 'ack', 'ack');
  assert.equal((await fakeStore.pending('CONFIRM')).length, 1);

  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'CONFIRM', clientId: 'his-phone' }));
  await waitFor(him, (m) => m.type === 'morse', 'delivered');

  him.send(JSON.stringify({ type: 'received', ids: ['k1'] }));
  await sleep(200);
  assert.equal((await fakeStore.pending('CONFIRM')).length, 0, 'confirmed messages should be dropped');

  her.close();
  him.close();
});

test('several held messages arrive in the order they were sent', async () => {
  lists.clear();
  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'ORDER1', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');

  for (const [id, symbols] of [['a', '.-'], ['b', '-...'], ['c', '-.-.']]) {
    her.send(JSON.stringify({ type: 'morse', symbols, id }));
  }
  await sleep(300);
  her.close();
  await sleep(150);

  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'ORDER1', clientId: 'his-phone' }));
  await sleep(400);

  const got = him.inbox.filter((m) => m.type === 'morse').map((m) => m.symbols);
  assert.deepEqual(got, ['.-', '-...', '-.-.'], 'order must be preserved');
  him.close();
});

test('live delivery still works, and is not doubled by the held copy', async () => {
  lists.clear();
  const her = await connect();
  const him = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'LIVE01' }));
  him.send(JSON.stringify({ type: 'join', room: 'LIVE01' }));
  await waitFor(him, (m) => m.type === 'joined', 'both in');

  him.inbox.length = 0;
  her.send(JSON.stringify({ type: 'morse', symbols: '.', id: 'e1' }));
  await waitFor(him, (m) => m.type === 'morse', 'live delivery');
  await sleep(300);

  assert.equal(him.inbox.filter((m) => m.type === 'morse').length, 1, 'exactly one copy');
  her.close();
  him.close();
});

test('storage failing must not break the live relay', async () => {
  lists.clear();
  const broken = { ...fakeStore, hold: async () => { throw new Error('storage down'); } };
  const saved = fakeStore.hold;
  fakeStore.hold = broken.hold;

  const her = await connect();
  const him = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'BROKEN' }));
  him.send(JSON.stringify({ type: 'join', room: 'BROKEN' }));
  await waitFor(him, (m) => m.type === 'joined', 'both in');

  her.send(JSON.stringify({ type: 'morse', symbols: '...', id: 'x' }));
  const got = await waitFor(him, (m) => m.type === 'morse', 'still delivered live');
  assert.equal(got.symbols, '...');

  fakeStore.hold = saved;
  her.close();
  him.close();
});

test.after(() => {
  wss.close();
  server.close();
});

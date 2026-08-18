/**
 * Notifications: sent to the right people, never to the sender, never
 * revealing the message, and never able to break message delivery.
 *
 * Both Upstash and Expo's push service are replaced with stand-ins.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const WebSocket = require('ws');
const Module = require('node:module');

/* ---- stand-ins, installed before the server loads ---- */
const lists = new Map();
const delivered = new Map();
const handouts = new Map();
const tokens = new Map(); // room -> Map(clientId -> token)
const sent = [];
let pushShouldFail = false;
let deadTokens = [];

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
  },
  async pending(room) {
    return [...(lists.get(room) ?? [])];
  },
  async forget(room, ids) {
    lists.set(room, (lists.get(room) ?? []).filter((m) => !ids.includes(m.id)));
  },
  async rememberToken(room, clientId, token) {
    if (!tokens.has(room)) tokens.set(room, new Map());
    tokens.get(room).set(clientId, token);
  },
  async tokensFor(room, exceptClientId) {
    const map = tokens.get(room) ?? new Map();
    return [...map.entries()]
      .filter(([id]) => id !== exceptClientId)
      .map(([clientId, token]) => ({ clientId, token }));
  },
  async forgetToken(room, token) {
    const map = tokens.get(room);
    if (!map) return;
    for (const [id, value] of map.entries()) if (value === token) map.delete(id);
  },
  async health() {
    return { storage: 'ok' };
  },
};

const fakePush = {
  async notify(recipients) {
    if (pushShouldFail) throw new Error('push service down');
    sent.push({
      to: recipients.map((r) => r.token),
      count: recipients[0]?.count,
      recipients: [...recipients],
    });
    return { dead: deadTokens };
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === './store') return fakeStore;
  if (path === './push') return fakePush;
  return originalRequire.apply(this, arguments);
};

process.env.PORT = process.env.PORT || '8822';
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

function reset() {
  lists.clear();
  tokens.clear();
  sent.length = 0;
  pushShouldFail = false;
  deadTokens = [];
}

test('an absent partner gets notified', async () => {
  reset();
  // He joins once with his phone, registering it, then leaves.
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'NOTIFY', clientId: 'his-phone', pushToken: 'ExpoPushToken[him]' }));
  await waitFor(him, (m) => m.type === 'joined', 'he joined');
  him.close();
  await sleep(150);

  // She sends while he's away.
  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'NOTIFY', clientId: 'her-phone', pushToken: 'ExpoPushToken[her]' }));
  await waitFor(her, (m) => m.type === 'joined', 'she joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '.. / .-.. --- ...- . / -.-- --- ..-', id: 'n1' }));
  await waitFor(her, (m) => m.type === 'ack', 'ack');
  await sleep(300);

  assert.equal(sent.length, 1, 'exactly one notification');
  assert.deepEqual(sent[0].to, ['ExpoPushToken[him]'], 'to him, not her');
  her.close();
});

test('the notification carries the morse, but never the decoded letters', async () => {
  reset();
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'SECRET', clientId: 'his-phone', pushToken: 'ExpoPushToken[him]' }));
  await waitFor(him, (m) => m.type === 'joined', 'joined');
  him.close();
  await sleep(150);

  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'SECRET', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '... --- ...', id: 'n2' }));
  await sleep(300);

  const payload = JSON.stringify(sent);
  // The dots and dashes are shown - reading them is the point.
  assert.ok(payload.includes('... --- ...'), 'the morse should be passed to the notification');
  // The answer is not.
  assert.ok(!payload.toUpperCase().includes('SOS'), 'the decoded text must never appear');
  her.close();
});

test('nobody is notified when the partner is right there', async () => {
  reset();
  const her = await connect();
  const him = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'BOTH01', clientId: 'her-phone' }));
  him.send(JSON.stringify({ type: 'join', room: 'BOTH01', clientId: 'his-phone', pushToken: 'ExpoPushToken[him]' }));
  await waitFor(him, (m) => m.type === 'joined', 'both in');

  her.send(JSON.stringify({ type: 'morse', symbols: '.', id: 'n3' }));
  await waitFor(him, (m) => m.type === 'morse', 'delivered live');
  await sleep(300);

  assert.equal(sent.length, 0, 'no notification when it was delivered live');
  her.close();
  him.close();
});

test('you are never notified about your own message', async () => {
  reset();
  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'SOLO02', clientId: 'her-phone', pushToken: 'ExpoPushToken[her]' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '.-', id: 'n4' }));
  await sleep(300);

  assert.equal(sent.length, 0, 'she is the only one there, and it is her message');
  her.close();
});

test('several waiting messages are counted, not listed', async () => {
  reset();
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'COUNT1', clientId: 'his-phone', pushToken: 'ExpoPushToken[him]' }));
  await waitFor(him, (m) => m.type === 'joined', 'joined');
  him.close();
  await sleep(150);

  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'COUNT1', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  for (const id of ['a', 'b', 'c']) {
    her.send(JSON.stringify({ type: 'morse', symbols: '.', id }));
    await sleep(120);
  }
  await sleep(300);

  const last = sent[sent.length - 1];
  assert.equal(last.count, 3, 'the third notification should say three are waiting');
  her.close();
});

test('a dead token is forgotten', async () => {
  reset();
  deadTokens = ['ExpoPushToken[gone]'];
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'DEAD01', clientId: 'his-phone', pushToken: 'ExpoPushToken[gone]' }));
  await waitFor(him, (m) => m.type === 'joined', 'joined');
  him.close();
  await sleep(150);

  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'DEAD01', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '.', id: 'n5' }));
  await sleep(400);

  assert.equal(await fakeStore.tokensFor('DEAD01', 'her-phone').then((t) => t.length), 0,
    'an uninstalled app should stop being notified');
  her.close();
});

test('the push service failing must not affect messages', async () => {
  reset();
  pushShouldFail = true;

  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'PFAIL1', clientId: 'his-phone', pushToken: 'ExpoPushToken[him]' }));
  await waitFor(him, (m) => m.type === 'joined', 'joined');
  him.close();
  await sleep(150);

  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'PFAIL1', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '...', id: 'n6' }));
  const ack = await waitFor(her, (m) => m.type === 'ack', 'still acked');
  assert.equal(ack.deliveredTo, 0);
  her.close();
  await sleep(150);

  // And the message is still there for him.
  const himAgain = await connect();
  himAgain.send(JSON.stringify({ type: 'join', room: 'PFAIL1', clientId: 'his-phone' }));
  const got = await waitFor(himAgain, (m) => m.type === 'morse', 'still delivered');
  assert.equal(got.symbols, '...');
  himAgain.close();
});

test('a phone with notifications turned off still works normally', async () => {
  reset();
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'NOPUSH', clientId: 'his-phone' }));
  await waitFor(him, (m) => m.type === 'joined', 'joined without a token');
  him.close();
  await sleep(150);

  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'NOPUSH', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  her.send(JSON.stringify({ type: 'morse', symbols: '-.-', id: 'n7' }));
  await sleep(300);
  assert.equal(sent.length, 0, 'nothing to notify, and that is fine');
  her.close();

  const himAgain = await connect();
  himAgain.send(JSON.stringify({ type: 'join', room: 'NOPUSH', clientId: 'his-phone' }));
  const got = await waitFor(himAgain, (m) => m.type === 'morse', 'message still waiting');
  assert.equal(got.symbols, '-.-');
  himAgain.close();
});

test.after(() => {
  wss.close();
  server.close();
});

test('the notification shows the morse but never the letters', async () => {
  reset();
  const him = await connect();
  him.send(JSON.stringify({ type: 'join', room: 'SHOWM', clientId: 'his-phone', pushToken: 'ExpoPushToken[him]' }));
  await waitFor(him, (m) => m.type === 'joined', 'joined');
  him.close();
  await sleep(150);

  const her = await connect();
  her.send(JSON.stringify({ type: 'join', room: 'SHOWM', clientId: 'her-phone' }));
  await waitFor(her, (m) => m.type === 'joined', 'joined');
  // "SOS"
  her.send(JSON.stringify({ type: 'morse', symbols: '... --- ...', id: 'p1' }));
  await sleep(300);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipients[0].symbols, '... --- ...', 'the morse must be passed through');
  her.close();
});

test('a long message is trimmed between letters, not mid-letter', async () => {
  const { notify } = require('./push.js');
  // Reach the trimming through the real module by capturing the request.
  const originalFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, options) => {
    captured = JSON.parse(options.body);
    return { ok: true, json: async () => ({ data: captured.map(() => ({ status: 'ok' })) }) };
  };

  const long = Array.from({ length: 30 }, () => '...').join(' ');
  await notify([{ token: 'ExpoPushToken[x]', symbols: long, count: 1 }]);
  global.fetch = originalFetch;

  const body = captured[0].body;
  assert.ok(body.length <= 60, `body should be trimmed, was ${body.length}`);
  assert.ok(body.endsWith('…'), 'a trimmed message should say so');
  assert.ok(!body.includes('..…'), 'it must not cut in the middle of a letter');
  assert.match(body, /^[.\-\s/…]+$/, 'still only morse, never letters');
});

test('the payload never contains decoded letters', async () => {
  const { notify } = require('./push.js');
  const originalFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, options) => {
    captured = JSON.parse(options.body);
    return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
  };

  await notify([{ token: 'ExpoPushToken[x]', symbols: '.. / .-.. --- ...- . / -.-- --- ..-', count: 1 }]);
  global.fetch = originalFetch;

  const text = JSON.stringify(captured).toUpperCase();
  for (const word of ['I LOVE YOU', 'ILOVEYOU', 'LOVE']) {
    assert.ok(!text.includes(word), `the notification must not contain "${word}"`);
  }
});

/**
 * The v014 bug, reproduced and then proved fixed.
 *
 * A message sent while the peer is away must NOT be reported as
 * delivered, and must actually arrive once the peer comes back.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const WebSocket = require('ws');

process.env.PORT = process.env.PORT || '8799';
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

test('a message sent while the partner is away is NOT reported delivered', async () => {
  const alice = await connect();
  const bob = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'DROPPED' }));
  bob.send(JSON.stringify({ type: 'join', room: 'DROPPED' }));
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  // First message lands while both are present - this one worked in v014 too.
  alice.send(JSON.stringify({ type: 'morse', symbols: '...', id: 'first' }));
  const firstAck = await waitFor(alice, (m) => m.type === 'ack' && m.id === 'first', 'first ack');
  assert.equal(firstAck.deliveredTo, 1);
  await waitFor(bob, (m) => m.type === 'morse', 'bob got the first');

  // Bob's app reloads - exactly what happened on the simulator.
  bob.close();
  await sleep(200);

  alice.send(JSON.stringify({ type: 'morse', symbols: '.- .-.. .-..', id: 'second' }));
  const secondAck = await waitFor(alice, (m) => m.type === 'ack' && m.id === 'second', 'second ack');

  // THE BUG: v014 showed this as "Sent". It must now say nobody got it.
  assert.equal(secondAck.deliveredTo, 0, 'the app must not claim this was delivered');

  alice.close();
});

test('a queued message arrives once the partner comes back', async () => {
  const alice = await connect();
  let bob = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'REJOIN' }));
  bob.send(JSON.stringify({ type: 'join', room: 'REJOIN' }));
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  bob.close();
  await sleep(200);

  // Alice sends into the void; the app keeps it queued.
  alice.send(JSON.stringify({ type: 'morse', symbols: '... --- ...', id: 'held' }));
  const ack = await waitFor(alice, (m) => m.type === 'ack' && m.id === 'held', 'ack');
  assert.equal(ack.deliveredTo, 0);

  // Bob returns, and the app resends what it held.
  bob = await connect();
  bob.send(JSON.stringify({ type: 'join', room: 'REJOIN' }));
  await waitFor(bob, (m) => m.type === 'joined', 'bob rejoined');
  await waitFor(alice, (m) => m.type === 'peers' && m.count === 1, 'alice sees bob');

  alice.send(JSON.stringify({ type: 'morse', symbols: '... --- ...', id: 'held' }));
  const resent = await waitFor(bob, (m) => m.type === 'morse', 'bob finally got it');
  assert.equal(resent.symbols, '... --- ...');

  const secondAck = await waitFor(
    alice,
    (m) => m.type === 'ack' && m.id === 'held' && m.deliveredTo === 1,
    'delivered ack'
  );
  assert.equal(secondAck.deliveredTo, 1);

  alice.close();
  bob.close();
});

test('several messages in a row are each acked separately', async () => {
  const alice = await connect();
  const bob = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'BURST1' }));
  bob.send(JSON.stringify({ type: 'join', room: 'BURST1' }));
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  alice.inbox.length = 0;
  bob.inbox.length = 0;
  const ids = ['m1', 'm2', 'm3', 'm4', 'm5'];
  for (const id of ids) alice.send(JSON.stringify({ type: 'morse', symbols: '.', id }));
  await sleep(400);

  const acks = alice.inbox.filter((m) => m.type === 'ack');
  assert.deepEqual(acks.map((a) => a.id), ids, 'every message must be accounted for');
  assert.ok(acks.every((a) => a.deliveredTo === 1));
  assert.equal(bob.inbox.filter((m) => m.type === 'morse').length, 5, 'all five must arrive');

  alice.close();
  bob.close();
});

test.after(() => {
  wss.close();
  server.close();
});

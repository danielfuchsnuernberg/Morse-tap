/**
 * Live integration test: boots the real server, connects real WebSocket
 * clients, and asserts messages actually get relayed.
 *
 *   npm test
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const WebSocket = require('ws');

process.env.PORT = process.env.PORT || '8791';
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

/** Wait until a message matching the predicate arrives, or fail. */
function waitFor(socket, predicate, label, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const existing = socket.inbox.find(predicate);
    if (existing) return resolve(existing);

    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`timed out waiting for ${label}`));
    }, timeout);

    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (predicate(message)) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(message);
      }
    }
    socket.on('message', onMessage);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('health endpoint responds', async () => {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');
});

test('a client can join a room', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'test1' }));
  const joined = await waitFor(alice, (m) => m.type === 'joined', 'joined');
  assert.equal(joined.room, 'TEST1');
  alice.close();
});

test('room codes are normalised to uppercase alphanumerics', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: ' ab-c 1! ' }));
  const joined = await waitFor(alice, (m) => m.type === 'joined', 'joined');
  assert.equal(joined.room, 'ABC1');
  alice.close();
});

test('short room codes are rejected', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'ab' }));
  const error = await waitFor(alice, (m) => m.type === 'error', 'error');
  assert.equal(error.reason, 'room-too-short');
  alice.close();
});

test('morse is relayed from one phone to the other', async () => {
  const alice = await connect();
  const bob = await connect();

  alice.send(JSON.stringify({ type: 'join', room: 'RELAY' }));
  bob.send(JSON.stringify({ type: 'join', room: 'RELAY' }));
  await waitFor(alice, (m) => m.type === 'joined', 'alice joined');
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  alice.send(JSON.stringify({ type: 'morse', symbols: '... --- ...' }));

  const received = await waitFor(bob, (m) => m.type === 'morse', 'relayed morse');
  assert.equal(received.symbols, '... --- ...');
  assert.equal(typeof received.sentAt, 'number');

  alice.close();
  bob.close();
});

test('the sender does not receive their own message back', async () => {
  const alice = await connect();
  const bob = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'ECHO1' }));
  bob.send(JSON.stringify({ type: 'join', room: 'ECHO1' }));
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  alice.inbox.length = 0;
  alice.send(JSON.stringify({ type: 'morse', symbols: '.-' }));
  await waitFor(bob, (m) => m.type === 'morse', 'bob got it');
  await sleep(150);

  assert.equal(alice.inbox.filter((m) => m.type === 'morse').length, 0);
  alice.close();
  bob.close();
});

test('messages do not leak between different rooms', async () => {
  const alice = await connect();
  const stranger = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'ROOMA' }));
  stranger.send(JSON.stringify({ type: 'join', room: 'ROOMB' }));
  await waitFor(alice, (m) => m.type === 'joined', 'alice joined');
  await waitFor(stranger, (m) => m.type === 'joined', 'stranger joined');

  stranger.inbox.length = 0;
  alice.send(JSON.stringify({ type: 'morse', symbols: '... --- ...' }));
  await sleep(250);

  assert.equal(stranger.inbox.filter((m) => m.type === 'morse').length, 0);
  alice.close();
  stranger.close();
});

test('peer count updates when someone joins and leaves', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'PEERS' }));
  const alone = await waitFor(alice, (m) => m.type === 'peers', 'first peer count');
  assert.equal(alone.count, 0);

  alice.inbox.length = 0;
  const bob = await connect();
  bob.send(JSON.stringify({ type: 'join', room: 'PEERS' }));
  const paired = await waitFor(alice, (m) => m.type === 'peers' && m.count === 1, 'paired');
  assert.equal(paired.count, 1);

  alice.inbox.length = 0;
  bob.close();
  const alonAgain = await waitFor(alice, (m) => m.type === 'peers' && m.count === 0, 'unpaired');
  assert.equal(alonAgain.count, 0);
  alice.close();
});

test('sending morse before joining a room is rejected', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'morse', symbols: '.-' }));
  const error = await waitFor(alice, (m) => m.type === 'error', 'error');
  assert.equal(error.reason, 'not-in-room');
  alice.close();
});

test('malformed json does not crash the server', async () => {
  const alice = await connect();
  alice.send('this is not json');
  const error = await waitFor(alice, (m) => m.type === 'error', 'error');
  assert.equal(error.reason, 'bad-json');
  alice.close();
});

test('empty rooms are cleaned up so memory does not leak', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'TEMPROOM' }));
  await waitFor(alice, (m) => m.type === 'joined', 'joined');
  assert.ok(rooms.has('TEMPROOM'));

  alice.close();
  await sleep(250);
  assert.equal(rooms.has('TEMPROOM'), false);
});

test.after(() => {
  wss.close();
  server.close();
});

test('the sender is told how many people received it', async () => {
  const alice = await connect();
  const bob = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'ACKROOM' }));
  bob.send(JSON.stringify({ type: 'join', room: 'ACKROOM' }));
  await waitFor(alice, (m) => m.type === 'joined', 'alice joined');
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  alice.send(JSON.stringify({ type: 'morse', symbols: '...', id: 'abc' }));
  const ack = await waitFor(alice, (m) => m.type === 'ack', 'ack');
  assert.equal(ack.id, 'abc', 'the ack must name the message');
  assert.equal(ack.deliveredTo, 1);

  alice.close();
  bob.close();
});

test('sending into an empty room is acked as delivered to nobody', async () => {
  const alice = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'ALONE1' }));
  await waitFor(alice, (m) => m.type === 'joined', 'joined');

  alice.send(JSON.stringify({ type: 'morse', symbols: '...', id: 'lonely' }));
  const ack = await waitFor(alice, (m) => m.type === 'ack', 'ack');
  assert.equal(ack.deliveredTo, 0, 'nobody was there, and the app must know');
  alice.close();
});

test('every message gets exactly one ack', async () => {
  const alice = await connect();
  const bob = await connect();
  alice.send(JSON.stringify({ type: 'join', room: 'ONEACK' }));
  bob.send(JSON.stringify({ type: 'join', room: 'ONEACK' }));
  await waitFor(bob, (m) => m.type === 'joined', 'bob joined');

  alice.inbox.length = 0;
  for (const id of ['a', 'b', 'c']) {
    alice.send(JSON.stringify({ type: 'morse', symbols: '.', id }));
  }
  await sleep(300);

  const acks = alice.inbox.filter((m) => m.type === 'ack');
  assert.equal(acks.length, 3);
  assert.deepEqual(acks.map((a) => a.id), ['a', 'b', 'c']);
  alice.close();
  bob.close();
});

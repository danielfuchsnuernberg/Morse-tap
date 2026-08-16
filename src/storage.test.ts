import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePrefs,
  parseSession,
  parseMessages,
  trimMessages,
  highestIdNumber,
  EMPTY_SESSION,
  MAX_STORED_MESSAGES,
} from './storage';
import { DEFAULT_PREFS } from './settings';
import { ECHO_START, EMPTY_PUZZLE } from './morse';
import type { Message } from './screens/KeyScreen';

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  mine: false,
  symbols: '... --- ...',
  at: 1000,
  puzzle: EMPTY_PUZZLE,
  echo: ECHO_START,
  delivery: 'none',
  ...over,
});

/* ---------------- prefs ---------------- */

test('nothing stored gives the defaults', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
});

test('corrupt json never throws', () => {
  assert.deepEqual(parsePrefs('{not json'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('null'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('"a string"'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('[]'), DEFAULT_PREFS);
});

test('stored prefs come back intact', () => {
  const saved = { ...DEFAULT_PREFS, mode: 'farnsworth' as const, charWpm: 20, effectiveWpm: 7 };
  assert.deepEqual(parsePrefs(JSON.stringify(saved)), saved);
});

test('a setting added in a later version is filled in', () => {
  const old = { mode: 'beginner', beginnerWpm: 8 };
  const parsed = parsePrefs(JSON.stringify(old));
  assert.equal(parsed.beginnerWpm, 8, 'kept what was stored');
  assert.equal(parsed.decodeStyle, DEFAULT_PREFS.decodeStyle, 'filled in the missing one');
  assert.equal(parsed.serverUrl, DEFAULT_PREFS.serverUrl);
});

test('a nonsense mode falls back rather than breaking', () => {
  assert.equal(parsePrefs(JSON.stringify({ mode: 'wizard' })).mode, 'beginner');
  assert.equal(parsePrefs(JSON.stringify({ decodeStyle: 'telepathy' })).decodeStyle, 'echo');
});

test('a nonsense speed falls back to the default', () => {
  const parsed = parsePrefs(JSON.stringify({ beginnerWpm: 'fast', charWpm: null }));
  assert.equal(parsed.beginnerWpm, DEFAULT_PREFS.beginnerWpm);
  assert.equal(parsed.charWpm, DEFAULT_PREFS.charWpm);
});

test('an impossible speed pair is corrected on load', () => {
  const parsed = parsePrefs(JSON.stringify({ mode: 'farnsworth', charWpm: 10, effectiveWpm: 15 }));
  assert.ok(parsed.effectiveWpm <= parsed.charWpm);
});

test('switches off stay off, and are not clobbered by defaults', () => {
  const parsed = parsePrefs(JSON.stringify({ soundOn: false, hapticsOn: false }));
  assert.equal(parsed.soundOn, false);
  assert.equal(parsed.hapticsOn, false);
});

test('an empty server url falls back so the app is never unusable', () => {
  assert.equal(parsePrefs(JSON.stringify({ serverUrl: '' })).serverUrl, DEFAULT_PREFS.serverUrl);
});

/* ---------------- session ---------------- */

test('no session means no room and no auto-join', () => {
  assert.deepEqual(parseSession(null), EMPTY_SESSION);
  assert.deepEqual(parseSession('broken'), EMPTY_SESSION);
});

test('a saved room comes back and rejoins', () => {
  const parsed = parseSession(JSON.stringify({ room: 'BANANA7', autoJoin: true }));
  assert.equal(parsed.room, 'BANANA7');
  assert.ok(parsed.autoJoin);
});

test('a room too short to be valid never auto-joins', () => {
  assert.equal(parseSession(JSON.stringify({ room: 'AB', autoJoin: true })).autoJoin, false);
});

test('a room saved without auto-join is remembered but not rejoined', () => {
  const parsed = parseSession(JSON.stringify({ room: 'BANANA7', autoJoin: false }));
  assert.equal(parsed.room, 'BANANA7');
  assert.equal(parsed.autoJoin, false);
});

/* ---------------- messages ---------------- */

test('no messages stored gives an empty log', () => {
  assert.deepEqual(parseMessages(null), []);
  assert.deepEqual(parseMessages('{}'), []);
  assert.deepEqual(parseMessages('nonsense'), []);
});

test('a stored message round-trips with its decoding progress', () => {
  const saved = [
    message({ id: 'm4', echo: { ...ECHO_START, solved: [0, 1], misses: 1 } }),
  ];
  const parsed = parseMessages(JSON.stringify(saved));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'm4');
  assert.deepEqual(parsed[0].echo.solved, [0, 1], 'half-finished decoding should survive a restart');
  assert.equal(parsed[0].echo.misses, 1);
});

test('malformed entries are dropped, good ones kept', () => {
  const mixed = [message({ id: 'ok' }), { id: 5 }, null, { id: 'x', symbols: '' }, 'text'];
  const parsed = parseMessages(JSON.stringify(mixed));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'ok');
});

test('a message saved before echo existed still loads', () => {
  const old = [{ id: 'm1', mine: false, symbols: '...', at: 5 }];
  const parsed = parseMessages(JSON.stringify(old));
  assert.deepEqual(parsed[0].echo, ECHO_START);
  assert.deepEqual(parsed[0].puzzle, EMPTY_PUZZLE);
});

test('the log is capped, keeping the newest', () => {
  const many = Array.from({ length: MAX_STORED_MESSAGES + 50 }, (_, index) =>
    message({ id: `m${index}` })
  );
  const trimmed = trimMessages(many);
  assert.equal(trimmed.length, MAX_STORED_MESSAGES);
  assert.equal(trimmed[trimmed.length - 1].id, `m${MAX_STORED_MESSAGES + 49}`);
  assert.equal(parseMessages(JSON.stringify(many)).length, MAX_STORED_MESSAGES);
});

/* ---------------- ids ---------------- */

test('new ids continue from the restored ones instead of colliding', () => {
  const restored = [message({ id: 'm3' }), message({ id: 'm17' }), message({ id: 'm9' })];
  assert.equal(highestIdNumber(restored), 17);
});

test('an empty or odd log starts ids from zero', () => {
  assert.equal(highestIdNumber([]), 0);
  assert.equal(highestIdNumber([message({ id: 'weird' })]), 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFS, timingFor, usesSpaceButton, allowsTimedWordBreak, clampEffective, usesEchoDecoding,
  CHAR_SPEEDS, EFFECTIVE_SPEEDS, BEGINNER_SPEEDS, stepValue, atLimit, nearestIn, type Prefs,
} from './settings';
import { evenTiming, farnsworthTiming } from './morse';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

test('beginner is the default, with the Space button', () => {
  assert.equal(DEFAULT_PREFS.mode, 'beginner');
  assert.ok(usesSpaceButton(DEFAULT_PREFS));
  assert.equal(allowsTimedWordBreak(DEFAULT_PREFS), false);
});

test('farnsworth drops the Space button and uses real pauses', () => {
  const p = prefs({ mode: 'farnsworth' });
  assert.equal(usesSpaceButton(p), false);
  assert.ok(allowsTimedWordBreak(p));
});

test('the two modes never both apply', () => {
  for (const mode of ['beginner', 'farnsworth'] as const) {
    const p = prefs({ mode });
    assert.notEqual(usesSpaceButton(p), allowsTimedWordBreak(p));
  }
});

test('timing follows the selected mode', () => {
  assert.deepEqual(timingFor(prefs({ beginnerWpm: 5 })), evenTiming(5));
  assert.deepEqual(
    timingFor(prefs({ mode: 'farnsworth', charWpm: 18, effectiveWpm: 9 })),
    farnsworthTiming(18, 9)
  );
});

test('effective speed is clamped to the character speed', () => {
  const p = clampEffective(prefs({ charWpm: 13, effectiveWpm: 15 }));
  assert.ok(p.effectiveWpm <= 13);
});

test('a valid effective speed is left alone', () => {
  const p = prefs({ charWpm: 18, effectiveWpm: 9 });
  assert.deepEqual(clampEffective(p), p);
});

test('every offered combination produces usable timing', () => {
  for (const charWpm of CHAR_SPEEDS) {
    for (const effectiveWpm of EFFECTIVE_SPEEDS) {
      const p = clampEffective(prefs({ mode: 'farnsworth', charWpm, effectiveWpm }));
      const timing = timingFor(p);
      assert.ok(timing.charUnitMs > 0, `${charWpm}/${effectiveWpm} char unit`);
      assert.ok(timing.letterGapMs > timing.charUnitMs, `${charWpm}/${effectiveWpm} letter gap`);
      assert.ok(timing.wordGapMs > timing.letterGapMs, `${charWpm}/${effectiveWpm} word gap`);
    }
  }
});

test('every beginner speed produces usable timing', () => {
  for (const wpm of BEGINNER_SPEEDS) {
    const timing = timingFor(prefs({ beginnerWpm: wpm }));
    assert.ok(timing.charUnitMs > 0);
    assert.ok(timing.wordGapMs > timing.letterGapMs);
  }
});

test('decoding by ear is the default', () => {
  assert.equal(DEFAULT_PREFS.decodeStyle, 'echo');
  assert.ok(usesEchoDecoding(DEFAULT_PREFS));
});

test('typing can be chosen instead', () => {
  assert.equal(usesEchoDecoding(prefs({ decodeStyle: 'type' })), false);
});

test('decode style is independent of the timing mode', () => {
  for (const mode of ['beginner', 'farnsworth'] as const) {
    for (const decodeStyle of ['echo', 'type'] as const) {
      const p = prefs({ mode, decodeStyle });
      assert.equal(usesEchoDecoding(p), decodeStyle === 'echo');
      assert.ok(timingFor(p).charUnitMs > 0);
    }
  }
});

/* ---------------- speed ladders ---------------- */

test('the ladders are sorted and free of duplicates', () => {
  for (const ladder of [BEGINNER_SPEEDS, CHAR_SPEEDS, EFFECTIVE_SPEEDS]) {
    assert.deepEqual([...ladder].sort((a, b) => a - b), ladder);
    assert.equal(new Set(ladder).size, ladder.length);
  }
});

test('the old speeds are all still available', () => {
  for (const wpm of [5, 8, 12, 16, 20]) assert.ok(BEGINNER_SPEEDS.includes(wpm), `beginner ${wpm}`);
  for (const wpm of [13, 15, 18, 20, 25]) assert.ok(CHAR_SPEEDS.includes(wpm), `char ${wpm}`);
  for (const wpm of [5, 7, 9, 12, 15]) assert.ok(EFFECTIVE_SPEEDS.includes(wpm), `effective ${wpm}`);
});

test('farnsworth ladders now reach lower than before', () => {
  assert.ok(Math.min(...CHAR_SPEEDS) < 13);
  assert.ok(Math.min(...EFFECTIVE_SPEEDS) < 5);
});

test('stepping moves exactly one rung', () => {
  assert.equal(stepValue(BEGINNER_SPEEDS, 5, 1), 6);
  assert.equal(stepValue(BEGINNER_SPEEDS, 5, -1), 4);
  assert.equal(stepValue(BEGINNER_SPEEDS, 12, 1), 14);
});

test('stepping stops at the ends instead of wrapping', () => {
  const lowest = BEGINNER_SPEEDS[0];
  const highest = BEGINNER_SPEEDS[BEGINNER_SPEEDS.length - 1];
  assert.equal(stepValue(BEGINNER_SPEEDS, lowest, -1), lowest);
  assert.equal(stepValue(BEGINNER_SPEEDS, highest, 1), highest);
  assert.ok(atLimit(BEGINNER_SPEEDS, lowest, -1));
  assert.ok(atLimit(BEGINNER_SPEEDS, highest, 1));
  assert.equal(atLimit(BEGINNER_SPEEDS, lowest, 1), false);
});

test('the effective speed can never step above the character speed', () => {
  const ceiling = 10;
  let value = 2;
  for (let i = 0; i < 40; i++) value = stepValue(EFFECTIVE_SPEEDS, value, 1, ceiling);
  assert.ok(value <= ceiling, `stepped up to ${value}`);
});

test('snapping picks the closest rung', () => {
  assert.equal(nearestIn(BEGINNER_SPEEDS, 11), 10);
  assert.equal(nearestIn(BEGINNER_SPEEDS, 13), 12);
  assert.equal(nearestIn(BEGINNER_SPEEDS, 100), 20);
  assert.equal(nearestIn(BEGINNER_SPEEDS, 0), 3);
});

test('walking the whole beginner ladder visits every rung once', () => {
  const seen: number[] = [];
  let value = BEGINNER_SPEEDS[0];
  for (let i = 0; i < 100; i++) {
    seen.push(value);
    const next = stepValue(BEGINNER_SPEEDS, value, 1);
    if (next === value) break;
    value = next;
  }
  assert.deepEqual(seen, BEGINNER_SPEEDS);
});

test('a slower speed always means a longer dot and longer gaps', () => {
  for (let i = 1; i < BEGINNER_SPEEDS.length; i++) {
    const slower = timingFor(prefs({ beginnerWpm: BEGINNER_SPEEDS[i - 1] }));
    const faster = timingFor(prefs({ beginnerWpm: BEGINNER_SPEEDS[i] }));
    assert.ok(slower.charUnitMs > faster.charUnitMs, `${BEGINNER_SPEEDS[i]}`);
    assert.ok(slower.letterGapMs > faster.letterGapMs, `${BEGINNER_SPEEDS[i]} gap`);
  }
});

test('the screen is allowed to sleep by default', () => {
  assert.equal(DEFAULT_PREFS.keepAwake, false);
});

test('keeping the screen awake is independent of everything else', () => {
  for (const mode of ['beginner', 'farnsworth'] as const) {
    for (const keepAwake of [true, false]) {
      const p = prefs({ mode, keepAwake });
      assert.equal(p.keepAwake, keepAwake);
      assert.ok(timingFor(p).charUnitMs > 0);
    }
  }
});

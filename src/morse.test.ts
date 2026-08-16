import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MORSE_TABLE,
  REVERSE_TABLE,
  encodeText,
  decodeMorse,
  pressToSymbol,
  gapToKind,
  applyPress,
  undoLast,
  morseToTimeline,
  timelineDuration,
  unitMsForWpm,
  LETTER_CHART,
  NUMBER_CHART,
  splitLetters,
  buildSchedule,
  answerLetters,
  markGuess,
  isSolved,
  tileStates,
  nextHintIndex,
  isComplete,
  isCleanSolve,
  EMPTY_PUZZLE,
  type PuzzleState,
  liveSymbol,
  dashAtMs,
  letterClosesAtMs,
  wordClosesAtMs,
  dashProgress,
  letterProgress,
  compareToTarget,
  undoLastLetter,
  joinLetters,
  addWordBreak,
  hasPendingWordBreak,
  evenTiming,
  farnsworthTiming,
  dashThresholdMs,
  letterThresholdMs,
  wordThresholdMs,
  symbolForPress,
  kindForGap,
  applyPressWith,
  buildScheduleWith,
  type Timing,
  ECHO_START,
  echoTargetCode,
  echoComplete,
  echoHear,
  echoTap,
  echoUndo,
  echoGiveLetter,
  echoOpenUp,
  echoTiles,
  echoClean,
  echoSelect,
  echoProgress,
  echoIsDone,
  nextUnsolved,
  type EchoState,
} from './morse';

/* ---------------- table integrity ---------------- */

test('every morse code is unique', () => {
  const codes = Object.values(MORSE_TABLE);
  assert.equal(new Set(codes).size, codes.length);
});

test('reverse table round-trips every entry', () => {
  for (const [char, code] of Object.entries(MORSE_TABLE)) {
    assert.equal(REVERSE_TABLE[code], char);
  }
});

test('codes only contain dots and dashes', () => {
  for (const code of Object.values(MORSE_TABLE)) {
    assert.match(code, /^[.-]+$/);
  }
});

test('known letters match the ITU standard', () => {
  assert.equal(MORSE_TABLE.E, '.');
  assert.equal(MORSE_TABLE.T, '-');
  assert.equal(MORSE_TABLE.S, '...');
  assert.equal(MORSE_TABLE.O, '---');
  assert.equal(MORSE_TABLE.Q, '--.-');
  assert.equal(MORSE_TABLE['5'], '.....');
  assert.equal(MORSE_TABLE['0'], '-----');
});

/* ---------------- encoding ---------------- */

test('encodes a single word', () => {
  assert.equal(encodeText('SOS'), '... --- ...');
});

test('encodes multiple words with a slash separator', () => {
  assert.equal(encodeText('HI YOU'), '.... .. / -.-- --- ..-');
});

test('encoding is case insensitive', () => {
  assert.equal(encodeText('sos'), encodeText('SOS'));
});

test('collapses extra whitespace', () => {
  assert.equal(encodeText('  HI   YOU  '), '.... .. / -.-- --- ..-');
});

test('skips unsupported characters', () => {
  assert.equal(encodeText('A#B'), '.- -...');
});

test('empty input gives empty output', () => {
  assert.equal(encodeText(''), '');
  assert.equal(encodeText('   '), '');
});

/* ---------------- decoding ---------------- */

test('decodes a single word', () => {
  assert.equal(decodeMorse('... --- ...'), 'SOS');
});

test('decodes multiple words', () => {
  assert.equal(decodeMorse('.... .. / -.-- --- ..-'), 'HI YOU');
});

test('unknown codes become a question mark', () => {
  assert.equal(decodeMorse('.- ........'), 'A?');
});

test('tolerates messy spacing', () => {
  assert.equal(decodeMorse('  ...   ---  ...  '), 'SOS');
});

test('encode then decode round-trips', () => {
  for (const text of ['HELLO WORLD', 'SOS', 'MEET ME AT 5', 'ON MY WAY']) {
    assert.equal(decodeMorse(encodeText(text)), text);
  }
});

/* ---------------- tap timing ---------------- */

test('short press is a dit, long press is a dah', () => {
  const unit = 100;
  assert.equal(pressToSymbol(50, unit), '.');
  assert.equal(pressToSymbol(199, unit), '.');
  assert.equal(pressToSymbol(200, unit), '-');
  assert.equal(pressToSymbol(500, unit), '-');
});

test('gap classification uses the 2 and 5 unit thresholds', () => {
  const unit = 100;
  assert.equal(gapToKind(50, unit), 'same-letter');
  assert.equal(gapToKind(199, unit), 'same-letter');
  assert.equal(gapToKind(200, unit), 'new-letter');
  assert.equal(gapToKind(499, unit), 'new-letter');
  assert.equal(gapToKind(500, unit), 'new-word');
});

test('first press ignores the gap and starts fresh', () => {
  assert.equal(applyPress('', 9999, 50, 100), '.');
});

test('tapping out SOS builds the right string', () => {
  const unit = 100;
  let morse = '';
  const dit = () => 50;
  const dah = () => 300;

  morse = applyPress(morse, 0, dit(), unit);
  morse = applyPress(morse, 100, dit(), unit);
  morse = applyPress(morse, 100, dit(), unit);
  morse = applyPress(morse, 300, dah(), unit);
  morse = applyPress(morse, 100, dah(), unit);
  morse = applyPress(morse, 100, dah(), unit);
  morse = applyPress(morse, 300, dit(), unit);
  morse = applyPress(morse, 100, dit(), unit);
  morse = applyPress(morse, 100, dit(), unit);

  assert.equal(morse, '... --- ...');
  assert.equal(decodeMorse(morse), 'SOS');
});

test('a long pause only ends the letter, never starts a word', () => {
  const unit = 100;
  let morse = applyPress('', 0, 50, unit);
  morse = applyPress(morse, 800, 50, unit);
  assert.equal(morse, '. .');
  assert.equal(decodeMorse(morse), 'EE');
});

test('thinking for ten seconds does not split the word', () => {
  const unit = 100;
  let morse = applyPress('', 0, 50, unit);
  morse = applyPress(morse, 10000, 50, unit);
  assert.equal(morse.includes('/'), false);
});

/* ---------------- undo ---------------- */

test('undo removes one symbol at a time', () => {
  assert.equal(undoLast('...'), '..');
  assert.equal(undoLast(''), '');
});

test('undo removes a trailing separator cleanly', () => {
  assert.equal(undoLast('... -'), '...');
  assert.equal(undoLast('... / -'), '...');
});

test('undo repeated all the way down empties the string', () => {
  let morse = '.... .. / -.--';
  for (let i = 0; i < 50 && morse.length > 0; i++) morse = undoLast(morse);
  assert.equal(morse, '');
});

/* ---------------- playback ---------------- */

test('a single dit is one beat', () => {
  assert.deepEqual(morseToTimeline('.', 100), [{ on: true, ms: 100 }]);
});

test('a single dah is three units long', () => {
  assert.deepEqual(morseToTimeline('-', 100), [{ on: true, ms: 300 }]);
});

test('symbols inside a letter are separated by one unit', () => {
  assert.deepEqual(morseToTimeline('.-', 100), [
    { on: true, ms: 100 },
    { on: false, ms: 100 },
    { on: true, ms: 300 },
  ]);
});

test('letters are separated by three units', () => {
  assert.deepEqual(morseToTimeline('. .', 100), [
    { on: true, ms: 100 },
    { on: false, ms: 300 },
    { on: true, ms: 100 },
  ]);
});

test('words are separated by seven units', () => {
  assert.deepEqual(morseToTimeline('. / .', 100), [
    { on: true, ms: 100 },
    { on: false, ms: 700 },
    { on: true, ms: 100 },
  ]);
});

test('timeline never starts or ends with silence', () => {
  for (const morse of ['...', '.... .. / -.--', '-', '. / .']) {
    const beats = morseToTimeline(morse, 60);
    assert.equal(beats[0].on, true);
    assert.equal(beats[beats.length - 1].on, true);
  }
});

test('timeline never has two beats of the same state in a row', () => {
  const beats = morseToTimeline('.... . .-.. .-.. --- / .-- --- .-. .-.. -..', 60);
  for (let i = 1; i < beats.length; i++) {
    assert.notEqual(beats[i].on, beats[i - 1].on);
  }
});

test('SOS at 100ms per unit lasts 2700ms', () => {
  // 9 symbols: 6 dits (600) + 3 dahs (900) = 1500 on
  // 6 intra-letter gaps (600) + 2 inter-letter gaps (600) = 1200 off
  assert.equal(timelineDuration(morseToTimeline('... --- ...', 100)), 2700);
});

test('empty morse gives an empty timeline', () => {
  assert.deepEqual(morseToTimeline('', 100), []);
  assert.deepEqual(morseToTimeline('   ', 100), []);
});

/* ---------------- wpm ---------------- */

test('20 wpm is 60ms per unit', () => {
  assert.equal(unitMsForWpm(20), 60);
  assert.equal(unitMsForWpm(5), 240);
  assert.equal(unitMsForWpm(12), 100);
});

/* ---------------- chart ---------------- */

test('chart covers all 26 letters and 10 digits', () => {
  assert.equal(LETTER_CHART.length, 26);
  assert.equal(NUMBER_CHART.length, 10);
});

test('chart hints read as dit and dah', () => {
  const a = LETTER_CHART.find((row) => row.char === 'A');
  assert.equal(a?.code, '.-');
  assert.equal(a?.hint, 'dit dah');
});

/* ---------------- letter splitting ---------------- */

test('splits a single word into letters', () => {
  assert.deepEqual(splitLetters('... --- ...'), [
    { code: '...', startsWord: true },
    { code: '---', startsWord: false },
    { code: '...', startsWord: false },
  ]);
});

test('marks the first letter of each word', () => {
  const tokens = splitLetters('.... .. / -.--');
  assert.deepEqual(
    tokens.map((t) => t.startsWord),
    [true, false, true]
  );
});

test('word breaks are never their own token', () => {
  assert.equal(splitLetters('. / . / .').length, 3);
  assert.equal(splitLetters('').length, 0);
});

/* ---------------- schedule ---------------- */

test('schedule beats match the plain timeline', () => {
  for (const morse of ['...', '.... .. / -.--', '.-', '. / .']) {
    assert.deepEqual(buildSchedule(morse, 60).beats, morseToTimeline(morse, 60));
  }
});

test('first letter starts at zero', () => {
  const schedule = buildSchedule('... --- ...', 100);
  assert.equal(schedule.letters[0].startMs, 0);
});

test('letter windows line up with standard gaps', () => {
  // "S" = ... -> 100 + 100 + 100 + 100 + 100 = 500ms, then 300ms letter gap
  const schedule = buildSchedule('... ---', 100);
  assert.deepEqual(schedule.letters[0], {
    code: '...',
    startsWord: true,
    startMs: 0,
    endMs: 500,
  });
  assert.deepEqual(schedule.letters[1], {
    code: '---',
    startsWord: false,
    startMs: 800,
    endMs: 1900,
  });
});

test('a word gap pushes the next letter out by seven units', () => {
  const schedule = buildSchedule('. / .', 100);
  assert.equal(schedule.letters[0].endMs, 100);
  assert.equal(schedule.letters[1].startMs, 800);
});

test('letter windows never overlap and stay in order', () => {
  const schedule = buildSchedule(encodeText('HELLO WORLD'), 60);
  for (let i = 1; i < schedule.letters.length; i++) {
    assert.ok(schedule.letters[i].startMs >= schedule.letters[i - 1].endMs);
  }
});

test('total duration equals the sum of all beats', () => {
  const schedule = buildSchedule(encodeText('MEET ME AT 5'), 80);
  assert.equal(schedule.totalMs, timelineDuration(schedule.beats));
});

test('the last letter ends exactly when playback ends', () => {
  const schedule = buildSchedule('.... .. / -.-- --- ..-', 70);
  assert.equal(schedule.letters[schedule.letters.length - 1].endMs, schedule.totalMs);
});

test('one letter per token, matching the decoded text', () => {
  const morse = encodeText('HI YOU');
  assert.equal(buildSchedule(morse, 60).letters.length, 'HIYOU'.length);
});

/* ---------------- decode puzzle ---------------- */

test('answer strips word gaps', () => {
  assert.deepEqual(answerLetters(encodeText('HI YOU')), ['H', 'I', 'Y', 'O', 'U']);
});

test('an empty guess marks everything blank', () => {
  assert.deepEqual(markGuess('... --- ...', ''), ['blank', 'blank', 'blank']);
});

test('correct letters are marked correct', () => {
  assert.deepEqual(markGuess('... --- ...', 'SOS'), ['correct', 'correct', 'correct']);
});

test('wrong letters are marked wrong, later ones stay blank', () => {
  assert.deepEqual(markGuess('... --- ...', 'SX'), ['correct', 'wrong', 'blank']);
});

test('guessing is case insensitive', () => {
  assert.deepEqual(markGuess('... --- ...', 'sos'), ['correct', 'correct', 'correct']);
});

test('spaces in the guess are ignored so the user need not place them', () => {
  assert.ok(isSolved(encodeText('HI YOU'), 'hi you'));
  assert.ok(isSolved(encodeText('HI YOU'), 'HIYOU'));
});

test('a partial guess is not solved', () => {
  assert.equal(isSolved('... --- ...', 'SO'), false);
  assert.equal(isSolved('... --- ...', 'SOX'), false);
});

test('an over-long guess does not falsely solve', () => {
  assert.ok(isSolved('... --- ...', 'SOSSS'));
  assert.deepEqual(markGuess('... --- ...', 'SOSSS').length, 3);
});

test('empty morse is never solved', () => {
  assert.equal(isSolved('', ''), false);
});

test('every encoded message can be solved by its own decoding', () => {
  for (const text of ['SOS', 'HELLO WORLD', 'MEET ME AT 5', 'ON MY WAY']) {
    const morse = encodeText(text);
    assert.ok(isSolved(morse, decodeMorse(morse)), text);
  }
});


/* ---------------- hints ---------------- */

const puzzle = (over: Partial<PuzzleState> = {}): PuzzleState => ({ ...EMPTY_PUZZLE, ...over });

test('a fresh message shows nothing but the code', () => {
  assert.deepEqual(tileStates('... --- ...', puzzle()), ['blank', 'blank', 'blank']);
});

test('nothing is given away for free', () => {
  const states = tileStates(encodeText('HELLO'), puzzle());
  assert.equal(states.filter((s) => s === 'given').length, 0);
  assert.equal(states.filter((s) => s === 'blank').length, 5);
});

test('a hint marks that one tile as given', () => {
  assert.deepEqual(tileStates('... --- ...', puzzle({ given: [1] })), ['blank', 'given', 'blank']);
});

test('a hint overrides a wrong guess so it never shows red', () => {
  assert.deepEqual(tileStates('... --- ...', puzzle({ guess: 'XXX', given: [1] })), [
    'wrong',
    'given',
    'wrong',
  ]);
});

test('opening up marks every tile as given', () => {
  assert.deepEqual(tileStates('... --- ...', puzzle({ openedUp: true })), [
    'given',
    'given',
    'given',
  ]);
});

test('the next hint is the leftmost letter not yet got', () => {
  assert.equal(nextHintIndex('... --- ...', puzzle()), 0);
  assert.equal(nextHintIndex('... --- ...', puzzle({ guess: 'S' })), 1);
  assert.equal(nextHintIndex('... --- ...', puzzle({ given: [0] })), 1);
  assert.equal(nextHintIndex('... --- ...', puzzle({ guess: 'S', given: [1] })), 2);
});

test('a wrong guess does not count as got, so hints target it', () => {
  assert.equal(nextHintIndex('... --- ...', puzzle({ guess: 'X' })), 0);
});

test('no hint is left once everything is got', () => {
  assert.equal(nextHintIndex('... --- ...', puzzle({ guess: 'SOS' })), -1);
  assert.equal(nextHintIndex('... --- ...', puzzle({ openedUp: true })), -1);
});

test('a message is complete when typed, hinted, or a mix', () => {
  assert.ok(isComplete('... --- ...', puzzle({ guess: 'SOS' })));
  assert.ok(isComplete('... --- ...', puzzle({ openedUp: true })));
  assert.ok(isComplete('... --- ...', puzzle({ guess: 'SO', given: [2] })));
  assert.equal(isComplete('... --- ...', puzzle({ guess: 'SO' })), false);
});

test('an empty message is never complete', () => {
  assert.equal(isComplete('', puzzle()), false);
});

test('a clean solve means no hints at all', () => {
  assert.ok(isCleanSolve('... --- ...', puzzle({ guess: 'SOS' })));
  assert.equal(isCleanSolve('... --- ...', puzzle({ guess: 'SOS', given: [0] })), false);
  assert.equal(isCleanSolve('... --- ...', puzzle({ guess: 'SOS', openedUp: true })), false);
  assert.equal(isCleanSolve('... --- ...', puzzle({ guess: 'SO', given: [2] })), false);
});

test('hinting every letter one at a time always terminates and completes', () => {
  const morse = encodeText('HELLO WORLD');
  let state = puzzle();
  let guard = 0;
  while (!isComplete(morse, state) && guard++ < 100) {
    const index = nextHintIndex(morse, state);
    assert.notEqual(index, -1);
    state = { ...state, given: [...state.given, index] };
  }
  assert.ok(isComplete(morse, state));
  assert.equal(state.given.length, 'HELLOWORLD'.length);
});


/* ---------------- live key feedback ---------------- */

test('the live symbol matches what the press will actually become', () => {
  const unit = 200;
  for (let held = 0; held <= 1000; held += 10) {
    assert.equal(liveSymbol(held, unit), pressToSymbol(held, unit), `held ${held}ms`);
  }
});

test('thresholds are reported in real milliseconds', () => {
  assert.equal(dashAtMs(240), 480);
  assert.equal(letterClosesAtMs(240), 480);
  assert.equal(wordClosesAtMs(240), 1200);
});

test('the dash threshold and the letter threshold are the same length', () => {
  // Both are 2 units, so one visual scale works for both.
  assert.equal(dashAtMs(100), letterClosesAtMs(100));
});

test('dash progress fills from empty to full', () => {
  const unit = 100;
  assert.equal(dashProgress(0, unit), 0);
  assert.equal(dashProgress(100, unit), 0.5);
  assert.equal(dashProgress(200, unit), 1);
});

test('progress never escapes the 0 to 1 range', () => {
  const unit = 100;
  assert.equal(dashProgress(99999, unit), 1);
  assert.equal(dashProgress(-50, unit), 0);
  assert.equal(letterProgress(99999, unit), 1);
  assert.equal(letterProgress(-50, unit), 0);
  assert.equal(dashProgress(NaN, unit), 0);
});

test('progress hits exactly 1 at the moment the symbol flips', () => {
  for (const wpm of [5, 8, 12, 16, 20]) {
    const unit = unitMsForWpm(wpm);
    const at = dashAtMs(unit);
    assert.equal(dashProgress(at, unit), 1);
    assert.equal(liveSymbol(at, unit), '-');
    assert.equal(liveSymbol(at - 1, unit), '.');
    assert.ok(dashProgress(at - 1, unit) < 1);
  }
});

test('letter progress reaching 1 means the next press starts a new letter', () => {
  const unit = 100;
  const at = letterClosesAtMs(unit);
  assert.equal(letterProgress(at, unit), 1);
  assert.equal(gapToKind(at, unit), 'new-letter');
  assert.equal(gapToKind(at - 1, unit), 'same-letter');
});

test('the word threshold is later than the letter threshold', () => {
  const unit = 100;
  assert.ok(wordClosesAtMs(unit) > letterClosesAtMs(unit));
  assert.equal(gapToKind(wordClosesAtMs(unit), unit), 'new-word');
});

test('at 5 wpm a dash needs a comfortably long hold', () => {
  const unit = unitMsForWpm(5);
  assert.equal(unit, 240);
  assert.equal(dashAtMs(unit), 480);
});


/* ---------------- guide ---------------- */

const target = encodeText('SOS');

test('nothing tapped yet means everything is pending', () => {
  const progress = compareToTarget(target, '');
  assert.deepEqual(progress.states, ['pending', 'pending', 'pending']);
  assert.equal(progress.currentIndex, 0);
  assert.equal(progress.matched, 0);
  assert.equal(progress.complete, false);
  assert.equal(progress.offTrack, false);
});

test('a letter in progress reads as partial, not wrong', () => {
  const progress = compareToTarget(target, '..');
  assert.deepEqual(progress.states, ['partial', 'pending', 'pending']);
  assert.equal(progress.offTrack, false);
  assert.equal(progress.currentIndex, 0);
});

test('a single dot is a valid start towards S', () => {
  assert.equal(compareToTarget(target, '.').states[0], 'partial');
});

test('a completed first letter advances the cursor', () => {
  const progress = compareToTarget(target, '...');
  assert.deepEqual(progress.states, ['done', 'pending', 'pending']);
  assert.equal(progress.matched, 1);
  assert.equal(progress.currentIndex, 1);
});

test('a wrong letter is flagged and not called partial', () => {
  const progress = compareToTarget(target, '-');
  assert.equal(progress.states[0], 'wrong');
  assert.ok(progress.offTrack);
});

test('a dash where a dot belongs mid-word is wrong', () => {
  const progress = compareToTarget(target, '... -.-');
  assert.deepEqual(progress.states, ['done', 'wrong', 'pending']);
  assert.ok(progress.offTrack);
});

test('an earlier mistake stays wrong once you move past it', () => {
  const progress = compareToTarget(target, '-- --- ...');
  assert.deepEqual(progress.states, ['wrong', 'done', 'done']);
  assert.equal(progress.complete, false);
});

test('tapping the whole thing correctly completes it', () => {
  const progress = compareToTarget(target, '... --- ...');
  assert.deepEqual(progress.states, ['done', 'done', 'done']);
  assert.equal(progress.matched, 3);
  assert.ok(progress.complete);
  assert.equal(progress.currentIndex, -1);
  assert.equal(progress.offTrack, false);
});

test('tapping past the end counts as off track, not complete', () => {
  const progress = compareToTarget(target, '... --- ... .-');
  assert.equal(progress.complete, false);
  assert.ok(progress.offTrack);
});

test('word gaps are not enforced', () => {
  const goal = encodeText('HI YOU');
  // Same letters, but tapped as one long word.
  const asOneWord = splitLetters(goal)
    .map((token) => token.code)
    .join(' ');
  const progress = compareToTarget(goal, asOneWord);
  assert.ok(progress.complete, 'letters are right, so it should count');
});

test('an empty target is never complete', () => {
  assert.equal(compareToTarget('', '').complete, false);
  assert.equal(compareToTarget('', '...').complete, false);
});

test('tapping I LOVE YOU letter by letter completes exactly on the last tap', () => {
  const goal = encodeText('I LOVE YOU');
  const letters = splitLetters(goal).map((token) => token.code);

  let draft = '';
  letters.forEach((code, index) => {
    code.split('').forEach((symbol, symbolIndex) => {
      draft = draft.length === 0 ? symbol : draft + (symbolIndex === 0 ? ' ' : '') + symbol;
      const progress = compareToTarget(goal, draft);
      assert.equal(progress.offTrack, false, `went off track at letter ${index}`);
      const last = index === letters.length - 1;
      const finished = symbolIndex === code.length - 1;
      assert.equal(progress.complete, last && finished, `completed early at letter ${index}`);
    });
  });

  assert.equal(decodeMorse(draft), 'ILOVEYOU');
});


test('the cursor points at the next letter as soon as one is finished', () => {
  const goal = encodeText('SOS');
  assert.equal(compareToTarget(goal, '..').currentIndex, 0);
  assert.equal(compareToTarget(goal, '...').currentIndex, 1);
  assert.equal(compareToTarget(goal, '... --').currentIndex, 1);
  assert.equal(compareToTarget(goal, '... ---').currentIndex, 2);
  assert.equal(compareToTarget(goal, '... --- ...').currentIndex, -1);
});


/* ---------------- letter undo ---------------- */

test('undoing a letter removes all of its symbols at once', () => {
  assert.equal(undoLastLetter('... --- ...'), '... ---');
  assert.equal(undoLastLetter('... ---'), '...');
  assert.equal(undoLastLetter('...'), '');
});

test('undoing a letter removes the word break with it', () => {
  assert.equal(undoLastLetter('.... .. / -.--'), '.... ..');
});

test('undoing a letter on an empty or single-letter draft is safe', () => {
  assert.equal(undoLastLetter(''), '');
  assert.equal(undoLastLetter('   '), '');
  assert.equal(undoLastLetter('.'), '');
});

test('undoing a half-finished letter clears just that letter', () => {
  // Mid-way through tapping O, having already done S.
  assert.equal(undoLastLetter('... --'), '...');
});

test('repeated letter undo empties the draft and stops', () => {
  let draft = encodeText('I LOVE YOU');
  for (let i = 0; i < 50 && draft.length > 0; i++) draft = undoLastLetter(draft);
  assert.equal(draft, '');
  assert.equal(undoLastLetter(draft), '');
});

test('letter undo is always at least as fast as symbol undo', () => {
  const draft = encodeText('SOS');
  let bySymbol = draft;
  let symbolTaps = 0;
  while (bySymbol.length > 0 && symbolTaps < 100) {
    bySymbol = undoLast(bySymbol);
    symbolTaps++;
  }
  let byLetter = draft;
  let letterTaps = 0;
  while (byLetter.length > 0 && letterTaps < 100) {
    byLetter = undoLastLetter(byLetter);
    letterTaps++;
  }
  assert.equal(letterTaps, 3, 'SOS should take three letter-undos');
  assert.ok(symbolTaps > letterTaps, 'symbol undo should need more taps');
});

test('rebuilding from tokens reproduces the original exactly', () => {
  for (const text of ['SOS', 'I LOVE YOU', 'MEET ME AT 5', 'E', 'ON MY WAY']) {
    const morse = encodeText(text);
    assert.equal(joinLetters(splitLetters(morse)), morse, text);
  }
});

test('undoing a wrong letter puts the guide back on track', () => {
  const goal = encodeText('I LOVE YOU');
  const letters = splitLetters(goal).map((token) => token.code);
  // Tap I LOVE Y correctly, then get the next letter wrong.
  // The real 7th letter is O (---), so A (.-) is a genuine mistake.
  const good = joinLetters(splitLetters(goal).slice(0, 6));
  const bad = good + ' ' + '.-';
  assert.ok(compareToTarget(goal, bad).offTrack, 'setup: should be off track');
  const fixed = undoLastLetter(bad);
  assert.equal(fixed, good);
  assert.equal(compareToTarget(goal, fixed).offTrack, false, 'undo did not clear the mistake');
  assert.equal(compareToTarget(goal, fixed).matched, 6);
});


test('a shared opening symbol counts as in-progress, not a mistake', () => {
  const goal = encodeText('O');
  // A single dash is a valid start towards O (---), not an error.
  assert.equal(compareToTarget(goal, '-').states[0], 'partial');
  assert.equal(compareToTarget(goal, '-').offTrack, false);
  // A dot is not, since O never starts with one.
  assert.equal(compareToTarget(goal, '.').states[0], 'wrong');
  assert.ok(compareToTarget(goal, '.').offTrack);
});


/* ---------------- deliberate word breaks ---------------- */

test('a word break is added deliberately', () => {
  assert.equal(addWordBreak('.. '.trim()), '.. / ');
  assert.equal(addWordBreak('.... ..'), '.... .. / ');
});

test('a word break cannot start the draft', () => {
  assert.equal(addWordBreak(''), '');
  assert.equal(addWordBreak('   '), '');
});

test('tapping space twice does not create a double break', () => {
  const once = addWordBreak('...');
  assert.equal(addWordBreak(once), once);
  assert.equal(addWordBreak(addWordBreak(once)), once);
});

test('a pending break is reported so the button can show it', () => {
  assert.ok(hasPendingWordBreak(addWordBreak('...')));
  assert.equal(hasPendingWordBreak('...'), false);
  assert.equal(hasPendingWordBreak(''), false);
});

test('the next press after a break lands in the new word', () => {
  const unit = 100;
  let morse = applyPress('', 0, 50, unit);
  morse = addWordBreak(morse);
  morse = applyPress(morse, 50, 50, unit);
  assert.equal(morse, '. / .');
  assert.equal(decodeMorse(morse), 'E E');
});

test('a deliberate break survives a short gap after it', () => {
  const unit = 100;
  // Tap space, then immediately tap - the break must still hold.
  let morse = addWordBreak('...');
  morse = applyPress(morse, 10, 50, unit);
  assert.equal(morse, '... / .');
});

test('undo removes a deliberate break', () => {
  const withBreak = addWordBreak('...');
  assert.equal(undoLast(withBreak), '...');
});

test('typing I LOVE YOU with deliberate breaks decodes exactly', () => {
  const unit = unitMsForWpm(5);
  const dot = Math.round(dashAtMs(unit) * 0.4);
  const dash = Math.round(dashAtMs(unit) * 1.5);
  const insideLetter = Math.round(letterClosesAtMs(unit) * 0.5);
  const betweenLetters = Math.round(letterClosesAtMs(unit) * 1.5);

  let morse = '';
  let started = false;

  /** Tap out one whole letter, pausing properly before and within it. */
  const letter = (code: string) => {
    code.split('').forEach((symbol, index) => {
      const gap = !started ? 0 : index === 0 ? betweenLetters : insideLetter;
      morse = applyPress(morse, gap, symbol === '-' ? dash : dot, unit);
      started = true;
    });
  };
  const space = () => {
    morse = addWordBreak(morse);
  };

  letter('..');
  space();
  letter('.-..'); letter('---'); letter('...-'); letter('.');
  space();
  letter('-.--'); letter('---'); letter('..-');

  assert.equal(decodeMorse(morse), 'I LOVE YOU');
});

test('a thinking pause of any length still keeps you inside the word', () => {
  const unit = unitMsForWpm(5);
  const dot = Math.round(dashAtMs(unit) * 0.4);

  let morse = applyPress('', 0, dot, unit);
  // Twenty seconds of staring at the chart.
  morse = applyPress(morse, 20000, dot, unit);
  morse = applyPress(morse, 20000, dot, unit);

  assert.equal(morse, '. . .');
  assert.equal(decodeMorse(morse), 'EEE');
  assert.equal(morse.includes('/'), false);
});


/* ---------------- timing profiles ---------------- */

test('even timing reproduces the textbook ratios', () => {
  const timing = evenTiming(12);
  assert.equal(timing.charUnitMs, 100);
  assert.equal(timing.letterGapMs, 300);
  assert.equal(timing.wordGapMs, 700);
});

test('farnsworth keeps letters at the character speed', () => {
  const timing = farnsworthTiming(18, 9);
  assert.equal(timing.charUnitMs, unitMsForWpm(18));
});

test('farnsworth stretches the gaps, not the letters', () => {
  const fast = evenTiming(18);
  const farns = farnsworthTiming(18, 9);
  assert.equal(farns.charUnitMs, fast.charUnitMs, 'letters must sound the same');
  assert.ok(farns.letterGapMs > fast.letterGapMs, 'letter gap should stretch');
  assert.ok(farns.wordGapMs > fast.wordGapMs, 'word gap should stretch');
});

test('the word gap always stays longer than the letter gap', () => {
  for (const [charWpm, effWpm] of [[13, 5], [18, 9], [20, 5], [15, 12], [25, 7]]) {
    const timing = farnsworthTiming(charWpm, effWpm);
    assert.ok(timing.wordGapMs > timing.letterGapMs, `${charWpm}/${effWpm}`);
  }
});

test('a slower effective speed means longer gaps', () => {
  const slow = farnsworthTiming(18, 5);
  const quick = farnsworthTiming(18, 12);
  assert.ok(slow.letterGapMs > quick.letterGapMs);
  assert.ok(slow.wordGapMs > quick.wordGapMs);
});

test('farnsworth falls back to even timing when there is nothing to stretch', () => {
  assert.deepEqual(farnsworthTiming(12, 12), evenTiming(12));
  assert.deepEqual(farnsworthTiming(12, 20), evenTiming(12));
});

test('a real farnsworth setting is genuinely slower overall than plain fast morse', () => {
  const message = encodeText('HELLO WORLD');
  const fast = timelineDuration(buildScheduleWith(message, evenTiming(18)).beats);
  const farns = timelineDuration(buildScheduleWith(message, farnsworthTiming(18, 9)).beats);
  assert.ok(farns > fast * 1.4, `farnsworth ${farns}ms vs plain ${fast}ms`);
});

/* ---------------- thresholds ---------------- */

test('thresholds sit sensibly between the real gap lengths', () => {
  const timing = farnsworthTiming(18, 9);
  assert.ok(dashThresholdMs(timing) > timing.charUnitMs);
  assert.ok(dashThresholdMs(timing) < timing.charUnitMs * 3);
  assert.ok(letterThresholdMs(timing) < timing.letterGapMs);
  assert.ok(wordThresholdMs(timing) > letterThresholdMs(timing));
  assert.ok(wordThresholdMs(timing) < timing.wordGapMs);
});

test('a letter gap is not long enough to be a word gap', () => {
  for (const [charWpm, effWpm] of [[13, 5], [18, 9], [20, 12], [15, 7]]) {
    const timing = farnsworthTiming(charWpm, effWpm);
    assert.equal(kindForGap(timing.letterGapMs, timing, true), 'new-letter', `${charWpm}/${effWpm}`);
    assert.equal(kindForGap(timing.wordGapMs, timing, true), 'new-word', `${charWpm}/${effWpm}`);
  }
});

test('a proper dit and dah are read correctly at every profile', () => {
  for (const [charWpm, effWpm] of [[13, 5], [18, 9], [20, 12], [15, 7]]) {
    const timing = farnsworthTiming(charWpm, effWpm);
    assert.equal(symbolForPress(timing.charUnitMs, timing), '.');
    assert.equal(symbolForPress(timing.charUnitMs * 3, timing), '-');
  }
});

/* ---------------- the two modes ---------------- */

test('beginner mode never starts a word from a pause', () => {
  const timing = evenTiming(5);
  let morse = applyPressWith('', 0, 60, timing, false);
  morse = applyPressWith(morse, 60000, 60, timing, false);
  assert.equal(morse.includes('/'), false);
});

test('farnsworth mode starts a word from a long pause', () => {
  const timing = farnsworthTiming(18, 9);
  let morse = applyPressWith('', 0, timing.charUnitMs, timing, true);
  morse = applyPressWith(morse, timing.wordGapMs, timing.charUnitMs, timing, true);
  assert.equal(morse, '. / .');
  assert.equal(decodeMorse(morse), 'E E');
});

test('farnsworth mode still treats a letter gap as just a letter gap', () => {
  const timing = farnsworthTiming(18, 9);
  let morse = applyPressWith('', 0, timing.charUnitMs, timing, true);
  morse = applyPressWith(morse, timing.letterGapMs, timing.charUnitMs, timing, true);
  assert.equal(morse, '. .');
  assert.equal(decodeMorse(morse), 'EE');
});

test('typing a whole phrase with real timing decodes exactly', () => {
  const timing = farnsworthTiming(18, 9);
  const phrase = 'I LOVE YOU';

  let morse = '';
  let started = false;
  phrase.split(' ').forEach((word, wordIndex) => {
    splitLetters(encodeText(word)).forEach((token, letterIndex) => {
      token.code.split('').forEach((symbol, symbolIndex) => {
        const gap = !started
          ? 0
          : symbolIndex > 0
            ? timing.charUnitMs
            : letterIndex === 0 && wordIndex > 0
              ? timing.wordGapMs
              : timing.letterGapMs;
        morse = applyPressWith(
          morse,
          gap,
          symbol === '-' ? timing.charUnitMs * 3 : timing.charUnitMs,
          timing,
          true
        );
        started = true;
      });
    });
  });

  assert.equal(decodeMorse(morse), phrase);
});

test('a deliberate space still works even in farnsworth mode', () => {
  const timing = farnsworthTiming(18, 9);
  let morse = applyPressWith('', 0, timing.charUnitMs, timing, true);
  morse = addWordBreak(morse);
  morse = applyPressWith(morse, 10, timing.charUnitMs, timing, true);
  assert.equal(morse, '. / .');
});


/* ---------------- echo decoding ---------------- */

const SOS = encodeText('SOS');

test('a fresh message has nothing solved and nothing selected', () => {
  assert.deepEqual(echoTiles(SOS, ECHO_START), ['todo', 'todo', 'todo']);
  assert.equal(ECHO_START.current, -1);
  assert.equal(echoComplete(SOS, ECHO_START), false);
});

test('any letter can be selected, not just the first', () => {
  const picked = echoSelect(SOS, ECHO_START, 2);
  assert.equal(picked.current, 2);
  assert.deepEqual(echoTiles(SOS, picked), ['todo', 'todo', 'current']);
});

test('selecting out of range does nothing', () => {
  assert.deepEqual(echoSelect(SOS, ECHO_START, 9), ECHO_START);
  assert.deepEqual(echoSelect(SOS, ECHO_START, -1), ECHO_START);
});

test('you cannot tap a letter you have not heard', () => {
  const picked = echoSelect(SOS, ECHO_START, 0);
  assert.deepEqual(echoTap(SOS, picked, '.'), picked);
});

test('tapping the pattern back solves that letter', () => {
  let state = echoHear(echoSelect(SOS, ECHO_START, 0));
  state = echoTap(SOS, state, '.');
  state = echoTap(SOS, state, '.');
  assert.deepEqual(state.solved, []);
  state = echoTap(SOS, state, '.');
  assert.deepEqual(state.solved, [0]);
  assert.equal(echoTiles(SOS, state)[0], 'solved');
});

test('solving a letter moves on to the next one still to do', () => {
  let state = echoHear(echoSelect(SOS, ECHO_START, 0));
  '...'.split('').forEach((symbol) => {
    state = echoTap(SOS, state, symbol as '.' | '-');
  });
  assert.equal(state.current, 1);
  assert.equal(state.heard, false);
});

test('solving the middle letter first jumps back to the start after', () => {
  let state = echoHear(echoSelect(SOS, ECHO_START, 1));
  '---'.split('').forEach((symbol) => {
    state = echoTap(SOS, state, symbol as '.' | '-');
  });
  assert.deepEqual(state.solved, [1]);
  assert.equal(state.current, 2, 'should go forwards first');
});

test('the cursor wraps round to earlier letters', () => {
  let state: EchoState = { ...ECHO_START, solved: [1, 2], current: 2 };
  assert.equal(nextUnsolved(SOS, state, 3), 0);
});

test('a wrong tap resets only that letter', () => {
  let state = echoHear(echoSelect(SOS, ECHO_START, 0));
  state = echoTap(SOS, state, '-');
  assert.equal(state.tapped, '');
  assert.equal(state.misses, 1);
  assert.equal(state.current, 0);
  assert.ok(state.heard);
  assert.deepEqual(state.solved, []);
});

test('an already-solved letter cannot be selected again', () => {
  const solved: EchoState = { ...ECHO_START, solved: [0], current: 1 };
  assert.equal(echoSelect(SOS, solved, 0).current, 1);
});

test('progress counts solved and given together', () => {
  assert.equal(echoProgress(SOS, { ...ECHO_START, solved: [0], given: [2] }), 2);
  assert.equal(echoProgress(SOS, echoOpenUp(ECHO_START)), 3);
});

test('a message is complete when every letter is got, in any order', () => {
  assert.ok(echoComplete(SOS, { ...ECHO_START, solved: [2, 0, 1] }));
  assert.ok(echoComplete(SOS, { ...ECHO_START, solved: [1], given: [0, 2] }));
  assert.equal(echoComplete(SOS, { ...ECHO_START, solved: [0, 1] }), false);
});

test('an empty message is never complete', () => {
  assert.equal(echoComplete('', ECHO_START), false);
});

test('a clean solve means no misses and no help, whatever the order', () => {
  assert.ok(echoClean(SOS, { ...ECHO_START, solved: [2, 1, 0] }));
  assert.equal(echoClean(SOS, { ...ECHO_START, solved: [0, 1], given: [2] }), false);
  assert.equal(echoClean(SOS, { ...ECHO_START, solved: [0, 1, 2], misses: 1 }), false);
});

test('skipping hands over the current letter and moves on', () => {
  const state = echoGiveLetter(SOS, echoSelect(SOS, ECHO_START, 1));
  assert.deepEqual(state.given, [1]);
  assert.equal(state.current, 2);
});

test('giving up reveals everything and parks the cursor', () => {
  const state = echoOpenUp(ECHO_START);
  assert.ok(echoComplete(SOS, state));
  assert.equal(state.current, -1);
  assert.deepEqual(echoTiles(SOS, state), ['given', 'given', 'given']);
});

test('the target code follows the selected letter', () => {
  assert.equal(echoTargetCode(SOS, echoSelect(SOS, ECHO_START, 1)), '---');
  assert.equal(echoTargetCode(SOS, ECHO_START), '');
});

test('word breaks are not letters and never need tapping', () => {
  assert.equal(echoTiles(encodeText('HI YOU'), ECHO_START).length, 5);
});

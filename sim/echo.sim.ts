/**
 * Decoding by ear, end to end, exactly as the UI drives it.
 *
 * The rule that matters: a letter must never be visible before the user
 * has heard it AND tapped it back.
 */
import {
  encodeText, splitLetters, ECHO_START, echoHear, echoTap, echoTiles,
  echoComplete, echoClean, echoTargetCode, echoGiveLetter, echoOpenUp,
  echoUndo, type EchoState, type Symbol,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const phrases = ['I LOVE YOU', 'SOS', 'ON MY WAY', 'MEET ME AT 5', 'OK', 'E'];

for (const phrase of phrases) {
  const morse = encodeText(phrase);
  const codes = splitLetters(morse).map((token) => token.code);

  /* ---- the leak check, run after every single interaction ---- */
  // The dots and dashes are visible from the start now; the LETTER is
  // what must never appear before it has been heard and tapped back.
  const assertNoLeak = (state: EchoState, where: string) => {
    const tiles = echoTiles(morse, state);
    tiles.forEach((tile, index) => {
      if (tile === 'revealed' && !state.openedUp) {
        check(index < state.index, `${phrase}: letter ${index} revealed early (${where})`);
      }
      if (index > state.index) {
        check(tile === 'locked', `${phrase}: letter ${index} not locked (${where})`);
      }
    });
  };

  /* ---- a perfect run ---- */
  let state: EchoState = ECHO_START;
  assertNoLeak(state, 'start');
  check(echoTiles(morse, state)[0] === 'listening', `${phrase}: first tile should await listening`);

  codes.forEach((code, letterIndex) => {
    // Tapping before listening must be refused.
    const before = echoTap(morse, state, code[0] as Symbol);
    check(before === state, `${phrase}: tapping was allowed before listening`);
    check(echoTiles(morse, state)[letterIndex] === 'listening',
      `${phrase}: the current letter should be awaiting a listen at ${letterIndex}`);

    state = echoHear(state);
    check(echoTiles(morse, state)[letterIndex] === 'tapping',
      `${phrase}: should be ready to tap after listening at ${letterIndex}`);
    check(echoTiles(morse, state)[letterIndex] !== 'revealed',
      `${phrase}: letter shown merely for listening at ${letterIndex}`);
    assertNoLeak(state, `heard ${letterIndex}`);

    code.split('').forEach((symbol, symbolIndex) => {
      state = echoTap(morse, state, symbol as Symbol);
      const finished = symbolIndex === code.length - 1;
      check(state.index === letterIndex + (finished ? 1 : 0),
        `${phrase}: index wrong at letter ${letterIndex} symbol ${symbolIndex}`);
      assertNoLeak(state, `tapped ${letterIndex}.${symbolIndex}`);
    });

    check(echoTargetCode(morse, state) === (codes[letterIndex + 1] ?? ''),
      `${phrase}: target did not advance after letter ${letterIndex}`);
  });

  check(echoComplete(morse, state), `${phrase}: perfect run did not complete`);
  check(echoClean(morse, state), `${phrase}: perfect run was not clean`);
  check(state.misses === 0 && state.given === 0, `${phrase}: perfect run recorded penalties`);

  /* ---- a wrong tap must reset the letter, not advance it ---- */
  let messy: EchoState = echoHear(ECHO_START);
  const rightFirst = codes[0][0];
  const wrongFirst: Symbol = rightFirst === '.' ? '-' : '.';
  messy = echoTap(morse, messy, wrongFirst);
  check(messy.index === 0, `${phrase}: a wrong tap advanced the letter`);
  check(messy.tapped === '', `${phrase}: a wrong tap left rubbish behind`);
  check(messy.misses === 1, `${phrase}: a wrong tap was not counted`);
  check(messy.heard, `${phrase}: a wrong tap made you listen again`);
  assertNoLeak(messy, 'after miss');

  // and you can still finish from there
  codes.forEach((code, letterIndex) => {
    if (letterIndex > 0) messy = echoHear(messy);
    code.split('').forEach((symbol) => {
      messy = echoTap(morse, messy, symbol as Symbol);
    });
  });
  check(echoComplete(morse, messy), `${phrase}: could not finish after a miss`);
  check(!echoClean(morse, messy), `${phrase}: a miss still counted as clean`);

  /* ---- undo ---- */
  let undoing: EchoState = echoHear(ECHO_START);
  if (codes[0].length > 1) {
    undoing = echoTap(morse, undoing, codes[0][0] as Symbol);
    const stepped = echoUndo(undoing);
    check(stepped.tapped === '', `${phrase}: undo did not step back`);
    check(stepped.index === 0, `${phrase}: undo moved the letter`);
  }

  /* ---- skipping every letter always terminates ---- */
  let skipping: EchoState = ECHO_START;
  let guard = 0;
  while (!echoComplete(morse, skipping) && guard++ < 200) {
    skipping = echoGiveLetter(morse, skipping);
  }
  check(echoComplete(morse, skipping), `${phrase}: skipping never completed`);
  check(skipping.given === codes.length, `${phrase}: skip count wrong`);
  check(!echoClean(morse, skipping), `${phrase}: all-skipped counted as clean`);

  /* ---- giving up ---- */
  const opened = echoOpenUp(ECHO_START);
  check(echoComplete(morse, opened), `${phrase}: show-all did not complete`);
  check(!echoClean(morse, opened), `${phrase}: show-all counted as clean`);
  check(echoTiles(morse, opened).every((t) => t === 'revealed'),
    `${phrase}: show-all left tiles hidden`);
}

console.log(`decoded ${phrases.length} messages by ear, checking for leaks after every tap`);
console.log(problems.length === 0
  ? 'PASS: a letter is never shown before it is heard and tapped'
  : `FAIL (${problems.length}):\n` + problems.slice(0, 6).join('\n'));
process.exit(problems.length ? 1 : 0);

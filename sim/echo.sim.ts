/**
 * Decoding by ear, in any order.
 *
 * Two rules that matter:
 *   1. A letter must never be visible before it's been earned.
 *   2. You can work on any letter you like, in any order.
 */
import {
  encodeText, splitLetters, ECHO_START, echoSelect, echoHear, echoTap, echoTiles,
  echoComplete, echoClean, echoTargetCode, echoGiveLetter, echoOpenUp, echoUndo,
  echoProgress, echoIsDone, nextUnsolved, type EchoState, type Symbol,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const phrases = ['I LOVE YOU', 'SOS', 'ON MY WAY', 'HELLO STRANGER', 'OK', 'E'];

for (const phrase of phrases) {
  const morse = encodeText(phrase);
  const codes = splitLetters(morse).map((token) => token.code);

  /** No letter may show before it has been earned. */
  const assertNoLeak = (state: EchoState, where: string) => {
    echoTiles(morse, state).forEach((tile, index) => {
      const shown = tile === 'solved' || tile === 'given';
      if (shown && !state.openedUp) {
        check(echoIsDone(state, index), `${phrase}: letter ${index} shown unearned (${where})`);
      }
      if (!shown && !state.openedUp) {
        check(!echoIsDone(state, index), `${phrase}: letter ${index} earned but hidden (${where})`);
      }
    });
  };

  /* ---- nothing given away at the start ---- */
  let state: EchoState = ECHO_START;
  check(echoTiles(morse, state).every((t) => t === 'todo'), `${phrase}: something was shown at the start`);
  check(echoProgress(morse, state) === 0, `${phrase}: progress should start at zero`);
  check(!echoComplete(morse, state), `${phrase}: should not start complete`);
  assertNoLeak(state, 'start');

  /* ---- you can start anywhere, not just at the beginning ---- */
  if (codes.length >= 3) {
    const third = 2;
    let jump = echoSelect(morse, ECHO_START, third);
    check(jump.current === third, `${phrase}: could not jump straight to letter 3`);
    check(echoTiles(morse, jump)[third] === 'current', `${phrase}: letter 3 not marked current`);
    check(echoTiles(morse, jump)[0] === 'todo', `${phrase}: jumping ahead disturbed letter 1`);

    // and solve just that one
    jump = echoHear(jump);
    codes[third].split('').forEach((symbol) => {
      jump = echoTap(morse, jump, symbol as Symbol);
    });
    check(jump.solved.includes(third), `${phrase}: letter 3 was not solved`);
    check(echoTiles(morse, jump)[third] === 'solved', `${phrase}: letter 3 not shown solved`);
    check(!echoComplete(morse, jump), `${phrase}: one letter should not complete the message`);
    check(echoProgress(morse, jump) === 1, `${phrase}: progress should be 1`);
    assertNoLeak(jump, 'after jumping to letter 3');
  }

  /* ---- tapping without hearing is refused ---- */
  {
    const selected = echoSelect(morse, ECHO_START, 0);
    const early = echoTap(morse, selected, codes[0][0] as Symbol);
    check(early === selected, `${phrase}: tapping was allowed before listening`);
  }

  /* ---- solving in a scrambled order still completes ---- */
  {
    const order = codes.map((_, index) => index).sort(() => Math.random() - 0.5);
    let scrambled: EchoState = ECHO_START;
    for (const index of order) {
      scrambled = echoSelect(morse, scrambled, index);
      check(scrambled.current === index, `${phrase}: could not select letter ${index}`);
      scrambled = echoHear(scrambled);
      codes[index].split('').forEach((symbol) => {
        scrambled = echoTap(morse, scrambled, symbol as Symbol);
      });
      assertNoLeak(scrambled, `scrambled at ${index}`);
    }
    check(echoComplete(morse, scrambled), `${phrase}: scrambled order did not complete`);
    check(echoClean(morse, scrambled), `${phrase}: a clean scrambled run was not clean`);
    check(echoProgress(morse, scrambled) === codes.length, `${phrase}: progress wrong at the end`);
  }

  /* ---- finishing one letter moves on to the next one still to do ---- */
  if (codes.length >= 2) {
    let flow = echoSelect(morse, ECHO_START, 0);
    flow = echoHear(flow);
    codes[0].split('').forEach((symbol) => {
      flow = echoTap(morse, flow, symbol as Symbol);
    });
    check(flow.current === 1, `${phrase}: did not advance to the next letter, got ${flow.current}`);
    check(!flow.heard, `${phrase}: the next letter should start unheard`);
  }

  /* ---- a wrong tap resets that letter only ---- */
  {
    let messy = echoHear(echoSelect(morse, ECHO_START, 0));
    const wrong: Symbol = codes[0][0] === '.' ? '-' : '.';
    messy = echoTap(morse, messy, wrong);
    check(messy.tapped === '', `${phrase}: a wrong tap left rubbish behind`);
    check(messy.misses === 1, `${phrase}: a wrong tap was not counted`);
    check(messy.current === 0, `${phrase}: a wrong tap moved the cursor`);
    check(messy.heard, `${phrase}: a wrong tap forced another listen`);
    check(!echoIsDone(messy, 0), `${phrase}: a wrong tap somehow solved it`);
    assertNoLeak(messy, 'after a miss');
  }

  /* ---- undo steps back one symbol ---- */
  if (codes[0].length > 1) {
    let undoing = echoHear(echoSelect(morse, ECHO_START, 0));
    undoing = echoTap(morse, undoing, codes[0][0] as Symbol);
    const stepped = echoUndo(undoing);
    check(stepped.tapped === '', `${phrase}: undo did not step back`);
    check(stepped.current === 0, `${phrase}: undo moved the letter`);
  }

  /* ---- an already-solved letter can't be re-selected ---- */
  {
    let done = echoHear(echoSelect(morse, ECHO_START, 0));
    codes[0].split('').forEach((symbol) => {
      done = echoTap(morse, done, symbol as Symbol);
    });
    const reselect = echoSelect(morse, done, 0);
    check(reselect.current === done.current, `${phrase}: a solved letter could be re-selected`);
  }

  /* ---- skipping every letter always terminates ---- */
  {
    let skipping: EchoState = echoSelect(morse, ECHO_START, 0);
    let guard = 0;
    while (!echoComplete(morse, skipping) && guard++ < 200) {
      if (skipping.current < 0) break;
      skipping = echoGiveLetter(morse, skipping);
    }
    check(echoComplete(morse, skipping), `${phrase}: skipping never completed`);
    check(skipping.given.length === codes.length, `${phrase}: skip count wrong`);
    check(!echoClean(morse, skipping), `${phrase}: all-skipped counted as clean`);
    check(skipping.current === -1, `${phrase}: cursor should be idle once finished`);
  }

  /* ---- giving up ---- */
  {
    const opened = echoOpenUp(ECHO_START);
    check(echoComplete(morse, opened), `${phrase}: show-all did not complete`);
    check(!echoClean(morse, opened), `${phrase}: show-all counted as clean`);
    check(echoTiles(morse, opened).every((t) => t === 'given'), `${phrase}: show-all left tiles hidden`);
  }

  /* ---- nextUnsolved never points at something already done ---- */
  {
    let walking: EchoState = ECHO_START;
    for (let i = 0; i < codes.length; i++) {
      const index = nextUnsolved(morse, walking, 0);
      check(index >= 0, `${phrase}: ran out of letters early`);
      check(!echoIsDone(walking, index), `${phrase}: pointed at an already-done letter`);
      walking = { ...walking, solved: [...walking.solved, index] };
    }
    check(nextUnsolved(morse, walking, 0) === -1, `${phrase}: should be nothing left`);
  }
}

console.log(`decoded ${phrases.length} messages, in order and scrambled`);
console.log(problems.length === 0
  ? 'PASS: any letter, any order, and nothing is ever shown unearned'
  : `FAIL (${problems.length}):\n` + problems.slice(0, 6).join('\n'));
process.exit(problems.length ? 1 : 0);

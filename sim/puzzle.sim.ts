/**
 * Replays the real reducer logic a user would trigger, to prove the
 * puzzle can never get stuck and never leaks the answer early.
 */
import {
  encodeText, decodeMorse, EMPTY_PUZZLE, tileStates, nextHintIndex,
  isComplete, isCleanSolve, answerLetters, type PuzzleState,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const messages = ['SOS', 'HELLO WORLD', 'MEET ME AT 5', 'ON MY WAY', 'E', 'OK'];

for (const text of messages) {
  const morse = encodeText(text);
  const answer = answerLetters(morse);

  // 1. A brand new message must give away nothing.
  const fresh = tileStates(morse, EMPTY_PUZZLE);
  check(fresh.every((s) => s === 'blank'), `${text}: fresh message leaks a letter`);
  check(!isComplete(morse, EMPTY_PUZZLE), `${text}: fresh message counts as done`);

  // 2. Typing the right answer solves it with zero hints.
  const typed: PuzzleState = { ...EMPTY_PUZZLE, guess: decodeMorse(morse) };
  check(isComplete(morse, typed), `${text}: correct typing did not complete`);
  check(isCleanSolve(morse, typed), `${text}: correct typing was not a clean solve`);

  // 3. Hammering the hint button always terminates and completes.
  let state = EMPTY_PUZZLE;
  let taps = 0;
  while (!isComplete(morse, state) && taps < 200) {
    const index = nextHintIndex(morse, state);
    check(index >= 0, `${text}: hint returned -1 while incomplete`);
    state = { ...state, given: [...state.given, index] };
    taps++;
  }
  check(isComplete(morse, state), `${text}: hint spam never completed`);
  check(taps === answer.length, `${text}: took ${taps} hints for ${answer.length} letters`);
  check(!isCleanSolve(morse, state), `${text}: all-hints counted as a clean solve`);

  // 4. A wrong guess plus hints still finishes, and hints override red.
  let mixed: PuzzleState = { ...EMPTY_PUZZLE, guess: 'ZZZZZZZZZZZZ'.slice(0, answer.length) };
  const before = tileStates(morse, mixed);
  check(before.every((s) => s === 'wrong' || s === 'correct'), `${text}: wrong guess not marked`);
  let guard = 0;
  while (!isComplete(morse, mixed) && guard++ < 200) {
    mixed = { ...mixed, given: [...mixed.given, nextHintIndex(morse, mixed)] };
  }
  check(isComplete(morse, mixed), `${text}: wrong guess could not be rescued by hints`);
  check(
    !tileStates(morse, mixed).includes('wrong'),
    `${text}: a hinted tile still shows as wrong`
  );

  // 5. Show-all completes but is never a clean solve.
  const opened: PuzzleState = { ...EMPTY_PUZZLE, openedUp: true };
  check(isComplete(morse, opened), `${text}: show-all did not complete`);
  check(!isCleanSolve(morse, opened), `${text}: show-all counted as clean`);

  // 6. Partial typing must not complete early.
  if (answer.length > 1) {
    const partial: PuzzleState = { ...EMPTY_PUZZLE, guess: decodeMorse(morse).slice(0, 1) };
    check(!isComplete(morse, partial), `${text}: one letter completed the whole message`);
  }
}

console.log(`checked ${messages.length} messages`);
console.log(problems.length === 0 ? 'PASS: puzzle never leaks and never gets stuck' : 'FAIL:\n' + problems.join('\n'));
process.exit(problems.length ? 1 : 0);

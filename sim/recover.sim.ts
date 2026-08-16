/**
 * Simulates exactly the situation in the screenshot: tapping I LOVE YOU,
 * getting a letter wrong, and recovering with a single long-press undo.
 */
import {
  encodeText, splitLetters, joinLetters, compareToTarget,
  undoLast, undoLastLetter, decodeMorse,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const goal = encodeText('I LOVE YOU');
const tokens = splitLetters(goal);

// Go wrong at every possible position, and confirm one letter-undo fixes it.
for (let stop = 0; stop < tokens.length; stop++) {
  const good = joinLetters(tokens.slice(0, stop));
  const rightCode = tokens[stop].code;
  // Must differ on the FIRST symbol, otherwise it's a valid letter-in-progress.
  const wrongCode = rightCode.startsWith('.') ? '-' : '.';

  const bad = good.length === 0 ? wrongCode : good + ' ' + wrongCode;
  check(compareToTarget(goal, bad).offTrack, `letter ${stop}: mistake not detected`);

  const fixed = undoLastLetter(bad);
  check(fixed === good, `letter ${stop}: undo left "${fixed}" instead of "${good}"`);
  const after = compareToTarget(goal, fixed);
  check(!after.offTrack, `letter ${stop}: still off track after undo`);
  check(after.matched === stop, `letter ${stop}: matched ${after.matched}, expected ${stop}`);
  check(after.currentIndex === stop, `letter ${stop}: cursor did not return to ${stop}`);
}

// The screenshot case: a 3-symbol letter wrong. One long-press vs three taps.
const sixGood = joinLetters(tokens.slice(0, 6));
const threeSymbolMistake = sixGood + ' ' + '.-.';
check(undoLastLetter(threeSymbolMistake) === sixGood, 'one letter-undo did not clear a 3-symbol letter');

let bySymbol = threeSymbolMistake;
let taps = 0;
while (bySymbol !== sixGood && taps < 20) { bySymbol = undoLast(bySymbol); taps++; }
check(taps === 3, `symbol undo took ${taps} taps, expected 3`);

// Recovering then finishing correctly must still decode properly.
let draft = undoLastLetter(threeSymbolMistake);
for (const token of tokens.slice(6)) {
  draft = draft + (token.startsWord ? ' / ' : ' ') + token.code;
}
check(compareToTarget(goal, draft).complete, 'could not finish after recovering');
check(decodeMorse(draft) === 'I LOVE YOU', `finished as "${decodeMorse(draft)}"`);

console.log(`tested a mistake at all ${tokens.length} letter positions`);
console.log(problems.length === 0
  ? 'PASS: one long-press always recovers, at any position'
  : 'FAIL:\n' + problems.slice(0, 8).join('\n'));
process.exit(problems.length ? 1 : 0);

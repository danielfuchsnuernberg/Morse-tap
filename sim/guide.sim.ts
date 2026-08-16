/**
 * Simulates a user typing a message into the guide and tapping it out
 * on the real key, using the same functions the UI calls end to end.
 */
import {
  encodeText, splitLetters, compareToTarget, applyPress, addWordBreak, decodeMorse,
  unitMsForWpm, dashAtMs, letterClosesAtMs,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const phrases = ['I LOVE YOU', 'SOS', 'ON MY WAY', 'MEET ME AT 5', 'OK'];

for (const phrase of phrases) {
  const unit = unitMsForWpm(5);
  const goal = encodeText(phrase);
  const tokens = splitLetters(goal);

  const dot = Math.round(dashAtMs(unit) * 0.4);
  const dash = Math.round(dashAtMs(unit) * 1.5);
  const sameLetter = Math.round(letterClosesAtMs(unit) * 0.5);
  const newLetter = Math.round(letterClosesAtMs(unit) * 1.3);

  let draft = '';
  let firstTap = true;

  tokens.forEach((token, index) => {
    // A new word is now a deliberate button press, not a long pause.
    if (token.startsWord && index > 0) draft = addWordBreak(draft);
    token.code.split('').forEach((symbol, symbolIndex) => {
      const gap = firstTap ? 0 : symbolIndex > 0 ? sameLetter : newLetter;
      draft = applyPress(draft, gap, symbol === '-' ? dash : dot, unit);
      firstTap = false;

      const progress = compareToTarget(goal, draft);
      check(!progress.offTrack, `${phrase}: guide said off-track while tapping correctly (letter ${index})`);

      const isLastSymbol = symbolIndex === token.code.length - 1;
      const isLastLetter = index === tokens.length - 1;
      check(progress.complete === (isLastLetter && isLastSymbol),
        `${phrase}: complete flag wrong at letter ${index} symbol ${symbolIndex}`);

      if (!progress.complete) {
        // Once a letter is finished the cursor should already point at the next one.
        const expected = isLastSymbol ? index + 1 : index;
        check(progress.currentIndex === expected,
          `${phrase}: cursor on ${progress.currentIndex}, expected ${expected}`);
      }
      check(progress.matched === index + (isLastSymbol ? 1 : 0),
        `${phrase}: matched count off at letter ${index}`);
    });
  });

  // The tapped result must actually decode back to the phrase.
  check(decodeMorse(draft) === phrase, `${phrase}: tapped result decoded as "${decodeMorse(draft)}"`);

  // A deliberate mistake must be caught immediately.
  const wrong = applyPress(encodeText('I').slice(0, 1), sameLetter, dash, unit);
  check(compareToTarget(encodeText('I'), wrong).offTrack, 'a wrong symbol was not flagged');
}

console.log(`tapped out ${phrases.length} phrases by following the guide`);
console.log(problems.length === 0
  ? 'PASS: guide tracks correctly and never misleads'
  : 'FAIL:\n' + problems.slice(0, 8).join('\n'));
process.exit(problems.length ? 1 : 0);

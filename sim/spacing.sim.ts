/**
 * The exact failure from the screenshot: "I LOVE YOU" coming out as
 * "I L OVE YO U". Proves that can no longer happen.
 */
import {
  encodeText, splitLetters, applyPress, addWordBreak, decodeMorse,
  unitMsForWpm, dashAtMs, letterClosesAtMs, compareToTarget,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const unit = unitMsForWpm(5);
const dot = Math.round(dashAtMs(unit) * 0.4);
const dash = Math.round(dashAtMs(unit) * 1.5);
const inside = Math.round(letterClosesAtMs(unit) * 0.5);

/** Tap a phrase, using a random human pause between letters. */
function tapPhrase(phrase: string, pauseBetweenLetters: () => number): string {
  let morse = '';
  let started = false;
  phrase.split(' ').forEach((word, wordIndex) => {
    if (wordIndex > 0) morse = addWordBreak(morse);
    splitLetters(encodeText(word)).forEach((token) => {
      token.code.split('').forEach((symbol, index) => {
        const gap = !started ? 0 : index === 0 ? pauseBetweenLetters() : inside;
        morse = applyPress(morse, gap, symbol === '-' ? dash : dot, unit);
        started = true;
      });
    });
  });
  return morse;
}

const phrases = ['I LOVE YOU', 'ON MY WAY', 'MEET ME AT 5', 'SOS', 'OK'];

for (const phrase of phrases) {
  // A tidy typist: consistent short pauses.
  const tidy = tapPhrase(phrase, () => Math.round(letterClosesAtMs(unit) * 1.2));
  check(decodeMorse(tidy) === phrase, `${phrase}: tidy typing gave "${decodeMorse(tidy)}"`);

  // A hesitant typist: wildly varying pauses, up to 30 seconds of thinking.
  for (let run = 0; run < 40; run++) {
    const messy = tapPhrase(phrase, () =>
      Math.round(letterClosesAtMs(unit) * 1.1 + Math.random() * 30000)
    );
    check(decodeMorse(messy) === phrase,
      `${phrase}: hesitant typing gave "${decodeMorse(messy)}"`);
  }

  // And the guide agrees it's complete.
  check(compareToTarget(encodeText(phrase), tidy).complete, `${phrase}: guide not complete`);
}

console.log(`tapped ${phrases.length} phrases, 41 timing runs each`);
console.log(problems.length === 0
  ? 'PASS: spacing is now immune to how long you pause'
  : `FAIL (${problems.length}):\n` + problems.slice(0, 5).join('\n'));
process.exit(problems.length ? 1 : 0);

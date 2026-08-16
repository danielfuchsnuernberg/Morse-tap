/**
 * Both modes, tapped end to end with realistic human timing.
 *
 * Beginner: pauses can be any length, words come from the Space button.
 * Farnsworth: no Space button, words come from a long enough pause -
 * and the letters must still sound fast.
 */
import {
  encodeText, splitLetters, applyPressWith, addWordBreak, decodeMorse,
  buildScheduleWith, timelineDuration, dashThresholdMs, letterThresholdMs,
  wordThresholdMs, symbolForPress, evenTiming,
} from '../src/morse';
import {
  DEFAULT_PREFS, timingFor, usesSpaceButton, allowsTimedWordBreak,
  CHAR_SPEEDS, EFFECTIVE_SPEEDS, clampEffective, type Prefs,
} from '../src/settings';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const phrases = ['I LOVE YOU', 'ON MY WAY', 'SOS', 'MEET ME AT 5'];

/** Tap a phrase the way the app would record it, for a given prefs set. */
function tap(prefs: Prefs, phrase: string, letterPause: () => number): string {
  const timing = timingFor(prefs);
  const spaceButton = usesSpaceButton(prefs);
  const timedWords = allowsTimedWordBreak(prefs);
  let morse = '';
  let started = false;

  phrase.split(' ').forEach((word, wordIndex) => {
    if (wordIndex > 0 && spaceButton) morse = addWordBreak(morse);
    splitLetters(encodeText(word)).forEach((token, letterIndex) => {
      token.code.split('').forEach((symbol, symbolIndex) => {
        let gap = 0;
        if (started) {
          if (symbolIndex > 0) gap = timing.charUnitMs;
          else if (letterIndex === 0 && wordIndex > 0 && timedWords) gap = timing.wordGapMs;
          else gap = letterPause();
        }
        morse = applyPressWith(
          morse,
          gap,
          symbol === '-' ? timing.charUnitMs * 3 : timing.charUnitMs,
          timing,
          timedWords
        );
        started = true;
      });
    });
  });
  return morse;
}

/* ---- Beginner: pause length must not matter at all ---- */
for (const phrase of phrases) {
  const prefs = { ...DEFAULT_PREFS, mode: 'beginner' as const, beginnerWpm: 5 };
  const timing = timingFor(prefs);
  for (let run = 0; run < 25; run++) {
    const result = tap(prefs, phrase, () =>
      letterThresholdMs(timing) * 1.1 + Math.random() * 30000
    );
    check(decodeMorse(result) === phrase,
      `beginner ${phrase}: got "${decodeMorse(result)}"`);
  }
}

/* ---- Farnsworth: word breaks come from pauses, across every setting ---- */
for (const charWpm of CHAR_SPEEDS) {
  for (const effectiveWpm of EFFECTIVE_SPEEDS) {
    const prefs = clampEffective({
      ...DEFAULT_PREFS, mode: 'farnsworth' as const, charWpm, effectiveWpm,
    });
    const timing = timingFor(prefs);

    // The two thresholds must not be able to collide.
    check(wordThresholdMs(timing) > letterThresholdMs(timing) * 1.3,
      `${charWpm}/${effectiveWpm}: word and letter thresholds too close`);
    // These are measured from different things - how long a press lasted
    // versus how long a silence lasted - so equal values are fine. What
    // matters is that a gap threshold is never SHORTER than a dash.
    check(dashThresholdMs(timing) <= letterThresholdMs(timing),
      `${charWpm}/${effectiveWpm}: gap threshold shorter than a dash`);

    // When there is genuinely something to stretch, it must be stretched.
    if (effectiveWpm < charWpm) {
      check(timing.letterGapMs > timing.charUnitMs * 3,
        `${charWpm}/${effectiveWpm}: letter gap was not stretched`);
      check(timing.wordGapMs > timing.charUnitMs * 7,
        `${charWpm}/${effectiveWpm}: word gap was not stretched`);
    }

    for (const phrase of phrases) {
      // A tidy operator pausing exactly one letter gap.
      const result = tap(prefs, phrase, () => timing.letterGapMs);
      check(decodeMorse(result) === phrase,
        `farnsworth ${charWpm}/${effectiveWpm} ${phrase}: got "${decodeMorse(result)}"`);

      // A slightly sloppy one, anywhere between the two thresholds.
      const sloppy = tap(prefs, phrase, () => {
        const low = letterThresholdMs(timing) * 1.05;
        const high = wordThresholdMs(timing) * 0.95;
        return low + Math.random() * Math.max(0, high - low);
      });
      check(decodeMorse(sloppy) === phrase,
        `farnsworth ${charWpm}/${effectiveWpm} ${phrase} sloppy: got "${decodeMorse(sloppy)}"`);
    }
  }
}

/* ---- Farnsworth must actually sound like fast letters, slow overall ---- */
{
  const message = encodeText('HELLO WORLD');
  const farns = timingFor({ ...DEFAULT_PREFS, mode: 'farnsworth', charWpm: 18, effectiveWpm: 9 });
  const beginner = timingFor({ ...DEFAULT_PREFS, mode: 'beginner', beginnerWpm: 9 });

  check(farns.charUnitMs < beginner.charUnitMs,
    'farnsworth letters should be faster than plain 9wpm letters');

  const farnsTotal = timelineDuration(buildScheduleWith(message, farns).beats);
  const fastTotal = timelineDuration(buildScheduleWith(message, evenTiming(18)).beats);
  check(farnsTotal > fastTotal,
    'farnsworth overall should be slower than plain 18wpm');

  // A dit at 18wpm character speed is the same length either way.
  check(symbolForPress(farns.charUnitMs, farns) === '.', 'a dit should read as a dit');
  check(symbolForPress(farns.charUnitMs * 3, farns) === '-', 'a dah should read as a dah');
}

console.log(`beginner: ${phrases.length} phrases x 25 random-pause runs`);
console.log(`farnsworth: ${CHAR_SPEEDS.length * EFFECTIVE_SPEEDS.length} settings x ${phrases.length} phrases x 2 styles`);
console.log(problems.length === 0
  ? 'PASS: both modes record exactly what was tapped'
  : `FAIL (${problems.length}):\n` + problems.slice(0, 6).join('\n'));
process.exit(problems.length ? 1 : 0);

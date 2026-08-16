/**
 * Replays the exact sequence MorseKey + KeyScreen perform, using the
 * same functions the UI calls, to prove the live readout always agrees
 * with the symbol that actually gets recorded.
 */
import {
  liveSymbol, pressToSymbol, applyPress, addWordBreak, decodeMorse, dashAtMs,
  letterClosesAtMs, unitMsForWpm, letterProgress, dashProgress,
} from '../src/morse';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

for (const wpm of [5, 8, 12, 16, 20]) {
  const unit = unitMsForWpm(wpm);

  // 1. What the key shows while held must equal what gets recorded on release.
  for (let held = 0; held <= dashAtMs(unit) * 3; held += 7) {
    check(liveSymbol(held, unit) === pressToSymbol(held, unit),
      `${wpm}wpm: readout disagrees with recorded symbol at ${held}ms`);
  }

  // 2. The readout must flip exactly once, never flicker back.
  let flips = 0;
  let prev = liveSymbol(0, unit);
  for (let held = 0; held <= 3000; held += 5) {
    const now = liveSymbol(held, unit);
    if (now !== prev) { flips++; prev = now; }
  }
  check(flips === 1, `${wpm}wpm: readout flipped ${flips} times, expected 1`);
  check(liveSymbol(0, unit) === '.', `${wpm}wpm: readout does not start as a dot`);

  // 3. The countdown must empty exactly when the letter actually closes.
  const closeAt = letterClosesAtMs(unit);
  check(letterProgress(closeAt - 1, unit) < 1, `${wpm}wpm: countdown empties too early`);
  check(letterProgress(closeAt, unit) === 1, `${wpm}wpm: countdown has not emptied at close`);

  // 4. Following the on-screen instructions must produce the right message.
  //    "hold past dashAtMs for a dash", "tap before the bar empties for same letter".
  const dot = Math.round(dashAtMs(unit) * 0.4);
  const dash = Math.round(dashAtMs(unit) * 1.5);
  const sameLetter = Math.round(closeAt * 0.5);
  const newLetter = Math.round(closeAt * 1.3);

  let draft = '';
  const tap = (duration: number, gap: number) => {
    draft = applyPress(draft, gap, duration, unit);
  };

  // Spell "SOS OK" by following the UI's own rules.
  // The space between words comes from the Space button, not a pause.
  tap(dot, 0); tap(dot, sameLetter); tap(dot, sameLetter);
  tap(dash, newLetter); tap(dash, sameLetter); tap(dash, sameLetter);
  tap(dot, newLetter); tap(dot, sameLetter); tap(dot, sameLetter);
  draft = addWordBreak(draft);
  tap(dash, sameLetter); tap(dash, sameLetter); tap(dash, sameLetter);
  tap(dash, newLetter); tap(dot, sameLetter); tap(dash, sameLetter);

  check(decodeMorse(draft) === 'SOS OK',
    `${wpm}wpm: following the on-screen rules produced "${decodeMorse(draft)}"`);

  // 5. The fill bar must be full exactly when the dash appears.
  check(dashProgress(dashAtMs(unit), unit) === 1, `${wpm}wpm: fill not full at dash`);
  check(liveSymbol(dashAtMs(unit), unit) === '-', `${wpm}wpm: no dash when fill is full`);
}

console.log('checked 5 speeds from 5 to 20 wpm');
console.log(problems.length === 0
  ? 'PASS: what the key shows is always what it records'
  : 'FAIL:\n' + problems.slice(0, 8).join('\n'));
process.exit(problems.length ? 1 : 0);

/**
 * Simulates the exact scheduling useTone performs, using a fake clock,
 * to prove the highlight lands on the right letter while the tone sounds.
 */
import { buildSchedule, encodeText, splitLetters, answerLetters } from '../src/morse';

const morse = encodeText('HI YOU');
const unit = 100;
const schedule = buildSchedule(morse, unit);
const answer = answerLetters(morse);

type Event = { at: number; run: () => void };
const events: Event[] = [];
let tone = false;
let active = -1;

let elapsed = 0;
for (const beat of schedule.beats) {
  const at = elapsed;
  events.push({ at, run: () => { tone = beat.on; } });
  elapsed += beat.ms;
}
schedule.letters.forEach((letter, index) => {
  events.push({ at: letter.startMs, run: () => { active = index; } });
});
events.push({ at: schedule.totalMs, run: () => { tone = false; active = -1; } });
events.sort((a, b) => a.at - b.at);

// Sample the state every 10ms and record what the user would see/hear.
let cursor = 0;
const problems: string[] = [];
const seen = new Set<number>();
for (let t = 0; t <= schedule.totalMs; t += 10) {
  while (cursor < events.length && events[cursor].at <= t) events[cursor++].run();
  if (tone) {
    if (active < 0) problems.push(`t=${t}: tone on but nothing highlighted`);
    else {
      seen.add(active);
      const w = schedule.letters[active];
      if (t < w.startMs || t > w.endMs) problems.push(`t=${t}: highlight ${active} outside its window`);
    }
  }
}

if (active !== -1 || tone) problems.push('playback did not reset at the end');
if (seen.size !== answer.length) problems.push(`only ${seen.size}/${answer.length} letters highlighted`);

console.log('message  :', 'HI YOU');
console.log('letters  :', answer.join(''));
console.log('duration :', schedule.totalMs + 'ms');
console.log('highlighted while sounding:', [...seen].map((i) => answer[i]).join(''));
console.log(problems.length === 0 ? 'PASS: tone and highlight stay in sync' : 'FAIL:\n' + problems.slice(0,5).join('\n'));
process.exit(problems.length === 0 ? 0 : 1);

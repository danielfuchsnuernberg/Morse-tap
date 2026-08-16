/**
 * A full restart cycle: use the app, write everything out, read it back,
 * and check you land exactly where you left off.
 *
 * Uses the real parsers, with JSON standing in for the device store.
 */
import {
  parsePrefs, parseSession, parseMessages, trimMessages, highestIdNumber,
  MAX_STORED_MESSAGES,
} from '../src/storage';
import { DEFAULT_PREFS, clampEffective, type Prefs } from '../src/settings';
import { ECHO_START, EMPTY_PUZZLE, encodeText, echoHear, echoTap, splitLetters } from '../src/morse';
import type { Message } from '../src/screens/KeyScreen';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

/** Write then read, the way the app does across a restart. */
const cycle = {
  prefs: (p: Prefs) => parsePrefs(JSON.stringify(p)),
  session: (room: string, autoJoin: boolean) =>
    parseSession(JSON.stringify({ room, autoJoin })),
  messages: (m: Message[]) => parseMessages(JSON.stringify(trimMessages(m))),
};

/* ---- settings survive ---- */
for (const prefs of [
  DEFAULT_PREFS,
  clampEffective({ ...DEFAULT_PREFS, mode: 'farnsworth', charWpm: 22, effectiveWpm: 4 }),
  { ...DEFAULT_PREFS, beginnerWpm: 3, soundOn: false, hapticsOn: false },
  { ...DEFAULT_PREFS, decodeStyle: 'type' as const, serverUrl: 'wss://example.test' },
]) {
  check(JSON.stringify(cycle.prefs(prefs)) === JSON.stringify(prefs),
    `settings changed across restart: ${JSON.stringify(prefs)}`);
}

/* ---- room rejoins itself ---- */
{
  const joined = cycle.session('BANANA7', true);
  check(joined.room === 'BANANA7' && joined.autoJoin, 'a joined room did not rejoin');

  const left = cycle.session('BANANA7', false);
  check(left.room === 'BANANA7', 'the room code was forgotten after leaving');
  check(!left.autoJoin, 'leaving a room still rejoined it');

  const never = cycle.session('', false);
  check(never.room === '' && !never.autoJoin, 'a blank room came back wrong');
}

/* ---- half-decoded messages resume where they were ---- */
{
  const symbols = encodeText('I LOVE YOU');
  const codes = splitLetters(symbols).map((token) => token.code);

  // Decode the first three letters, then "close the app".
  let echo = ECHO_START;
  codes.slice(0, 3).forEach((code) => {
    echo = echoHear(echo);
    code.split('').forEach((symbol) => {
      echo = echoTap(symbols, echo, symbol as '.' | '-');
    });
  });
  check(echo.index === 3, 'setup: should be three letters in');

  const before: Message[] = [
    { id: 'm1', mine: true, symbols: encodeText('OK'), at: 1, puzzle: EMPTY_PUZZLE, echo: ECHO_START },
    { id: 'm2', mine: false, symbols, at: 2, puzzle: EMPTY_PUZZLE, echo },
  ];
  const after = cycle.messages(before);

  check(after.length === 2, 'a message went missing');
  check(after[1].echo.index === 3, 'decoding progress was lost');
  check(after[1].symbols === symbols, 'the message itself changed');
  check(after[0].mine === true && after[1].mine === false, 'who sent what got confused');

  // And decoding carries on correctly from the restored state.
  let resumed = after[1].echo;
  codes.slice(3).forEach((code) => {
    resumed = echoHear(resumed);
    code.split('').forEach((symbol) => {
      resumed = echoTap(symbols, resumed, symbol as '.' | '-');
    });
  });
  check(resumed.index === codes.length, 'could not finish decoding after a restart');
}

/* ---- ids never collide with restored ones ---- */
{
  const restored = parseMessages(JSON.stringify([
    { id: 'm7', mine: false, symbols: '...', at: 1 },
    { id: 'm2', mine: true, symbols: '---', at: 2 },
  ]));
  let counter = highestIdNumber(restored);
  const fresh = `m${++counter}`;
  check(!restored.some((m) => m.id === fresh), `new id ${fresh} collided with a restored one`);
  check(fresh === 'm8', `expected m8, got ${fresh}`);
}

/* ---- a long history is capped without losing the newest ---- */
{
  const many: Message[] = Array.from({ length: MAX_STORED_MESSAGES + 75 }, (_, index) => ({
    id: `m${index}`, mine: index % 2 === 0, symbols: '...', at: index,
    puzzle: EMPTY_PUZZLE, echo: ECHO_START,
  }));
  const after = cycle.messages(many);
  check(after.length === MAX_STORED_MESSAGES, `kept ${after.length} messages`);
  check(after[after.length - 1].id === `m${MAX_STORED_MESSAGES + 74}`, 'the newest was trimmed away');
}

/* ---- corrupt storage must never stop the app opening ---- */
for (const junk of ['', '{', 'null', '[1,2,3]', '"text"', '{"mode":"wizard"}']) {
  const prefs = parsePrefs(junk);
  check(prefs.mode === 'beginner' || prefs.mode === 'farnsworth', `bad prefs from ${junk}`);
  check(Array.isArray(parseMessages(junk)), `bad messages from ${junk}`);
  check(typeof parseSession(junk).room === 'string', `bad session from ${junk}`);
}

console.log('cycled settings, room, messages and junk through a simulated restart');
console.log(problems.length === 0
  ? 'PASS: the app reopens exactly where you left it'
  : `FAIL (${problems.length}):\n` + problems.slice(0, 6).join('\n'));
process.exit(problems.length ? 1 : 0);

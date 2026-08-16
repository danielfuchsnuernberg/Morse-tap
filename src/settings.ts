import { evenTiming, farnsworthTiming, type Timing } from './morse';

export type Mode = 'beginner' | 'farnsworth';

export type DecodeStyle = 'echo' | 'type';

export type Prefs = {
  mode: Mode;
  /**
   * How you unlock a received message.
   * 'echo' - hear each letter, see its pattern, tap it back
   * 'type' - read the patterns and type the letters
   */
  decodeStyle: DecodeStyle;
  /** Beginner: the one speed everything runs at. */
  beginnerWpm: number;
  /** Farnsworth: how fast each letter itself is sent. */
  charWpm: number;
  /** Farnsworth: the overall pace, once the gaps are stretched. */
  effectiveWpm: number;
  soundOn: boolean;
  hapticsOn: boolean;
  serverUrl: string;
};

export const DEFAULT_PREFS: Prefs = {
  mode: 'beginner',
  decodeStyle: 'echo',
  beginnerWpm: 5,
  charWpm: 18,
  effectiveWpm: 9,
  soundOn: true,
  hapticsOn: true,
  serverUrl: 'wss://morse-tap-server.onrender.com',
};

/**
 * Speed ladders. Fine steps at the slow end where one word per minute
 * makes a real difference, coarser once you're quick.
 */
export const BEGINNER_SPEEDS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20];
export const CHAR_SPEEDS = [8, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25];
export const EFFECTIVE_SPEEDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];

/** Snap a value onto a ladder, picking the closest rung. */
export function nearestIn(ladder: number[], value: number): number {
  return ladder.reduce((best, rung) =>
    Math.abs(rung - value) < Math.abs(best - value) ? rung : best
  );
}

/**
 * Move one rung up or down a ladder.
 *
 * @param ceiling optional cap - the effective speed can never climb
 *   above the character speed, or it isn't Farnsworth any more.
 */
export function stepValue(
  ladder: number[],
  current: number,
  direction: 1 | -1,
  ceiling?: number
): number {
  const allowed = ceiling === undefined ? ladder : ladder.filter((rung) => rung <= ceiling);
  if (allowed.length === 0) return current;

  const index = allowed.indexOf(nearestIn(allowed, current));
  const next = index + direction;
  if (next < 0 || next >= allowed.length) return allowed[index];
  return allowed[next];
}

/** True when there's nowhere further to go in that direction. */
export function atLimit(
  ladder: number[],
  current: number,
  direction: 1 | -1,
  ceiling?: number
): boolean {
  return stepValue(ladder, current, direction, ceiling) === nearestIn(
    ceiling === undefined ? ladder : ladder.filter((rung) => rung <= ceiling),
    current
  );
}

/** The timing profile the whole app runs on, derived from the prefs. */
export function timingFor(prefs: Prefs): Timing {
  return prefs.mode === 'farnsworth'
    ? farnsworthTiming(prefs.charWpm, prefs.effectiveWpm)
    : evenTiming(prefs.beginnerWpm);
}

/** Beginner mode gets the Space button; Farnsworth uses real pauses. */
export function usesSpaceButton(prefs: Prefs): boolean {
  return prefs.mode === 'beginner';
}

/** In Farnsworth mode a long pause starts a new word, as in real morse. */
export function allowsTimedWordBreak(prefs: Prefs): boolean {
  return prefs.mode === 'farnsworth';
}

/** True when received messages are decoded by ear and tapped back. */
export function usesEchoDecoding(prefs: Prefs): boolean {
  return prefs.decodeStyle === 'echo';
}

/** Effective speed can't exceed character speed - that isn't Farnsworth. */
export function clampEffective(prefs: Prefs): Prefs {
  if (prefs.effectiveWpm <= prefs.charWpm) return prefs;
  const highest = [...EFFECTIVE_SPEEDS].reverse().find((wpm) => wpm <= prefs.charWpm);
  return { ...prefs, effectiveWpm: highest ?? EFFECTIVE_SPEEDS[0] };
}

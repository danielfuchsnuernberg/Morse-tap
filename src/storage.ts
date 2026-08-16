import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PREFS, clampEffective, type Prefs } from './settings';
import { ECHO_START, EMPTY_PUZZLE } from './morse';
import type { Message } from './screens/KeyScreen';

const KEY_PREFS = 'morse-tap:prefs:v1';
const KEY_SESSION = 'morse-tap:session:v1';
const KEY_MESSAGES = 'morse-tap:messages:v1';

/** Keeping every message forever would eventually get slow. */
export const MAX_STORED_MESSAGES = 200;

export type Session = {
  room: string;
  /** Whether to rejoin that room automatically next launch. */
  autoJoin: boolean;
};

export const EMPTY_SESSION: Session = { room: '', autoJoin: false };

/* ------------------------------------------------------------------ */
/* Parsing - pure, so it can be tested without a device                */
/* ------------------------------------------------------------------ */

/**
 * Rebuild prefs from stored JSON, filling in anything missing.
 *
 * Anything unreadable falls back to defaults rather than throwing: a
 * corrupt setting should never stop the app opening.
 */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return DEFAULT_PREFS;
    const merged: Prefs = {
      ...DEFAULT_PREFS,
      ...stored,
      mode: stored.mode === 'farnsworth' ? 'farnsworth' : 'beginner',
      decodeStyle: stored.decodeStyle === 'type' ? 'type' : 'echo',
      soundOn: stored.soundOn !== false,
      hapticsOn: stored.hapticsOn !== false,
      serverUrl:
        typeof stored.serverUrl === 'string' && stored.serverUrl.length > 0
          ? stored.serverUrl
          : DEFAULT_PREFS.serverUrl,
    };
    for (const key of ['beginnerWpm', 'charWpm', 'effectiveWpm'] as const) {
      if (typeof merged[key] !== 'number' || !Number.isFinite(merged[key])) {
        merged[key] = DEFAULT_PREFS[key];
      }
    }
    return clampEffective(merged);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function parseSession(raw: string | null): Session {
  if (!raw) return EMPTY_SESSION;
  try {
    const stored = JSON.parse(raw);
    const room = typeof stored?.room === 'string' ? stored.room.slice(0, 12) : '';
    return { room, autoJoin: stored?.autoJoin === true && room.length >= 3 };
  } catch {
    return EMPTY_SESSION;
  }
}

/**
 * Rebuild the message list. Anything that isn't a well-formed message
 * is dropped rather than crashing the log.
 */
export function parseMessages(raw: string | null): Message[] {
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.symbols === 'string' &&
          item.symbols.length > 0 &&
          typeof item.mine === 'boolean'
      )
      .map((item) => ({
        id: item.id,
        mine: item.mine,
        symbols: item.symbols,
        at: typeof item.at === 'number' ? item.at : Date.now(),
        puzzle: { ...EMPTY_PUZZLE, ...(item.puzzle ?? {}) },
        echo: { ...ECHO_START, ...(item.echo ?? {}) },
      }))
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

/** Trim to the newest messages before writing. */
export function trimMessages(messages: Message[]): Message[] {
  return messages.slice(-MAX_STORED_MESSAGES);
}

/**
 * The highest numeric suffix already used, so new ids don't collide
 * with ones restored from a previous session.
 */
export function highestIdNumber(messages: Message[]): number {
  return messages.reduce((highest, message) => {
    const match = /^m(\d+)$/.exec(message.id);
    const value = match ? Number(match[1]) : 0;
    return value > highest ? value : highest;
  }, 0);
}

/* ------------------------------------------------------------------ */
/* Reading and writing                                                 */
/* ------------------------------------------------------------------ */

export async function loadAll(): Promise<{
  prefs: Prefs;
  session: Session;
  messages: Message[];
}> {
  try {
    const [prefs, session, messages] = await AsyncStorage.multiGet([
      KEY_PREFS,
      KEY_SESSION,
      KEY_MESSAGES,
    ]);
    return {
      prefs: parsePrefs(prefs[1]),
      session: parseSession(session[1]),
      messages: parseMessages(messages[1]),
    };
  } catch {
    return { prefs: DEFAULT_PREFS, session: EMPTY_SESSION, messages: [] };
  }
}

const write = (key: string, value: unknown) =>
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);

export const savePrefs = (prefs: Prefs) => write(KEY_PREFS, prefs);
export const saveSession = (session: Session) => write(KEY_SESSION, session);
export const saveMessages = (messages: Message[]) =>
  write(KEY_MESSAGES, trimMessages(messages));

export async function clearMessages(): Promise<void> {
  await AsyncStorage.removeItem(KEY_MESSAGES).catch(() => undefined);
}

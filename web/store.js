/**
 * Everything the app remembers, kept in the browser.
 *
 * Same shape as the phone app's storage, and just as forgiving:
 * corrupt data falls back to defaults rather than breaking startup.
 */
import { sanitizeEcho, echoLetterCount } from './lib/morse.js';

const KEY = 'morse-tap:v1';

export const DEFAULTS = {
  room: '',
  autoJoin: false,
  mode: 'beginner',
  beginnerWpm: 5,
  charWpm: 18,
  effectiveWpm: 9,
  soundOn: true,
  serverUrl: 'wss://morse-tap-server.onrender.com',
  messages: [],
};

export const MAX_MESSAGES = 200;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
    const state = { ...DEFAULTS, ...stored };
    state.mode = stored.mode === 'farnsworth' ? 'farnsworth' : 'beginner';
    state.soundOn = stored.soundOn !== false;
    state.room = typeof stored.room === 'string' ? stored.room.slice(0, 12) : '';
    state.autoJoin = stored.autoJoin === true && state.room.length >= 3;
    for (const key of ['beginnerWpm', 'charWpm', 'effectiveWpm']) {
      if (typeof state[key] !== 'number' || !Number.isFinite(state[key])) {
        state[key] = DEFAULTS[key];
      }
    }
    if (state.effectiveWpm > state.charWpm) state.effectiveWpm = state.charWpm;
    state.messages = Array.isArray(stored.messages)
      ? stored.messages
          .filter((m) => m && typeof m.symbols === 'string' && m.symbols.length > 0)
          .map((m) => ({
            ...m,
            // An older save stored decode progress in a different shape;
            // rebuild it rather than trusting it and crashing on load.
            echo: sanitizeEcho(m.echo, echoLetterCount(m.symbols)),
          }))
          .slice(-MAX_MESSAGES)
      : [];
    if (typeof state.serverUrl !== 'string' || state.serverUrl.length === 0) {
      state.serverUrl = DEFAULTS.serverUrl;
    }
    return state;
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(state) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, messages: state.messages.slice(-MAX_MESSAGES) })
    );
  } catch {
    // A full or disabled storage must never break the app.
  }
}

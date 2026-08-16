/**
 * Morse code core. Pure functions only - no React, no side effects.
 * Everything here is unit-tested in morse.test.ts
 */
/** Letter -> morse. "." = dit (1 unit), "-" = dah (3 units). */
export const MORSE_TABLE = {
    A: '.-',
    B: '-...',
    C: '-.-.',
    D: '-..',
    E: '.',
    F: '..-.',
    G: '--.',
    H: '....',
    I: '..',
    J: '.---',
    K: '-.-',
    L: '.-..',
    M: '--',
    N: '-.',
    O: '---',
    P: '.--.',
    Q: '--.-',
    R: '.-.',
    S: '...',
    T: '-',
    U: '..-',
    V: '...-',
    W: '.--',
    X: '-..-',
    Y: '-.--',
    Z: '--..',
    '0': '-----',
    '1': '.----',
    '2': '..---',
    '3': '...--',
    '4': '....-',
    '5': '.....',
    '6': '-....',
    '7': '--...',
    '8': '---..',
    '9': '----.',
    '.': '.-.-.-',
    ',': '--..--',
    '?': '..--..',
    "'": '.----.',
    '!': '-.-.--',
    '/': '-..-.',
    '(': '-.--.',
    ')': '-.--.-',
    '&': '.-...',
    ':': '---...',
    '=': '-...-',
    '+': '.-.-.',
    '-': '-....-',
    '"': '.-..-.',
    '@': '.--.-.',
};
/** morse -> letter, built from MORSE_TABLE so the two can never drift apart. */
export const REVERSE_TABLE = Object.fromEntries(Object.entries(MORSE_TABLE).map(([char, code]) => [code, char]));
/** Separator used between letters inside a word. */
export const LETTER_GAP = ' ';
/** Separator used between words. */
export const WORD_GAP = ' / ';
/**
 * Turn plain text into a morse string.
 * "HI YOU" -> ".... .. / -.-- --- ..-"
 * Unsupported characters are skipped.
 */
export function encodeText(text) {
    return text
        .toUpperCase()
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map((word) => word
        .split('')
        .map((char) => MORSE_TABLE[char])
        .filter((code) => Boolean(code))
        .join(LETTER_GAP))
        .filter((word) => word.length > 0)
        .join(WORD_GAP);
}
/**
 * Turn a morse string back into plain text.
 * Unknown codes become "?" so the user can see something went wrong.
 */
export function decodeMorse(morse) {
    const trimmed = morse.trim();
    if (trimmed.length === 0)
        return '';
    return trimmed
        .split('/')
        .map((word) => word
        .trim()
        .split(/\s+/)
        .filter((code) => code.length > 0)
        .map((code) => REVERSE_TABLE[code] ?? '?')
        .join(''))
        .filter((word) => word.length > 0)
        .join(' ');
}
/* ------------------------------------------------------------------ */
/* Tap timing                                                          */
/* ------------------------------------------------------------------ */
/** Standard morse timing, expressed in "units". */
export const TIMING = {
    /** A dit is 1 unit, a dah is 3. Anything held past 2 units counts as a dah. */
    dashThreshold: 2,
    /** Gap inside a letter is 1 unit, between letters is 3. Split at 2. */
    letterGapThreshold: 2,
    /** Gap between words is 7 units. Split at 5. */
    wordGapThreshold: 5,
};
/** How long one unit lasts at a given words-per-minute. PARIS standard. */
export function unitMsForWpm(wpm) {
    return Math.round(1200 / wpm);
}
/** Everything at one speed - the plain textbook ratios. */
export function evenTiming(wpm) {
    const unit = unitMsForWpm(wpm);
    return { charUnitMs: unit, letterGapMs: unit * 3, wordGapMs: unit * 7 };
}
/**
 * Farnsworth timing: letters sent at `charWpm`, but padded out so the
 * message overall runs at `effectiveWpm`.
 *
 * Uses the ARRL formula. The extra delay is split 3:7 between the
 * letter gap and the word gap, matching the standard ratios.
 *
 * If the effective speed isn't slower than the character speed there's
 * nothing to stretch, so this falls back to even timing.
 */
export function farnsworthTiming(charWpm, effectiveWpm) {
    const charUnitMs = unitMsForWpm(charWpm);
    if (effectiveWpm >= charWpm)
        return evenTiming(charWpm);
    // Total padding to distribute, in milliseconds.
    const totalDelayMs = (1000 * (60 * charWpm - 37.2 * effectiveWpm)) / (effectiveWpm * charWpm);
    const letterPadMs = (3 * totalDelayMs) / 19;
    const wordPadMs = (7 * totalDelayMs) / 19;
    return {
        charUnitMs,
        letterGapMs: Math.round(charUnitMs * 3 + letterPadMs),
        wordGapMs: Math.round(charUnitMs * 7 + wordPadMs),
    };
}
/** Hold past this and the press becomes a dash. */
export function dashThresholdMs(timing) {
    return timing.charUnitMs * TIMING.dashThreshold;
}
/** Silence past this and the current letter closes. */
export function letterThresholdMs(timing) {
    return (timing.letterGapMs * TIMING.letterGapThreshold) / 3;
}
/** Silence past this and the current word closes. */
export function wordThresholdMs(timing) {
    return (timing.wordGapMs * TIMING.wordGapThreshold) / 7;
}
/** Was that press a dit or a dah? */
export function symbolForPress(durationMs, timing) {
    return durationMs >= dashThresholdMs(timing) ? '-' : '.';
}
/** How long was the silence, in morse terms? */
export function kindForGap(gapMs, timing, allowWordBreak) {
    if (allowWordBreak && gapMs >= wordThresholdMs(timing))
        return 'new-word';
    if (gapMs >= letterThresholdMs(timing))
        return 'new-letter';
    return 'same-letter';
}
/** Was that press a dit or a dah? */
export function pressToSymbol(durationMs, unitMs) {
    return durationMs >= TIMING.dashThreshold * unitMs ? '-' : '.';
}
/**
 * What the key is producing *right now*, while still held down.
 * Same rule as pressToSymbol - the key can show it live rather than
 * making the user guess and find out on release.
 */
export function liveSymbol(heldMs, unitMs) {
    return pressToSymbol(heldMs, unitMs);
}
/** How long a press must last to become a dash. */
export function dashAtMs(unitMs) {
    return TIMING.dashThreshold * unitMs;
}
/** How long a silence must last before the letter closes. */
export function letterClosesAtMs(unitMs) {
    return TIMING.letterGapThreshold * unitMs;
}
/** How long a silence must last before the word closes. */
export function wordClosesAtMs(unitMs) {
    return TIMING.wordGapThreshold * unitMs;
}
/**
 * Progress towards becoming a dash, 0 to 1. Drives the fill on the key
 * so the user can watch the dot turn into a dash.
 */
export function dashProgress(heldMs, unitMs) {
    return clamp01(heldMs / dashAtMs(unitMs));
}
/**
 * Progress towards the current letter closing, 0 to 1. At 1 the next
 * press starts a new letter.
 */
export function letterProgress(idleMs, unitMs) {
    return clamp01(idleMs / letterClosesAtMs(unitMs));
}
function clamp01(value) {
    if (!Number.isFinite(value) || value < 0)
        return 0;
    return value > 1 ? 1 : value;
}
/** How long was the silence, in morse terms? */
export function gapToKind(gapMs, unitMs) {
    if (gapMs >= TIMING.wordGapThreshold * unitMs)
        return 'new-word';
    if (gapMs >= TIMING.letterGapThreshold * unitMs)
        return 'new-letter';
    return 'same-letter';
}
/**
 * Append one key press to a morse string.
 *
 * Note what this does *not* do: it never starts a new word on its own.
 * A long pause and a moment's thinking look identical to a timer, so
 * word breaks are put in deliberately with addWordBreak instead. That
 * way you can take as long as you like between letters.
 *
 * @param current   morse built up so far, e.g. ".... ."
 * @param gapBefore ms of silence since the previous release (0 for first press)
 * @param duration  ms the key was held down
 * @param unitMs    length of one morse unit
 */
export function applyPress(current, gapBefore, duration, unitMs) {
    return applyPressWith(current, gapBefore, duration, evenTiming(1200 / unitMs), false);
}
/**
 * The real version, taking a full timing profile.
 *
 * @param allowWordBreak when false, a long pause only ends the letter -
 *   used in Beginner mode, where words come from the Space button. When
 *   true, a long enough pause starts a new word, the way real morse works.
 */
export function applyPressWith(current, gapBefore, duration, timing, allowWordBreak) {
    const symbol = symbolForPress(duration, timing);
    if (current.length === 0)
        return symbol;
    // A break that was put in deliberately already stands - don't add another.
    if (current.endsWith(WORD_GAP) || current.endsWith(LETTER_GAP))
        return current + symbol;
    const kind = kindForGap(gapBefore, timing, allowWordBreak);
    if (kind === 'new-word')
        return current + WORD_GAP + symbol;
    if (kind === 'new-letter')
        return current + LETTER_GAP + symbol;
    return current + symbol;
}
/**
 * Put a word break in deliberately. Does nothing on an empty draft or
 * when a break is already pending, so it can't produce a double space.
 */
export function addWordBreak(current) {
    const trimmed = current.replace(/(\s\/\s|\s)+$/, '');
    if (trimmed.length === 0)
        return '';
    return trimmed + WORD_GAP;
}
/** True when a word break is already waiting to be filled. */
export function hasPendingWordBreak(current) {
    return current.endsWith(WORD_GAP);
}
/** Delete the last symbol (or separator) - used by the backspace button. */
export function undoLast(current) {
    if (current.length === 0)
        return '';
    if (current.endsWith(WORD_GAP))
        return current.slice(0, -WORD_GAP.length);
    if (current.endsWith(LETTER_GAP))
        return current.slice(0, -LETTER_GAP.length);
    return current.slice(0, -1).replace(/(\s\/\s|\s)$/, '');
}
/**
 * Rebuild a morse string from letter tokens, restoring the separators.
 */
export function joinLetters(tokens) {
    return tokens
        .map((token, index) => index === 0 ? token.code : (token.startsWord ? WORD_GAP : LETTER_GAP) + token.code)
        .join('');
}
/**
 * Delete the whole of the last letter, however many symbols it had.
 * A mistake three dots deep shouldn't take three taps to clear.
 */
export function undoLastLetter(current) {
    const tokens = splitLetters(current);
    if (tokens.length === 0)
        return '';
    return joinLetters(tokens.slice(0, -1));
}
/**
 * Break a morse string into individual letters, remembering where
 * words start. Word gaps are structure, not letters, so they never
 * appear as their own token.
 */
export function splitLetters(morse) {
    const tokens = [];
    morse
        .trim()
        .split('/')
        .forEach((word) => {
        word
            .trim()
            .split(/\s+/)
            .filter((code) => code.length > 0)
            .forEach((code, indexInWord) => {
            tokens.push({ code, startsWord: indexInWord === 0 });
        });
    });
    return tokens;
}
/**
 * Turn a morse string into a playable schedule: an on/off timeline for
 * the tone, plus the exact window each letter occupies so the UI can
 * highlight along with the sound.
 */
export function buildSchedule(morse, unitMs) {
    return buildScheduleWith(morse, evenTiming(1200 / unitMs));
}
/**
 * Build a playback schedule from a full timing profile. In Farnsworth
 * mode the letters sound fast while the silences stay generous, which
 * is the whole point of it.
 */
export function buildScheduleWith(morse, timing) {
    const beats = [];
    const letters = [];
    let elapsed = 0;
    const push = (on, ms) => {
        if (ms <= 0)
            return;
        const last = beats[beats.length - 1];
        if (last && last.on === on) {
            last.ms += ms;
        }
        else {
            beats.push({ on, ms });
        }
        elapsed += ms;
    };
    splitLetters(morse).forEach((token, index) => {
        if (index > 0)
            push(false, token.startsWord ? timing.wordGapMs : timing.letterGapMs);
        const startMs = elapsed;
        token.code.split('').forEach((symbol, symbolIndex) => {
            if (symbolIndex > 0)
                push(false, timing.charUnitMs);
            push(true, symbol === '-' ? timing.charUnitMs * 3 : timing.charUnitMs);
        });
        letters.push({ ...token, startMs, endMs: elapsed });
    });
    return { beats, letters, totalMs: elapsed };
}
/**
 * Just the on/off timeline. ".- -" at 100ms/unit ->
 *   on 100, off 100, on 300, off 300, on 300
 */
export function morseToTimeline(morse, unitMs) {
    return buildSchedule(morse, unitMs).beats;
}
/** Total playback length in ms. */
export function timelineDuration(beats) {
    return beats.reduce((total, beat) => total + beat.ms, 0);
}
/* ------------------------------------------------------------------ */
/* Decode puzzle                                                       */
/* ------------------------------------------------------------------ */
/** The correct answer, one character per letter token, spaces stripped. */
export function answerLetters(morse) {
    return splitLetters(morse).map((token) => REVERSE_TABLE[token.code] ?? '?');
}
/**
 * Compare what the user typed against the answer, position by position.
 * The guess is letters only - word breaks are handled by the layout, so
 * the user never has to guess where the spaces go.
 */
export function markGuess(morse, guess) {
    const answer = answerLetters(morse);
    const cleaned = guess.toUpperCase().replace(/[^A-Z0-9.,?!/@=-]/g, '');
    return answer.map((letter, index) => {
        const typed = cleaned[index];
        if (!typed)
            return 'blank';
        return typed === letter ? 'correct' : 'wrong';
    });
}
/** True once every letter has been typed correctly. */
export function isSolved(morse, guess) {
    const marks = markGuess(morse, guess);
    return marks.length > 0 && marks.every((mark) => mark === 'correct');
}
export const EMPTY_PUZZLE = { guess: '', given: [], openedUp: false };
/**
 * Work out the state of every tile. A hint always wins over what was
 * typed, so a revealed letter never shows as wrong.
 */
export function tileStates(morse, puzzle) {
    const marks = markGuess(morse, puzzle.guess);
    return marks.map((mark, index) => {
        if (puzzle.openedUp || puzzle.given.includes(index))
            return 'given';
        return mark;
    });
}
/**
 * The next letter a hint should hand over: the leftmost one the user
 * hasn't already got. Returns -1 when there's nothing left to give.
 */
export function nextHintIndex(morse, puzzle) {
    const states = tileStates(morse, puzzle);
    return states.findIndex((state) => state !== 'correct' && state !== 'given');
}
/** True once every letter is either typed correctly or revealed. */
export function isComplete(morse, puzzle) {
    const states = tileStates(morse, puzzle);
    return states.length > 0 && states.every((state) => state === 'correct' || state === 'given');
}
/** True when they finished it without taking a single hint. */
export function isCleanSolve(morse, puzzle) {
    return isSolved(morse, puzzle.guess) && puzzle.given.length === 0 && !puzzle.openedUp;
}
/**
 * Compare what the user has tapped so far against the message they're
 * aiming for, letter by letter.
 *
 * Word gaps are deliberately not checked. Getting the letters right is
 * the hard part; being strict about pause length between words would
 * punish people for something that doesn't change the meaning.
 */
export function compareToTarget(targetMorse, draftMorse) {
    const target = splitLetters(targetMorse).map((token) => token.code);
    const draft = splitLetters(draftMorse).map((token) => token.code);
    const lastDraftIndex = draft.length - 1;
    const states = target.map((code, index) => {
        if (index >= draft.length)
            return 'pending';
        const tapped = draft[index];
        if (tapped === code)
            return 'done';
        // The final tapped letter may still be under construction.
        if (index === lastDraftIndex && code.startsWith(tapped))
            return 'partial';
        return 'wrong';
    });
    // Anything tapped beyond the end of the target is also wrong.
    const overrun = draft.length > target.length;
    const offTrack = overrun || states.includes('wrong');
    const matched = states.filter((state) => state === 'done').length;
    const complete = target.length > 0 && matched === target.length && !overrun;
    const currentIndex = complete ? -1 : states.findIndex((state) => state !== 'done');
    return { states, currentIndex, matched, complete, offTrack };
}
export const ECHO_START = {
    current: -1,
    heard: false,
    tapped: '',
    missed: false,
    misses: 0,
    solved: [],
    given: [],
    openedUp: false,
};
/** How many letters the message has. */
export function echoLetterCount(morse) {
    return splitLetters(morse).length;
}
/** True when that letter has been got, one way or another. */
export function echoIsDone(state, index) {
    return state.openedUp || state.solved.includes(index) || state.given.includes(index);
}
/** The dots and dashes of the letter being worked on. */
export function echoTargetCode(morse, state) {
    return splitLetters(morse)[state.current]?.code ?? '';
}
/** True once every letter has been got. */
export function echoComplete(morse, state) {
    const total = echoLetterCount(morse);
    if (total === 0)
        return false;
    if (state.openedUp)
        return true;
    for (let index = 0; index < total; index++) {
        if (!echoIsDone(state, index))
            return false;
    }
    return true;
}
/**
 * The next letter still to do, searching forwards from `from` and
 * wrapping round. Returns -1 when everything is done.
 */
export function nextUnsolved(morse, state, from = 0) {
    const total = echoLetterCount(morse);
    for (let step = 0; step < total; step++) {
        const index = (from + step) % total;
        if (!echoIsDone(state, index))
            return index;
    }
    return -1;
}
/** Choose which letter to work on. Any letter, any order. */
export function echoSelect(morse, state, index) {
    const total = echoLetterCount(morse);
    if (index < 0 || index >= total)
        return state;
    if (echoIsDone(state, index))
        return state;
    return { ...state, current: index, heard: false, tapped: '', missed: false };
}
/** Mark the current letter as heard. */
export function echoHear(state) {
    return { ...state, heard: true, missed: false };
}
/**
 * Feed in one tapped symbol.
 *
 * Matching is symbol by symbol, so there's no timing to get right while
 * decoding - only dot versus dash. Get one wrong and the letter resets.
 */
export function echoTap(morse, state, symbol) {
    if (state.current < 0 || echoComplete(morse, state))
        return state;
    if (!state.heard)
        return state;
    const target = echoTargetCode(morse, state);
    if (target.length === 0)
        return state;
    const attempt = state.tapped + symbol;
    if (!target.startsWith(attempt)) {
        return { ...state, tapped: '', missed: true, misses: state.misses + 1 };
    }
    if (attempt === target) {
        const solved = [...state.solved, state.current];
        const next = { ...state, solved, tapped: '', missed: false, heard: false };
        // Move on to the next one still to do, wrapping past the end.
        const following = nextUnsolved(morse, next, state.current + 1);
        return { ...next, current: following };
    }
    return { ...state, tapped: attempt, missed: false };
}
/** Undo one tapped symbol of the letter in progress. */
export function echoUndo(state) {
    if (state.tapped.length === 0)
        return { ...state, missed: false };
    return { ...state, tapped: state.tapped.slice(0, -1), missed: false };
}
/** Hand over the current letter and move to the next one still to do. */
export function echoGiveLetter(morse, state) {
    if (state.current < 0 || echoComplete(morse, state))
        return state;
    const given = [...state.given, state.current];
    const next = { ...state, given, tapped: '', missed: false, heard: false };
    return { ...next, current: nextUnsolved(morse, next, state.current + 1) };
}
/** Give up on the whole message. */
export function echoOpenUp(state) {
    return { ...state, openedUp: true, current: -1 };
}
/** What each tile should be showing right now. */
export function echoTiles(morse, state) {
    return splitLetters(morse).map((_, index) => {
        if (state.openedUp)
            return 'given';
        if (state.solved.includes(index))
            return 'solved';
        if (state.given.includes(index))
            return 'given';
        return index === state.current ? 'current' : 'todo';
    });
}
/** How many letters are done. */
export function echoProgress(morse, state) {
    if (state.openedUp)
        return echoLetterCount(morse);
    return state.solved.length + state.given.length;
}
/** True when the whole message was done with no misses and no help. */
export function echoClean(morse, state) {
    return (echoComplete(morse, state) &&
        state.misses === 0 &&
        state.given.length === 0 &&
        !state.openedUp);
}
/** Spoken rhythm, so a beginner can say it out loud while tapping. */
function toHint(code) {
    return code
        .split('')
        .map((symbol) => (symbol === '-' ? 'dah' : 'dit'))
        .join(' ');
}
export const LETTER_CHART = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .map((char) => ({ char, code: MORSE_TABLE[char], hint: toHint(MORSE_TABLE[char]) }));
export const NUMBER_CHART = '0123456789'
    .split('')
    .map((char) => ({ char, code: MORSE_TABLE[char], hint: toHint(MORSE_TABLE[char]) }));
export const PUNCTUATION_CHART = ['.', ',', '?', '!', '/', '@', '-', '=']
    .map((char) => ({ char, code: MORSE_TABLE[char], hint: toHint(MORSE_TABLE[char]) }));

/**
 * The beep, made with Web Audio rather than a sound file.
 *
 * A single oscillator we gate on and off. Cleaner than playing a clip:
 * no asset to download, exact timing, no gap at the loop point.
 *
 * iOS refuses to make sound until the user has touched the screen, so
 * unlock() must be called from inside a real tap handler.
 */
export function createTone() {
  let ctx = null;
  let osc = null;
  let gain = null;
  let unlocked = false;

  const ensure = () => {
    if (ctx) return ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 600;
    osc.connect(gain);
    osc.start();
    return ctx;
  };

  /** Must be called from a touch handler, or iOS stays silent. */
  const unlock = () => {
    const context = ensure();
    if (!context) return;
    if (context.state === 'suspended') context.resume();
    unlocked = true;
  };

  /** Ramp rather than switch, so it doesn't click. */
  const set = (on) => {
    const context = ensure();
    if (!context || !unlocked) return;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(on ? 0.22 : 0, now + 0.008);
  };

  return {
    unlock,
    on: () => set(true),
    off: () => set(false),
    get ready() {
      return unlocked;
    },
  };
}

/**
 * Plays a morse string, calling back as each letter starts so the UI
 * can light up in time with the sound.
 */
export function createPlayer(tone, buildSchedule) {
  let timers = [];

  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
    tone.off();
  };

  const play = (morse, timing, { onLetter, onDone } = {}) => {
    stop();
    const schedule = buildSchedule(morse, timing);
    if (schedule.beats.length === 0) return;

    let elapsed = 0;
    for (const beat of schedule.beats) {
      const at = elapsed;
      timers.push(setTimeout(() => (beat.on ? tone.on() : tone.off()), at));
      elapsed += beat.ms;
    }
    schedule.letters.forEach((letter, index) => {
      timers.push(setTimeout(() => onLetter?.(index), letter.startMs));
    });
    timers.push(
      setTimeout(() => {
        tone.off();
        onLetter?.(-1);
        onDone?.();
      }, schedule.totalMs)
    );
  };

  return { play, stop };
}

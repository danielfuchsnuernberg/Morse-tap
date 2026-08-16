import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import {
  dashThresholdMs,
  letterThresholdMs,
  wordThresholdMs,
  symbolForPress,
  type Timing,
} from '../morse';

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** How often the live readout refreshes while held. 60ms is smooth enough. */
const TICK_MS = 60;

export type Props = {
  timing: Timing;
  /** Farnsworth mode: show how long until the word closes too. */
  showWordCountdown: boolean;
  /** Milliseconds since the last release, or null if nothing typed yet. */
  lastReleaseAt: number | null;
  onPressIn: () => void;
  onPressOut: (durationMs: number, gapBeforeMs: number) => void;
};

/**
 * The key. While held it shows what you are currently making - a dot
 * that visibly becomes a dash the moment you cross the threshold - and
 * while idle it shows how long you have left before the letter closes.
 *
 * No morse knowledge required: hold until it changes, then let go.
 */
export default function MorseKey(props: Props) {
  const [held, setHeld] = useState<number | null>(null);
  const [idle, setIdle] = useState(0);
  const pressStart = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicking = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopTicking, [stopTicking]);

  // While idle, count up towards the letter closing.
  useEffect(() => {
    if (held !== null || props.lastReleaseAt === null) return;
    const tick = setInterval(() => setIdle(Date.now() - props.lastReleaseAt!), TICK_MS);
    return () => clearInterval(tick);
  }, [held, props.lastReleaseAt]);

  const handlePressIn = useCallback(() => {
    pressStart.current = Date.now();
    setHeld(0);
    stopTicking();
    timer.current = setInterval(() => setHeld(Date.now() - pressStart.current), TICK_MS);
    props.onPressIn();
  }, [props, stopTicking]);

  const handlePressOut = useCallback(() => {
    stopTicking();
    const now = Date.now();
    const duration = now - pressStart.current;
    const gapBefore = props.lastReleaseAt === null ? 0 : pressStart.current - props.lastReleaseAt;
    setHeld(null);
    setIdle(0);
    props.onPressOut(duration, gapBefore);
  }, [props, stopTicking]);

  const down = held !== null;
  const symbol = down ? symbolForPress(held, props.timing) : null;
  const isDash = symbol === '-';
  const dashAt = dashThresholdMs(props.timing);
  const fill = down ? clamp01(held / dashAt) : 0;

  // Idle countdown: full bar right after release, empty when the letter closes.
  const showCountdown = !down && props.lastReleaseAt !== null;
  const letterAt = letterThresholdMs(props.timing);
  const wordAt = wordThresholdMs(props.timing);
  const closing = clamp01(idle / letterAt);
  const letterOpen = showCountdown && closing < 1;
  // Between the two thresholds the word is still open.
  const wordClosing = clamp01((idle - letterAt) / Math.max(1, wordAt - letterAt));
  const wordOpen = showCountdown && !letterOpen && props.showWordCountdown && wordClosing < 1;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.key, down && (isDash ? styles.keyDash : styles.keyDot)]}
      >
        {/* fill bar creeps across as you approach dash length */}
        {down && !isDash ? (
          <View style={[styles.fill, { width: `${Math.round(fill * 100)}%` }]} pointerEvents="none" />
        ) : null}

        <View style={styles.keyInner} pointerEvents="none">
          {down ? (
            <>
              <Text style={[styles.mark, isDash && styles.ink]}>
                {isDash ? '—' : '•'}
              </Text>
              <Text style={[styles.markLabel, isDash && styles.ink]}>
                {isDash ? 'DASH' : 'DOT · keep holding'}
              </Text>
            </>
          ) : (
            <Text style={styles.idleLabel}>HOLD</Text>
          )}
        </View>
      </Pressable>

      {/* what happens if you tap again right now */}
      <View style={styles.status}>
        {down ? (
          <Text style={styles.statusText}>
            {isDash
              ? 'Let go — this is a dash'
              : `Hold ${Math.max(0, Math.round(dashAt - (held ?? 0)))}ms more for a dash`}
          </Text>
        ) : letterOpen ? (
          <>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${Math.round((1 - closing) * 100)}%` }]} />
            </View>
            <Text style={styles.statusText}>same letter — tap again before this empties</Text>
          </>
        ) : wordOpen ? (
          <>
            <View style={styles.track}>
              <View
                style={[
                  styles.trackFillWord,
                  { width: `${Math.round((1 - wordClosing) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.statusText}>same word — keep waiting to start a new one</Text>
          </>
        ) : showCountdown ? (
          <Text style={styles.statusText}>
            {props.showWordCountdown
              ? 'new word · next tap starts it'
              : 'letter closed · next tap starts a new one · take as long as you like'}
          </Text>
        ) : (
          <Text style={styles.statusText}>
            tap short for a dot, hold {Math.round(dashAt)}ms for a dash
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginBottom: 6, gap: 5 },
  key: {
    height: 104,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: theme.surfaceHigh,
    borderWidth: 2,
    borderColor: theme.border,
  },
  keyDot: { borderColor: theme.accent },
  keyDash: { backgroundColor: theme.accent, borderColor: theme.accent },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.accentDim,
  },
  keyInner: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  mark: { color: theme.text, fontSize: 44, fontWeight: '900', lineHeight: 48 },
  markLabel: { color: theme.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  idleLabel: { color: theme.textDim, fontSize: 20, fontWeight: '800', letterSpacing: 4 },
  ink: { color: '#000' },
  status: { minHeight: 26, gap: 5, justifyContent: 'center' },
  statusText: { color: theme.textDim, fontSize: 11, textAlign: 'center' },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.border,
    overflow: 'hidden',
  },
  trackFill: { height: 3, backgroundColor: theme.accent },
  trackFillWord: { height: 3, backgroundColor: theme.textDim },
});

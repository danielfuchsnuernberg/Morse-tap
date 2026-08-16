import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { buildScheduleWith, type Timing } from './morse';

export type PlaybackState = {
  /** Which message is sounding right now, or null. */
  messageId: string | null;
  /** Index of the letter currently sounding, or -1 between letters. */
  letterIndex: number;
};

const IDLE: PlaybackState = { messageId: null, letterIndex: -1 };

/**
 * Owns the beep. One looping sine wave that we start and stop -
 * far more reliable than firing a new sound per dit.
 *
 * Also drives the letter-by-letter highlight during playback, so the
 * sound and the UI can never drift apart: both come from one schedule.
 */
export function useTone(soundOn: boolean, hapticsOn: boolean) {
  const player = useAudioPlayer(require('../assets/tone.wav'));
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>(IDLE);
  const [lit, setLit] = useState(false);

  // Let the beep through even when the ringer switch is on silent.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      () => undefined
    );
  }, []);

  useEffect(() => {
    player.loop = true;
  }, [player]);

  const toneOn = useCallback(() => {
    setLit(true);
    // Safari has no vibration API, so don't pretend otherwise.
    if (hapticsOn && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    if (!soundOn) return;
    try {
      player.play();
    } catch {
      // Audio can fail on a simulator or during a call - never crash the key.
    }
  }, [player, soundOn, hapticsOn]);

  const toneOff = useCallback(() => {
    setLit(false);
    if (!soundOn) return;
    try {
      player.pause();
      player.seekTo(0);
    } catch {
      // ignore
    }
  }, [player, soundOn]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    toneOff();
    setPlayback(IDLE);
  }, [clearTimers, toneOff]);

  /**
   * Beep out a whole message and highlight each letter as it sounds.
   * Passing the id of a message that is already playing stops it.
   */
  const play = useCallback(
    (messageId: string, morse: string, timing: Timing) => {
      const alreadyPlaying = playback.messageId === messageId;
      stop();
      if (alreadyPlaying) return;

      const schedule = buildScheduleWith(morse, timing);
      if (schedule.beats.length === 0) return;

      setPlayback({ messageId, letterIndex: -1 });

      let elapsed = 0;
      schedule.beats.forEach((beat) => {
        const at = elapsed;
        timersRef.current.push(setTimeout(() => (beat.on ? toneOn() : toneOff()), at));
        elapsed += beat.ms;
      });

      schedule.letters.forEach((letter, index) => {
        timersRef.current.push(
          setTimeout(() => setPlayback({ messageId, letterIndex: index }), letter.startMs)
        );
      });

      timersRef.current.push(
        setTimeout(() => {
          toneOff();
          setPlayback(IDLE);
        }, schedule.totalMs)
      );
    },
    [playback.messageId, stop, toneOn, toneOff]
  );

  useEffect(() => stop, [stop]);

  return { toneOn, toneOff, play, stop, playback, lit };
}

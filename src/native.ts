/**
 * Guarded access to native modules.
 *
 * A release build links its own native code. If any of it is missing or
 * misconfigured, a plain `import` throws while the bundle is loading -
 * before React exists, before any error boundary can catch it. The app
 * then sits on the splash screen for ever with no explanation, which is
 * exactly what happened in v027 through v030.
 *
 * So each optional module is required defensively. A failure is recorded
 * and reported on screen instead of stopping the app from starting.
 */

export type NativeFailure = { module: string; message: string };

const failures: NativeFailure[] = [];

function load<T>(name: string, loader: () => T): T | null {
  try {
    const module = loader();
    if (!module) {
      failures.push({ module: name, message: 'loaded but empty' });
      return null;
    }
    return module;
  } catch (error) {
    failures.push({
      module: name,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Everything that failed to load, for showing the user. */
export function nativeFailures(): NativeFailure[] {
  return [...failures];
}

/* ------------------------------------------------------------------ */
/* The modules                                                         */
/* ------------------------------------------------------------------ */

type AudioModule = typeof import('expo-audio');
type HapticsModule = typeof import('expo-haptics');
type KeepAwakeModule = typeof import('expo-keep-awake');
type SplashModule = typeof import('expo-splash-screen');
type StorageModule = typeof import('@react-native-async-storage/async-storage').default;

export const Audio = load<AudioModule>('expo-audio', () => require('expo-audio'));
export const Haptics = load<HapticsModule>('expo-haptics', () => require('expo-haptics'));
export const KeepAwake = load<KeepAwakeModule>('expo-keep-awake', () =>
  require('expo-keep-awake')
);
export const Splash = load<SplashModule>('expo-splash-screen', () =>
  require('expo-splash-screen')
);
export const Storage = load<StorageModule>(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage').default
);

/** The tone asset, which a release build resolves differently. */
export const ToneAsset = load<unknown>('assets/tone.wav', () => require('../assets/tone.wav'));

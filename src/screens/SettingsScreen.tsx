import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../theme';
import { letterThresholdMs, wordThresholdMs } from '../morse';
import {
  BEGINNER_SPEEDS,
  CHAR_SPEEDS,
  EFFECTIVE_SPEEDS,
  atLimit,
  clampEffective,
  nearestIn,
  stepValue,
  timingFor,
  type Prefs,
} from '../settings';

type Props = {
  prefs: Prefs;
  onChange: (prefs: Prefs) => void;
  messageCount: number;
  onClearHistory: () => void;
};

function Stepper({
  ladder,
  value,
  ceiling,
  unit,
  onChange,
}: {
  ladder: number[];
  value: number;
  ceiling?: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const atBottom = atLimit(ladder, value, -1, ceiling);
  const atTop = atLimit(ladder, value, 1, ceiling);
  const shown = nearestIn(ceiling === undefined ? ladder : ladder.filter((r) => r <= ceiling), value);

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepButton, atBottom && styles.stepButtonOff]}
        onPress={() => onChange(stepValue(ladder, value, -1, ceiling))}
        disabled={atBottom}
      >
        <Text style={styles.stepSign}>−</Text>
      </TouchableOpacity>

      <View style={styles.stepValueBox}>
        <Text style={styles.stepValue}>{shown}</Text>
        <Text style={styles.stepUnit}>{unit}</Text>
      </View>

      <TouchableOpacity
        style={[styles.stepButton, atTop && styles.stepButtonOff]}
        onPress={() => onChange(stepValue(ladder, value, 1, ceiling))}
        disabled={atTop}
      >
        <Text style={styles.stepSign}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen({ prefs, onChange, messageCount, onClearHistory }: Props) {
  const set = (patch: Partial<Prefs>) => onChange(clampEffective({ ...prefs, ...patch }));
  const timing = timingFor(prefs);
  const beginner = prefs.mode === 'beginner';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Mode</Text>
      <View style={styles.card}>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.mode, beginner && styles.modeActive]}
            onPress={() => set({ mode: 'beginner' })}
          >
            <Text style={[styles.modeTitle, beginner && styles.modeTitleActive]}>Beginner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mode, !beginner && styles.modeActive]}
            onPress={() => set({ mode: 'farnsworth' })}
          >
            <Text style={[styles.modeTitle, !beginner && styles.modeTitleActive]}>Farnsworth</Text>
          </TouchableOpacity>
        </View>

        {beginner ? (
          <Text style={styles.help}>
            Everything runs at one slow speed, and a <Text style={styles.strong}>Space</Text> button
            separates words. Pauses never split a word, so you can take as long as you like between
            letters.
          </Text>
        ) : (
          <Text style={styles.help}>
            How morse actually works. Each letter is sent at full speed so it sounds right, but the
            silences are stretched to give you thinking time. There is no Space button —{' '}
            <Text style={styles.strong}>a long enough pause starts a new word</Text>, as on a real
            key.
          </Text>
        )}
      </View>

      {beginner ? (
        <>
          <Text style={styles.sectionTitle}>Speed</Text>
          <View style={styles.card}>
            <Stepper
              ladder={BEGINNER_SPEEDS}
              value={prefs.beginnerWpm}
              unit="words per minute"
              onChange={(beginnerWpm) => set({ beginnerWpm })}
            />
            <Text style={styles.help}>
              A dot is {timing.charUnitMs}ms · hold past {timing.charUnitMs * 2}ms for a dash · a
              letter closes after {Math.round((timing.letterGapMs * 2) / 3)}ms of silence
            </Text>
            <Text style={styles.help}>
              Letters running together? Step down. Slower speeds give you more room between letters.
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Letter speed</Text>
          <View style={styles.card}>
            <Stepper
              ladder={CHAR_SPEEDS}
              value={prefs.charWpm}
              unit="words per minute"
              onChange={(charWpm) => set({ charWpm })}
            />
            <Text style={styles.help}>
              How fast each individual letter is sent. 18 and above is the classic advice — learning
              letters slowly teaches you to count dots, which becomes a wall later. The lower rungs
              are here if you need them to start.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Overall pace</Text>
          <View style={styles.card}>
            <Stepper
              ladder={EFFECTIVE_SPEEDS}
              value={prefs.effectiveWpm}
              ceiling={prefs.charWpm}
              unit="words per minute"
              onChange={(effectiveWpm) => set({ effectiveWpm })}
            />
            <Text style={styles.help}>
              Letters at {prefs.charWpm} wpm, message overall at {prefs.effectiveWpm} wpm. A dot is{' '}
              {timing.charUnitMs}ms; the gap between letters is {timing.letterGapMs}ms and between
              words {timing.wordGapMs}ms.
            </Text>
            <Text style={styles.help}>
              Struggling to separate words? Step this down — it stretches the silences without
              changing how the letters sound.
            </Text>
            <View style={styles.factRow}>
              <Text style={styles.fact}>
                Pause {(letterThresholdMs(timing) / 1000).toFixed(1)}s → new letter
              </Text>
              <Text style={styles.fact}>
                Pause {(wordThresholdMs(timing) / 1000).toFixed(1)}s → new word
              </Text>
            </View>
            {wordThresholdMs(timing) > 4000 ? (
              <Text style={styles.warn}>
                That word pause is very long. Step the overall pace up a rung or two unless you
                really want it this slow.
              </Text>
            ) : null}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Decoding</Text>
      <View style={styles.card}>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.mode, prefs.decodeStyle === 'echo' && styles.modeActive]}
            onPress={() => set({ decodeStyle: 'echo' })}
          >
            <Text
              style={[styles.modeTitle, prefs.decodeStyle === 'echo' && styles.modeTitleActive]}
            >
              By ear
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mode, prefs.decodeStyle === 'type' && styles.modeActive]}
            onPress={() => set({ decodeStyle: 'type' })}
          >
            <Text
              style={[styles.modeTitle, prefs.decodeStyle === 'type' && styles.modeTitleActive]}
            >
              By typing
            </Text>
          </TouchableOpacity>
        </View>
        {prefs.decodeStyle === 'echo' ? (
          <Text style={styles.help}>
            A message arrives silent and blank. Listen to a letter, its dots and dashes appear, tap
            them back on the key — and only then does the letter itself show. You hear it, see it and
            send it before you ever read it.
          </Text>
        ) : (
          <Text style={styles.help}>
            The dots and dashes are shown and you type the letters. Quicker, but you only practise
            reading.
          </Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Feedback</Text>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Beep</Text>
          <Switch value={prefs.soundOn} onValueChange={(soundOn) => set({ soundOn })} />
        </View>
        {Platform.OS === 'web' ? (
          <Text style={styles.help}>
            Vibration isn't available in the browser, so the key gives you sound and the visual
            countdown instead.
          </Text>
        ) : (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Vibrate</Text>
            <Switch value={prefs.hapticsOn} onValueChange={(hapticsOn) => set({ hapticsOn })} />
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Server</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={prefs.serverUrl}
          onChangeText={(serverUrl) => set({ serverUrl })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="wss://your-server.onrender.com"
          placeholderTextColor={theme.textDim}
        />
        <Text style={styles.help}>
          Both phones must point at the same server. See the README for the free one-click deploy.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>History</Text>
      <View style={styles.card}>
        <Text style={styles.help}>
          Your settings, your room and your messages are kept on this phone, so the app opens where
          you left it and rejoins your room on its own. Half-finished decoding is kept too.
        </Text>
        <TouchableOpacity
          style={[styles.clearButton, messageCount === 0 && styles.clearButtonOff]}
          onPress={onClearHistory}
          disabled={messageCount === 0}
        >
          <Text style={styles.clearText}>
            {messageCount === 0
              ? 'No messages stored'
              : `Delete ${messageCount} stored message${messageCount === 1 ? '' : 's'}`}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Morse Tap v023</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  sectionTitle: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 12,
  },
  help: { color: theme.textDim, fontSize: 13, lineHeight: 19 },
  strong: { color: theme.text, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 8 },
  mode: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modeActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  modeTitle: { color: theme.text, fontWeight: '700', fontSize: 15 },
  modeTitleActive: { color: '#000' },
  factRow: { flexDirection: 'row', gap: 8 },
  fact: {
    flex: 1,
    color: theme.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  warn: { color: theme.accent, fontSize: 12, lineHeight: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: {
    width: 54,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
  },
  stepButtonOff: { backgroundColor: theme.surfaceHigh, opacity: 0.5 },
  stepSign: { color: '#000', fontSize: 26, fontWeight: '800', lineHeight: 30 },
  stepValueBox: { flex: 1, alignItems: 'center' },
  stepValue: { color: theme.text, fontSize: 30, fontWeight: '800' },
  stepUnit: { color: theme.textDim, fontSize: 11, letterSpacing: 0.5 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: theme.text, fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: theme.surfaceHigh,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 14,
  },
  clearButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.bad,
    backgroundColor: theme.surfaceHigh,
  },
  clearButtonOff: { borderColor: theme.border, opacity: 0.5 },
  clearText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  version: { color: theme.textDim, fontSize: 12, textAlign: 'center', marginTop: 28 },
});

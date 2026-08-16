import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import { ChartRow, LETTER_CHART, NUMBER_CHART, PUNCTUATION_CHART } from '../morse';

type Props = {
  /** The code currently sounding, so we can light up that row. */
  playingCode: string | null;
  onPlay: (code: string) => void;
};

function Row({
  row,
  playing,
  onPlay,
}: {
  row: ChartRow;
  playing: boolean;
  onPlay: (code: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, playing && styles.rowPlaying]}
      onPress={() => onPlay(row.code)}
      activeOpacity={0.6}
    >
      <Text style={[styles.char, playing && styles.charPlaying]}>{row.char}</Text>
      <Text style={[styles.code, playing && styles.codePlaying]}>{row.code}</Text>
      <Text style={[styles.hint, playing && styles.hintPlaying]}>{row.hint}</Text>
    </TouchableOpacity>
  );
}

function Section({
  title,
  rows,
  playingCode,
  onPlay,
}: {
  title: string;
  rows: ChartRow[];
  playingCode: string | null;
  onPlay: (code: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {rows.map((row) => (
          <Row key={row.char} row={row} playing={playingCode === row.code} onPlay={onPlay} />
        ))}
      </View>
    </View>
  );
}

export default function ChartScreen({ playingCode, onPlay }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        Tap any row to hear it. A dot is one short press, a dash is one long press (hold about three
        times as long).
      </Text>

      <Section title="Letters" rows={LETTER_CHART} playingCode={playingCode} onPlay={onPlay} />
      <Section title="Numbers" rows={NUMBER_CHART} playingCode={playingCode} onPlay={onPlay} />
      <Section
        title="Punctuation"
        rows={PUNCTUATION_CHART}
        playingCode={playingCode}
        onPlay={onPlay}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How the timing works</Text>
        <View style={styles.card}>
          <Text style={styles.note}>· Dot = 1 beat, dash = 3 beats</Text>
          <Text style={styles.note}>· Gap inside a letter = 1 beat</Text>
          <Text style={styles.note}>· Pause between letters = 3 beats</Text>
          <Text style={styles.note}>· Pause between words = 7 beats</Text>
          <Text style={styles.note}>
            · You don&apos;t need to be exact. The app rounds to the nearest sensible thing.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Worth memorising first</Text>
        <View style={styles.card}>
          <Text style={styles.note}>E = . and T = - are the two shortest.</Text>
          <Text style={styles.note}>SOS = ... --- ... is the one everybody knows.</Text>
          <Text style={styles.note}>OK = --- -.- is a handy quick reply.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  intro: { color: theme.textDim, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  rowPlaying: { backgroundColor: theme.accent },
  char: { color: theme.text, fontSize: 17, fontWeight: '700', width: 34 },
  charPlaying: { color: '#000' },
  codePlaying: { color: '#000' },
  hintPlaying: { color: '#000' },
  code: {
    color: theme.accent,
    fontSize: 19,
    fontFamily: 'Courier',
    letterSpacing: 3,
    flex: 1,
  },
  hint: { color: theme.textDim, fontSize: 12, letterSpacing: 0.5 },
  note: { color: theme.textDim, fontSize: 14, lineHeight: 22, paddingHorizontal: 14, paddingVertical: 4 },
});

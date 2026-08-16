import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import {
  answerLetters,
  echoClean,
  echoComplete,
  echoTargetCode,
  echoTiles,
  echoProgress,
  echoIsDone,
  splitLetters,
  type EchoState,
} from '../morse';

export type Props = {
  symbols: string;
  state: EchoState;
  /** True when this message currently owns the key. */
  active: boolean;
  onStart: () => void;
  onListen: () => void;
  /** Pick which letter to work on. Any letter, any order. */
  onSelect: (index: number) => void;
  /** Playing the whole message back, once it's done. */
  onReplayAll: () => void;
  playing: boolean;
};

/**
 * A received message, decoded one letter at a time.
 *
 * Listen to a letter, its pattern appears, tap it back on the key, and
 * only then does the letter itself show up.
 */
export default function EchoReader(props: Props) {
  const tokens = splitLetters(props.symbols);
  const answer = answerLetters(props.symbols);
  const tiles = echoTiles(props.symbols, props.state);
  const done = echoComplete(props.symbols, props.state);
  const clean = echoClean(props.symbols, props.state);
  const target = echoTargetCode(props.symbols, props.state);
  const { heard, tapped, missed, current } = props.state;
  const progress = echoProgress(props.symbols, props.state);

  return (
    <View style={[styles.card, props.active && styles.cardActive]}>
      <View style={styles.topRow}>
        {done ? (
          <TouchableOpacity style={styles.pill} onPress={props.onReplayAll}>
            <Text style={styles.pillIcon}>{props.playing ? '■' : '▶'}</Text>
            <Text style={styles.pillLabel}>{props.playing ? 'Stop' : 'Replay'}</Text>
          </TouchableOpacity>
        ) : props.active ? (
          <TouchableOpacity
            style={[styles.pill, current < 0 && styles.pillOff]}
            onPress={props.onListen}
            disabled={current < 0}
          >
            <Text style={styles.pillIcon}>♪</Text>
            <Text style={styles.pillLabel}>Hear it again</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.pill} onPress={props.onStart}>
            <Text style={styles.pillLabel}>Decode this</Text>
          </TouchableOpacity>
        )}

        {done ? (
          <Text style={[styles.tag, clean && styles.tagGood]}>
            {clean ? 'Perfect' : `${props.state.misses} missed`}
          </Text>
        ) : (
          <Text style={styles.tag}>
            {progress}/{tokens.length}
          </Text>
        )}
      </View>

      {/* one tile per letter - tap any of them to work on it */}
      <View style={styles.tiles}>
        {tokens.map((token, tileIndex) => {
          const state = tiles[tileIndex];
          const shown = state === 'solved' || state === 'given';
          const isCurrent = state === 'current';
          return (
            <Pressable
              key={tileIndex}
              onPress={() => props.onSelect(tileIndex)}
              disabled={done || echoIsDone(props.state, tileIndex)}
              style={[
                styles.tile,
                token.startsWord && tileIndex > 0 ? styles.wordBreak : null,
                state === 'solved' && styles.tileSolved,
                state === 'given' && styles.tileGiven,
                isCurrent && props.active && styles.tileCurrent,
                isCurrent && missed && styles.tileMissed,
              ]}
            >
              {/* The pattern is always visible. The letter is what you earn. */}
              <Text style={[styles.tileCode, shown && styles.tileCodeShown]}>{token.code}</Text>
              <Text style={[styles.tileChar, shown && styles.tileCharShown]}>
                {shown ? answer[tileIndex] : '_'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* what to do next */}
      {done ? (
        <Text style={styles.plain}>{plainText(props.symbols)}</Text>
      ) : props.active ? (
        <View style={styles.progressRow}>
          <Text style={[styles.progressLabel, missed && styles.instructionBad]}>
            {missed ? 'Not that one' : 'Tap it back:'}
          </Text>
          {current >= 0 ? (
            <Text style={styles.progressTapped}>
              {tapped || '·'}
              <Text style={styles.progressRest}>{target.slice(tapped.length)}</Text>
            </Text>
          ) : (
            <Text style={styles.progressLabel}>pick a letter above</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function plainText(symbols: string): string {
  const tokens = splitLetters(symbols);
  const answer = answerLetters(symbols);
  return tokens
    .map((token, index) => (token.startsWord && index > 0 ? ' ' : '') + answer[index])
    .join('');
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    maxWidth: '96%',
    padding: 10,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    gap: 8,
  },
  cardActive: { borderColor: theme.accent },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
  },
  pillCue: { backgroundColor: theme.accent, borderColor: theme.accent },
  pillIcon: { color: theme.accent, fontSize: 13 },
  pillLabel: { color: theme.text, fontSize: 13, fontWeight: '600' },
  ink: { color: '#000' },
  tag: { color: theme.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  tagGood: { color: theme.good },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  wordBreak: { marginLeft: 14 },
  tile: {
    minWidth: 34,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tileSolved: { borderColor: theme.good },
  tileGiven: { borderColor: theme.textDim, borderStyle: 'dashed' },
  tileCurrent: { borderColor: theme.accent, borderWidth: 2 },
  tileMissed: { borderColor: theme.bad, borderWidth: 2 },
  tileCode: { color: theme.accent, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  tileCodeShown: { color: theme.textDim },
  tileChar: { color: theme.textDim, fontSize: 16, fontWeight: '700', marginTop: 1 },
  tileCharShown: { color: theme.text },
  pillOff: { opacity: 0.4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { color: theme.textDim, fontSize: 12 },
  progressTapped: { color: theme.accent, fontFamily: 'Courier', fontSize: 20, letterSpacing: 3 },
  progressRest: { color: theme.border },
  instructionBad: { color: theme.bad },
  plain: { color: theme.text, fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
});

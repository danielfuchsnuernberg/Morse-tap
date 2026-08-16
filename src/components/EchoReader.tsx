import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import {
  answerLetters,
  echoClean,
  echoComplete,
  echoTargetCode,
  echoTiles,
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
  onGiveLetter: () => void;
  onOpenUp: () => void;
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
  const { heard, tapped, missed, index } = props.state;

  return (
    <View style={[styles.card, props.active && styles.cardActive]}>
      <View style={styles.topRow}>
        {done ? (
          <TouchableOpacity style={styles.pill} onPress={props.onReplayAll}>
            <Text style={styles.pillIcon}>{props.playing ? '■' : '▶'}</Text>
            <Text style={styles.pillLabel}>{props.playing ? 'Stop' : 'Replay'}</Text>
          </TouchableOpacity>
        ) : props.active ? (
          <TouchableOpacity style={[styles.pill, !heard && styles.pillCue]} onPress={props.onListen}>
            <Text style={[styles.pillIcon, !heard && styles.ink]}>♪</Text>
            <Text style={[styles.pillLabel, !heard && styles.ink]}>Hear it again</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.pill} onPress={props.onStart}>
            <Text style={styles.pillLabel}>Decode this</Text>
          </TouchableOpacity>
        )}

        {done ? (
          <Text style={[styles.tag, clean && styles.tagGood]}>
            {clean
              ? 'Decoded · perfect'
              : `Decoded · ${props.state.misses} missed, ${props.state.given} given`}
          </Text>
        ) : (
          <Text style={styles.tag}>
            {index}/{tokens.length}
          </Text>
        )}
      </View>

      {/* one tile per letter, unlocked left to right */}
      <View style={styles.tiles}>
        {tokens.map((token, tileIndex) => {
          const state = tiles[tileIndex];
          const current = state === 'listening' || state === 'tapping';
          return (
            <View
              key={tileIndex}
              style={[
                styles.tile,
                token.startsWord && tileIndex > 0 ? styles.wordBreak : null,
                state === 'revealed' && styles.tileRevealed,
                current && props.active && styles.tileCurrent,
                current && missed && styles.tileMissed,
              ]}
            >
              {/* The dots and dashes are always shown. The letter is not:
                  that only appears once you've tapped the pattern back. */}
              <Text style={[styles.tileCode, state === 'revealed' && styles.tileCodeRevealed]}>
                {token.code}
              </Text>
              <Text style={[styles.tileChar, state === 'revealed' && styles.tileCharRevealed]}>
                {state === 'revealed' ? answer[tileIndex] : '_'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* what to do next */}
      {done ? (
        <Text style={styles.plain}>{plainText(props.symbols)}</Text>
      ) : props.active ? (
        <>
          {heard ? (
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Tap it back:</Text>
              <Text style={styles.progressTapped}>
                {tapped || '·'}
                <Text style={styles.progressRest}>{target.slice(tapped.length)}</Text>
              </Text>
            </View>
          ) : null}

          <Text style={[styles.instruction, missed && styles.instructionBad]}>
            {missed
              ? 'Not that one — listen again and retry'
              : 'Tap that pattern on the key below'}
          </Text>

          <View style={styles.helperRow}>
            <TouchableOpacity style={styles.helper} onPress={props.onGiveLetter}>
              <Text style={styles.helperText}>Skip this letter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helper} onPress={props.onOpenUp}>
              <Text style={styles.helperTextDim}>Show all</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.instruction}>
          A message arrived. Decode it by ear, one letter at a time.
        </Text>
      )}
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
    padding: 12,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    gap: 9,
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
  tileRevealed: { borderColor: theme.good },
  tileCurrent: { borderColor: theme.accent, borderWidth: 2 },
  tileMissed: { borderColor: theme.bad, borderWidth: 2 },
  tileCode: { color: theme.textDim, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  tileCodeRevealed: { color: theme.accent },
  tileChar: { color: theme.textDim, fontSize: 16, fontWeight: '700', marginTop: 1 },
  tileCharRevealed: { color: theme.text },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { color: theme.textDim, fontSize: 12 },
  progressTapped: { color: theme.accent, fontFamily: 'Courier', fontSize: 20, letterSpacing: 3 },
  progressRest: { color: theme.border },
  instruction: { color: theme.text, fontSize: 13, fontWeight: '600' },
  instructionBad: { color: theme.bad },
  helperRow: { flexDirection: 'row', gap: 8 },
  helper: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceHigh,
  },
  helperText: { color: theme.text, fontSize: 13, fontWeight: '700' },
  helperTextDim: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  plain: { color: theme.text, fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
});

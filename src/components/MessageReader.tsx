import { Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import {
  answerLetters,
  isCleanSolve,
  isComplete,
  splitLetters,
  tileStates,
  type PuzzleState,
} from '../morse';
import type { Delivery } from '../screens/KeyScreen';

export type Props = {
  symbols: string;
  mine: boolean;
  puzzle: PuzzleState;
  delivery: Delivery;
  onRetry: () => void;
  onGuessChange: (guess: string) => void;
  /** Hand over the next letter they haven't got. */
  onHint: () => void;
  /** Hand over one specific letter - long-pressing a tile. */
  onHintAt: (index: number) => void;
  /** Give up and show the lot. */
  onOpenUp: () => void;
  /** Index of the letter currently sounding, or -1. */
  activeLetter: number;
  playing: boolean;
  onPlay: (slow: boolean) => void;
  onPlayLetter: (index: number) => void;
};

export default function MessageReader(props: Props) {
  const tokens = splitLetters(props.symbols);
  const answer = answerLetters(props.symbols);
  const states = tileStates(props.symbols, props.puzzle);
  const done = props.mine || isComplete(props.symbols, props.puzzle);
  const clean = isCleanSolve(props.symbols, props.puzzle);
  const typed = props.puzzle.guess.toUpperCase().replace(/\s+/g, '');
  const hintsUsed = props.puzzle.openedUp ? answer.length : props.puzzle.given.length;
  const got = states.filter((state) => state === 'correct' || state === 'given').length;

  return (
    <View style={[styles.card, props.mine ? styles.cardMine : styles.cardTheirs]}>
      <View style={styles.topRow}>
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.pill} onPress={() => props.onPlay(false)}>
            <Text style={styles.pillIcon}>{props.playing ? '■' : '▶'}</Text>
            <Text style={styles.pillLabel}>{props.playing ? 'Stop' : 'Listen'}</Text>
          </TouchableOpacity>
          {!props.mine ? (
            <TouchableOpacity style={styles.pill} onPress={() => props.onPlay(true)}>
              <Text style={styles.pillLabel}>Slow</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {props.mine ? (
          props.delivery === 'delivered' ? (
            <Text style={[styles.tag, styles.tagGood]}>Delivered</Text>
          ) : props.delivery === 'sending' ? (
            <Text style={styles.tag}>Sending…</Text>
          ) : props.delivery === 'sent' ? (
            <Text style={styles.tag}>Sent</Text>
          ) : props.delivery === 'nobody' ? (
            <Text style={[styles.tag, styles.tagWarn]}>Nobody there</Text>
          ) : (
            <TouchableOpacity onPress={props.onRetry}>
              <Text style={[styles.tag, styles.tagBad]}>Not sent · Retry</Text>
            </TouchableOpacity>
          )
        ) : clean ? (
          <Text style={[styles.tag, styles.tagGood]}>Solved · no hints</Text>
        ) : done ? (
          <Text style={styles.tag}>
            Done · {hintsUsed} {hintsUsed === 1 ? 'hint' : 'hints'}
          </Text>
        ) : (
          <Text style={styles.tag}>
            {got}/{answer.length}
            {hintsUsed > 0 ? ` · ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}` : ''}
          </Text>
        )}
      </View>

      {/* one tile per letter - tap to hear it alone, hold to peek */}
      <View style={styles.tiles}>
        {tokens.map((token, index) => {
          const active = props.activeLetter === index;
          const state = states[index];
          const shown = done || state === 'correct' || state === 'given';

          return (
            <Pressable
              key={index}
              onPress={() => props.onPlayLetter(index)}
              onLongPress={() => (done ? undefined : props.onHintAt(index))}
              delayLongPress={320}
              style={[
                styles.tile,
                token.startsWord && index > 0 ? styles.wordBreak : null,
                active && styles.tileActive,
                !active && state === 'correct' ? styles.tileCorrect : null,
                !active && state === 'wrong' ? styles.tileWrong : null,
                !active && state === 'given' ? styles.tileGiven : null,
              ]}
            >
              <Text style={[styles.tileCode, active && styles.tileInk]}>{token.code}</Text>
              <Text
                style={[
                  styles.tileChar,
                  active && styles.tileInk,
                  state === 'given' && !active ? styles.tileCharGiven : null,
                ]}
              >
                {shown ? answer[index] : state === 'wrong' ? typed[index] : '_'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* the puzzle - only for messages you received */}
      {!props.mine && !done ? (
        <>
          <TextInput
            style={styles.guessInput}
            value={props.puzzle.guess}
            onChangeText={props.onGuessChange}
            placeholder="type what you hear"
            placeholderTextColor={theme.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />
          <View style={styles.helperRow}>
            <TouchableOpacity style={styles.helper} onPress={props.onHint}>
              <Text style={styles.helperText}>Give me a letter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.helper} onPress={props.onOpenUp}>
              <Text style={styles.helperTextDim}>Show all</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.tip}>
            Tap a tile to hear just that letter · hold it to reveal that one
          </Text>
        </>
      ) : null}

      {done ? <Text style={styles.plain}>{plainText(props.symbols)}</Text> : null}
    </View>
  );
}

/** Rebuild the readable sentence, keeping the word breaks. */
function plainText(symbols: string): string {
  const tokens = splitLetters(symbols);
  const answer = answerLetters(symbols);
  return tokens
    .map((token, index) => (token.startsWord && index > 0 ? ' ' : '') + answer[index])
    .join('');
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: theme.radius, borderWidth: 1, gap: 10, maxWidth: '94%' },
  cardMine: { alignSelf: 'flex-end', backgroundColor: theme.accentDim, borderColor: theme.accent },
  cardTheirs: { alignSelf: 'flex-start', backgroundColor: theme.surface, borderColor: theme.border },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  buttonGroup: { flexDirection: 'row', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 20,
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
  },
  pillIcon: { color: theme.accent, fontSize: 12 },
  pillLabel: { color: theme.text, fontSize: 13, fontWeight: '600' },
  tag: { color: theme.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, flexShrink: 1 },
  tagGood: { color: theme.good },
  tagWarn: { color: theme.accent },
  tagBad: { color: theme.bad },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'flex-start' },
  wordBreak: { marginLeft: 16 },
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
  tileActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  tileCorrect: { borderColor: theme.good },
  tileWrong: { borderColor: theme.bad },
  tileGiven: { borderStyle: 'dashed', borderColor: theme.textDim },
  tileCode: { color: theme.textDim, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  tileChar: { color: theme.text, fontSize: 16, fontWeight: '700', marginTop: 1 },
  tileCharGiven: { color: theme.textDim },
  tileInk: { color: '#000' },
  guessInput: {
    backgroundColor: theme.surfaceHigh,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: theme.text,
    fontSize: 15,
    letterSpacing: 1,
  },
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
  tip: { color: theme.textDim, fontSize: 11, textAlign: 'center' },
  plain: { color: theme.text, fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
});

import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { theme } from '../theme';
import { compareToTarget, encodeText, splitLetters } from '../morse';

export type Props = {
  /** Plain English the user wants to tap out. */
  text: string;
  onTextChange: (text: string) => void;
  /** What they've actually tapped so far. */
  draft: string;
  /** Hear one letter of the guide. */
  onPlayLetter: (code: string) => void;
};

/**
 * A crib sheet. Type what you want to say, see the morse you need to
 * tap, and watch it tick off as you tap it.
 *
 * This never sends anything. The only thing that gets sent is what you
 * actually tapped on the key.
 */
export default function GuideStrip(props: Props) {
  const [open, setOpen] = useState(false);

  const targetMorse = encodeText(props.text);
  const tokens = splitLetters(targetMorse);
  const letters = props.text.toUpperCase().replace(/[^A-Z0-9.,?!/@=-]/g, '').split('');
  const progress = compareToTarget(targetMorse, props.draft);
  const scroller = useRef<ScrollView | null>(null);
  const { height } = useWindowDimensions();

  // Small phones get one row of tiles, large ones get three. The rest of
  // the screen is fixed, so this is what keeps Send reachable everywhere.
  const rows = height >= 840 ? 3 : height >= 780 ? 2 : 1;
  const tileMaxHeight = rows * 52;

  // Keep the letter you're on in view as the message gets longer.
  useEffect(() => {
    if (progress.currentIndex <= 0) {
      scroller.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const row = Math.floor(progress.currentIndex / 6);
    scroller.current?.scrollTo({ y: Math.max(0, (row - rows + 1) * 52), animated: true });
  }, [progress.currentIndex, rows]);

  if (!open) {
    return (
      <TouchableOpacity style={styles.closedBar} onPress={() => setOpen(true)}>
        <Text style={styles.closedText}>
          {props.text.trim().length > 0
            ? `Guide: ${props.text.trim().toUpperCase()}  ·  ${progress.matched}/${tokens.length}`
            : 'Need help spelling something? Open the guide'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>GUIDE</Text>
        <TouchableOpacity onPress={() => setOpen(false)}>
          <Text style={styles.close}>Hide</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        value={props.text}
        onChangeText={props.onTextChange}
        placeholder="type what you want to say"
        placeholderTextColor={theme.textDim}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {tokens.length === 0 ? (
        <Text style={styles.note}>
          Type something above and the morse you need to tap appears here. Nothing gets sent from
          this box — you still have to tap it out yourself.
        </Text>
      ) : (
        <>
          <ScrollView
            ref={scroller}
            style={{ maxHeight: tileMaxHeight }}
            contentContainerStyle={styles.tiles}
            nestedScrollEnabled
          >
            {tokens.map((token, index) => {
              const state = progress.states[index];
              const current = progress.currentIndex === index;
              return (
                <Pressable
                  key={index}
                  onPress={() => props.onPlayLetter(token.code)}
                  style={[
                    styles.tile,
                    token.startsWord && index > 0 ? styles.wordBreak : null,
                    state === 'done' && styles.tileDone,
                    state === 'partial' && styles.tilePartial,
                    state === 'wrong' && styles.tileWrong,
                    current && state !== 'wrong' ? styles.tileCurrent : null,
                  ]}
                >
                  <Text style={[styles.tileChar, state === 'done' && styles.tileCharDone]}>
                    {letters[index] ?? '?'}
                  </Text>
                  <Text style={[styles.tileCode, state === 'done' && styles.tileCodeDone]}>
                    {token.code}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text
            style={[
              styles.status,
              progress.complete && styles.statusGood,
              progress.offTrack && styles.statusBad,
            ]}
          >
            {progress.complete
              ? 'That’s it — hit Send'
              : progress.offTrack
                ? 'Off track — tap Undo to step back'
                : progress.currentIndex >= 0
                  ? `Next: ${letters[progress.currentIndex] ?? ''}  ${
                      tokens[progress.currentIndex]?.code ?? ''
                    }   (${progress.matched}/${tokens.length} done)`
                  : ''}
          </Text>
          <Text style={styles.note}>Tap any letter above to hear it</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  closedBar: {
    marginHorizontal: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.border,
  },
  closedText: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
  panel: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  close: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  input: {
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
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingBottom: 2 },
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
  tileDone: { backgroundColor: theme.good, borderColor: theme.good },
  tilePartial: { borderColor: theme.accent },
  tileWrong: { borderColor: theme.bad },
  tileCurrent: { borderColor: theme.accent, borderWidth: 2 },
  tileChar: { color: theme.text, fontSize: 15, fontWeight: '800' },
  tileCharDone: { color: '#000' },
  tileCode: { color: theme.accent, fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  tileCodeDone: { color: '#000' },
  status: { color: theme.text, fontSize: 13, fontWeight: '700' },
  statusGood: { color: theme.good },
  statusBad: { color: theme.bad },
  note: { color: theme.textDim, fontSize: 11, lineHeight: 16 },
});

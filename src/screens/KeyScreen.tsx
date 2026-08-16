import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../theme';
import {
  applyPressWith,
  decodeMorse,
  undoLast,
  undoLastLetter,
  addWordBreak,
  hasPendingWordBreak,
  EMPTY_PUZZLE,
  type PuzzleState,
  type Timing,
  type Symbol,
  symbolForPress,
  ECHO_START,
  type EchoState,
} from '../morse';
import MessageReader from '../components/MessageReader';
import EchoReader from '../components/EchoReader';
import MorseKey from '../components/MorseKey';
import GuideStrip from '../components/GuideStrip';

export type Message = {
  id: string;
  mine: boolean;
  symbols: string;
  at: number;
  /** Decoding progress: what was typed, and which letters were hinted. */
  puzzle: PuzzleState;
  /** Decoding progress when decoding by ear. */
  echo: EchoState;
  /** Only meaningful for messages you sent. */
  delivery: Delivery;
};

/**
 * What actually happened to a message you sent.
 * 'queued'  - the connection was down; it will go out when it returns
 * 'sending' - handed to the server, waiting for confirmation
 * 'delivered' - the server confirmed someone received it
 * 'nobody'  - it reached the server, but the room was empty
 */
export type Delivery = 'queued' | 'sending' | 'delivered' | 'nobody' | 'none';

export const newMessage = (
  id: string,
  mine: boolean,
  symbols: string,
  at: number
): Message => ({
  id,
  mine,
  symbols,
  at,
  puzzle: EMPTY_PUZZLE,
  echo: ECHO_START,
  delivery: mine ? 'queued' : 'none',
});

type Props = {
  timing: Timing;
  showSpaceButton: boolean;
  allowTimedWordBreak: boolean;
  messages: Message[];
  playingId: string | null;
  activeLetter: number;
  onKeyDown: () => void;
  onKeyUp: () => void;
  onSend: (symbols: string) => void;
  onPreview: (symbols: string) => void;
  /** Play a single letter's code, used by the guide. */
  onPlayCode: (code: string) => void;
  onTogglePlay: (message: Message, slow: boolean) => void;
  onPlayLetter: (message: Message, index: number) => void;
  onGuessChange: (id: string, guess: string) => void;
  onHint: (id: string) => void;
  onHintAt: (id: string, index: number) => void;
  onOpenUp: (id: string) => void;
  onRetry: (id: string) => void;

  /** Decode by ear rather than by typing. */
  echoMode: boolean;
  /** Which message currently owns the key, if any. */
  decodingId: string | null;
  onStartDecode: (id: string) => void;
  onStopDecode: () => void;
  onDecodeSymbol: (symbol: Symbol) => void;
  onEchoListen: (message: Message) => void;
  onEchoGiveLetter: (id: string) => void;
  onEchoOpenUp: (id: string) => void;
};

export default function KeyScreen(props: Props) {
  const [draft, setDraft] = useState('');
  const [guideText, setGuideText] = useState('');
  const [lastReleaseAt, setLastReleaseAt] = useState<number | null>(null);

  const handlePressOut = useCallback(
    (duration: number, gapBefore: number) => {
      setLastReleaseAt(Date.now());
      props.onKeyUp();

      // While decoding, the key belongs to the message being decoded.
      if (props.decodingId) {
        props.onDecodeSymbol(symbolForPress(duration, props.timing));
        return;
      }

      setDraft((current) =>
        applyPressWith(current, gapBefore, duration, props.timing, props.allowTimedWordBreak)
      );
    },
    [props]
  );

  const reset = useCallback(() => {
    setDraft('');
    setLastReleaseAt(null);
  }, []);

  const send = useCallback(() => {
    if (draft.trim().length === 0) return;
    props.onSend(draft.trim());
    reset();
  }, [draft, props, reset]);

  const preview = decodeMorse(draft);
  const spacePending = hasPendingWordBreak(draft);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* messages */}
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {props.messages.length === 0 ? (
          <Text style={styles.empty}>
            Join a room to message someone. Until then, tap out messages to yourself.
          </Text>
        ) : null}
        {props.messages.map((message) => (
          props.echoMode && !message.mine ? (
            <EchoReader
              key={message.id}
              symbols={message.symbols}
              state={message.echo}
              active={props.decodingId === message.id}
              onStart={() => props.onStartDecode(message.id)}
              onListen={() => props.onEchoListen(message)}
              onGiveLetter={() => props.onEchoGiveLetter(message.id)}
              onOpenUp={() => props.onEchoOpenUp(message.id)}
              onReplayAll={() => props.onTogglePlay(message, false)}
              playing={props.playingId === message.id}
            />
          ) : (
          <MessageReader
            key={message.id}
            symbols={message.symbols}
            mine={message.mine}
            puzzle={message.puzzle}
            delivery={message.delivery}
            onRetry={() => props.onRetry(message.id)}
            onGuessChange={(guess) => props.onGuessChange(message.id, guess)}
            onHint={() => props.onHint(message.id)}
            onOpenUp={() => props.onOpenUp(message.id)}
            onHintAt={(index) => props.onHintAt(message.id, index)}
            playing={props.playingId === message.id}
            activeLetter={props.playingId === message.id ? props.activeLetter : -1}
            onPlay={(slow) => props.onTogglePlay(message, slow)}
            onPlayLetter={(index) => props.onPlayLetter(message, index)}
          />
          )
        ))}
      </ScrollView>

      {/* draft */}
      {props.decodingId ? (
        <View style={styles.decodeBanner}>
          <Text style={styles.decodeText}>Decoding — the key belongs to that message</Text>
          <TouchableOpacity onPress={props.onStopDecode}>
            <Text style={styles.decodeStop}>Stop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <GuideStrip
        text={guideText}
        onTextChange={setGuideText}
        draft={draft}
          onPlayLetter={props.onPlayCode}
        />
      )}

      <TouchableOpacity
        style={styles.draftBox}
        activeOpacity={0.75}
        disabled={draft.length === 0}
        onPress={() => props.onPreview(draft)}
      >
        <Text style={styles.draftMorse} numberOfLines={2}>
          {draft || ' '}
        </Text>
        <Text style={styles.draftText}>
          {draft.length === 0 ? 'tap the key below' : `${preview || '?'}  ·  tap to hear it`}
        </Text>
      </TouchableOpacity>

      {/* key */}
      <MorseKey
        timing={props.timing}
        showWordCountdown={props.allowTimedWordBreak}
        lastReleaseAt={lastReleaseAt}
        onPressIn={props.onKeyDown}
        onPressOut={handlePressOut}
      />

      <View style={styles.actions}>
        {props.decodingId ? null : (
        <TouchableOpacity
          style={styles.action}
          onPress={() => setDraft(undoLast)}
          onLongPress={() => setDraft(undoLastLetter)}
          delayLongPress={320}
        >
          <Text style={styles.actionText}>Undo</Text>
          <Text style={styles.actionHint}>hold = letter</Text>
        </TouchableOpacity>
        )}

        {props.showSpaceButton ? (
          <TouchableOpacity
            style={[styles.action, spacePending && styles.actionArmed]}
            onPress={() => setDraft(addWordBreak)}
            disabled={draft.trim().length === 0}
          >
            <Text style={[styles.actionText, spacePending && styles.actionTextArmed]}>Space</Text>
            <Text style={[styles.actionHint, spacePending && styles.actionTextArmed]}>
              {spacePending ? 'new word' : 'end word'}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.action} onPress={reset}>
          <Text style={styles.actionText}>Clear</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.action, styles.sendAction, draft.trim().length === 0 && styles.actionDisabled]}
          onPress={send}
          disabled={draft.trim().length === 0}
        >
          <Text style={[styles.actionText, styles.sendText]}>Send</Text>
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  log: { flex: 1, flexShrink: 1, minHeight: 0, marginTop: 8 },
  logContent: { padding: 16, gap: 10 },
  empty: { color: theme.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingTop: 8 },
  decodeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.accentDim,
  },
  decodeText: { color: theme.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  decodeStop: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  draftBox: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    padding: 10,
    minHeight: 58,
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
  },
  draftMorse: { color: theme.accent, fontFamily: 'Courier', fontSize: 18, letterSpacing: 3 },
  draftText: { color: theme.textDim, fontSize: 14, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  action: {
    flex: 1,
    paddingVertical: 8,
    minHeight: 46,
    justifyContent: 'center',
    borderRadius: theme.radius,
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionArmed: { backgroundColor: theme.accent, borderColor: theme.accent },
  actionTextArmed: { color: '#000' },
  sendAction: { flex: 1.2, backgroundColor: theme.accent, borderColor: theme.accent },
  sendText: { color: '#000' },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  actionHint: { color: theme.textDim, fontSize: 9, marginTop: 1 },
});

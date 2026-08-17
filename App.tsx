import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { KeepAwake, Splash, nativeFailures } from './src/native';
import { theme } from './src/theme';
import {
  nextHintIndex,
  splitLetters,
  echoHear,
  echoTap,
  echoSelect,
  echoTargetCode,
  echoComplete,
  nextUnsolved,
  type PuzzleState,
  type Symbol,
} from './src/morse';
import {
  DEFAULT_PREFS,
  timingFor,
  usesSpaceButton,
  allowsTimedWordBreak,
  usesEchoDecoding,
  type Prefs,
} from './src/settings';
import { useRelay, type Ack, type Incoming } from './src/useRelay';
import { useTone } from './src/useTone';
import KeyScreen, { newMessage, type Message } from './src/screens/KeyScreen';
import ConnectionBar, { ConnectionChip } from './src/components/ConnectionBar';
import ErrorBoundary from './src/components/ErrorBoundary';
import {
  loadAll,
  savePrefs,
  saveSession,
  saveMessages,
  clearMessages,
  highestIdNumber,
} from './src/storage';
import ChartScreen from './src/screens/ChartScreen';
import SettingsScreen from './src/screens/SettingsScreen';

type Tab = 'key' | 'chart' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'key', label: 'Key' },
  { id: 'chart', label: 'Chart' },
  { id: 'settings', label: 'Settings' },
];

/** Half speed, for the Slow replay button. */
const slowed = (timing: ReturnType<typeof timingFor>) => ({
  charUnitMs: timing.charUnitMs * 2,
  letterGapMs: timing.letterGapMs * 2,
  wordGapMs: timing.wordGapMs * 2,
});

let messageCounter = 0;
const nextId = () => `m${++messageCounter}`;

/**
 * A crash in a release build renders nothing at all, which is impossible
 * to diagnose. Wrap everything so it shows the error instead.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <MorseChat />
    </ErrorBoundary>
  );
}

function MorseChat() {
  // The splash screen usually dismisses itself, but if anything holds it
  // open the app looks like a blank screen with no clue what went wrong.
  useEffect(() => {
    Splash?.hideAsync().catch(() => undefined);
  }, []);

  // If a native module failed to load, say so rather than behaving oddly.
  const [failures] = useState(nativeFailures);

  const [tab, setTab] = useState<Tab>('key');
  const [room, setRoom] = useState('');
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [decodingId, setDecodingId] = useState<string | null>(null);
  const [roomOpen, setRoomOpen] = useState(false);
  /** Bumped each time the room is (re)joined, to trigger a resend. */
  const [flushToken, setFlushToken] = useState(0);
  /** Nothing is written back to disk until the first read has finished. */
  const [restored, setRestored] = useState(false);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // Restore everything from the last session.
  useEffect(() => {
    let cancelled = false;
    loadAll().then(({ prefs: savedPrefs, session, messages: savedMessages }) => {
      if (cancelled) return;
      setPrefs(savedPrefs);
      setMessages(savedMessages);
      messageCounter = highestIdNumber(savedMessages);
      if (session.room.length > 0) setRoom(session.room);
      if (session.autoJoin) setConnected(true);
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save whenever something changes, but never before the restore lands.
  useEffect(() => {
    if (restored) savePrefs(prefs);
  }, [prefs, restored]);

  useEffect(() => {
    if (restored) saveSession({ room, autoJoin: connected && room.length >= 3 });
  }, [room, connected, restored]);

  useEffect(() => {
    if (restored) saveMessages(messages);
  }, [messages, restored]);

  // Expo Go turns this on for you during development, which is why the
  // screen never sleeps while testing. Take control of it explicitly so
  // the setting means the same thing in a real build.
  useEffect(() => {
    const tag = 'morse-tap';
    if (!KeepAwake) return;
    if (prefs.keepAwake) {
      KeepAwake.activateKeepAwakeAsync(tag).catch(() => undefined);
    } else {
      try {
        KeepAwake.deactivateKeepAwake(tag);
      } catch {
        /* nothing was holding it */
      }
    }
    return () => {
      try {
        KeepAwake?.deactivateKeepAwake(tag);
      } catch {
        /* ignore */
      }
    };
  }, [prefs.keepAwake]);

  const timing = timingFor(prefs);
  const { toneOn, toneOff, play, stop, playback } = useTone(prefs.soundOn, prefs.hapticsOn);

  const handleIncoming = useCallback(
    (incoming: Incoming) => {
      const id = nextId();
      setMessages((current) => [
        ...current,
        newMessage(id, false, incoming.symbols, incoming.sentAt),
      ]);
      // In echo mode the message must NOT play on arrival - hearing it
      // whole before decoding defeats the letter-by-letter exercise.
      if (!usesEchoDecoding(prefs)) play(id, incoming.symbols, timing);
    },
    [play, timing, prefs]
  );

  /** Mark one message's delivery state. */
  const setDelivery = useCallback((id: string, delivery: Message['delivery']) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, delivery } : message))
    );
  }, []);

  const handleAck = useCallback(
    (ack: Ack) => {
      if (!ack.id) return;
      setDelivery(ack.id, ack.deliveredTo > 0 ? 'delivered' : 'nobody');
    },
    [setDelivery]
  );

  const { status, peers, lastError, sendMorse } = useRelay({
    url: prefs.serverUrl,
    room,
    enabled: connected,
    onMorse: handleIncoming,
    onAck: handleAck,
    onReady: () => setFlushToken((token) => token + 1),
  });

  const handleSend = useCallback(
    (symbols: string) => {
      const id = nextId();
      // Only claim it's on its way if the socket actually took it.
      const accepted = sendMorse(id, symbols);
      setMessages((current) => [
        ...current,
        { ...newMessage(id, true, symbols, Date.now()), delivery: accepted ? 'sending' : 'queued' },
      ]);
      // No confirmation back means the server is an older one that
      // doesn't send them. It does NOT mean the message was lost: the
      // socket took it, so it went out. Resending here would duplicate
      // it on the other phone, so we only stop claiming to be certain.
      //
      // Genuinely undelivered messages are the ones the socket refused,
      // and those are queued at send time and flushed on reconnect.
      if (accepted) {
        setTimeout(() => {
          setMessages((current) =>
            current.map((m) =>
              m.id === id && m.delivery === 'sending' ? { ...m, delivery: 'sent' } : m
            )
          );
        }, 8000);
      }
    },
    [sendMorse, play, timing]
  );

  /**
   * Send anything that never made it out. Only messages the socket
   * refused are ever in this state, so this cannot duplicate a message
   * that was already handed over.
   */
  const flushQueued = useCallback(() => {
    setMessages((current) =>
      current.map((message) => {
        if (!message.mine || message.delivery !== 'queued') return message;
        if (!sendMorse(message.id, message.symbols)) return message;
        const id = message.id;
        setTimeout(() => {
          setMessages((later) =>
            later.map((m) => (m.id === id && m.delivery === 'sending' ? { ...m, delivery: 'sent' } : m))
          );
        }, 8000);
        return { ...message, delivery: 'sending' };
      })
    );
  }, [sendMorse]);

  // Anything queued goes out as soon as the room is joined again.
  useEffect(() => {
    if (flushToken > 0) flushQueued();
  }, [flushToken, flushQueued]);

  const handleTogglePlay = useCallback(
    (message: Message, slow: boolean) =>
      play(message.id, message.symbols, slow ? slowed(timing) : timing),
    [play, timing]
  );

  /** Hear one letter on its own, without replaying the whole message. */
  const handlePlayLetter = useCallback(
    (message: Message, index: number) => {
      const token = splitLetters(message.symbols)[index];
      if (token) play(`${message.id}:${index}`, token.code, timing);
    },
    [play, timing]
  );

  /** Update just one message's puzzle state. */
  const patchPuzzle = useCallback((id: string, change: (p: PuzzleState) => PuzzleState) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, puzzle: change(message.puzzle) } : message
      )
    );
  }, []);

  const handleGuessChange = useCallback(
    (id: string, guess: string) => patchPuzzle(id, (puzzle) => ({ ...puzzle, guess })),
    [patchPuzzle]
  );

  /** Hand over one specific letter. */
  const giveLetter = useCallback(
    (id: string, index: number) =>
      patchPuzzle(id, (puzzle) =>
        index < 0 || puzzle.given.includes(index)
          ? puzzle
          : { ...puzzle, given: [...puzzle.given, index] }
      ),
    [patchPuzzle]
  );

  /** Hand over the next letter they haven't got yet. */
  const handleHint = useCallback(
    (id: string) => {
      const message = messages.find((item) => item.id === id);
      if (!message) return;
      giveLetter(id, nextHintIndex(message.symbols, message.puzzle));
    },
    [messages, giveLetter]
  );

  const handleOpenUp = useCallback(
    (id: string) => patchPuzzle(id, (puzzle) => ({ ...puzzle, openedUp: true })),
    [patchPuzzle]
  );

  /* ---- decoding by ear ---- */

  const patchEcho = useCallback((id: string, change: (e: Message['echo']) => Message['echo']) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, echo: change(message.echo) } : message
      )
    );
  }, []);

  /** Play just the letter being worked on, and mark it heard. */
  const handleEchoListen = useCallback(
    (message: Message) => {
      const code = echoTargetCode(message.symbols, message.echo);
      if (code.length === 0) return;
      play(`${message.id}:echo`, code, timing);
      patchEcho(message.id, echoHear);
    },
    [play, timing, patchEcho]
  );

  const handleDecodeSymbol = useCallback(
    (symbol: Symbol) => {
      if (!decodingId) return;
      let advancedTo: { id: string; code: string } | null = null;

      setMessages((current) =>
        current.map((message) => {
          if (message.id !== decodingId) return message;
          const next = echoTap(message.symbols, message.echo, symbol);
          // Finished that letter? Line up the next one and sound it.
          if (next.solved.length > message.echo.solved.length && !echoComplete(message.symbols, next)) {
            const code = echoTargetCode(message.symbols, next);
            if (code) advancedTo = { id: message.id, code };
            return { ...message, echo: echoHear(next) };
          }
          return { ...message, echo: next };
        })
      );

      if (advancedTo) {
        const { id, code } = advancedTo;
        play(`${id}:echo`, code, timing);
      }
    },
    [decodingId, play, timing]
  );

  /** Starting a decode selects the first letter and sounds it. */
  const startDecode = useCallback(
    (id: string) => {
      setDecodingId(id);
      const message = messages.find((item) => item.id === id);
      if (!message) return;
      const selected =
        message.echo.current >= 0
          ? message.echo
          : echoSelect(message.symbols, message.echo, nextUnsolved(message.symbols, message.echo));
      const code = echoTargetCode(message.symbols, selected);
      if (code) {
        patchEcho(id, () => echoHear(selected));
        play(`${id}:echo`, code, timing);
      }
    },
    [messages, patchEcho, play, timing]
  );

  /** Pick any letter to work on, and hear it straight away. */
  const handleEchoSelect = useCallback(
    (message: Message, index: number) => {
      const selected = echoSelect(message.symbols, message.echo, index);
      if (selected === message.echo) return;
      setDecodingId(message.id);
      patchEcho(message.id, () => echoHear(selected));
      const code = echoTargetCode(message.symbols, selected);
      if (code) play(`${message.id}:echo`, code, timing);
    },
    [patchEcho, play, timing]
  );

  // Hand the key back automatically once a message is fully decoded.
  useEffect(() => {
    if (!decodingId) return;
    const message = messages.find((item) => item.id === decodingId);
    if (message && echoComplete(message.symbols, message.echo)) setDecodingId(null);
  }, [messages, decodingId]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {failures.length > 0 ? (
        <View style={styles.failureBar}>
          <Text style={styles.failureText}>
            {failures.map((f) => `${f.module}: ${f.message}`).join('\n')}
          </Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>MORSE CHAT</Text>
          <ConnectionChip
            status={status}
            peers={peers}
            room={room}
            onPress={() => setRoomOpen((open) => !open)}
          />
        </View>
        <View style={styles.tabs}>
          {TABS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.tab, tab === item.id && styles.tabActive]}
              onPress={() => {
                stop();
                setTab(item.id);
              }}
            >
              <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ConnectionBar
        room={room}
        onRoomChange={setRoom}
        connected={connected}
        onToggleConnect={() => setConnected((value) => !value)}
        status={status}
        peers={peers}
        lastError={lastError}
        open={roomOpen}
        onToggleOpen={() => setRoomOpen(false)}
      />

      {tab === 'key' ? (
        <KeyScreen
          timing={timing}
          showSpaceButton={usesSpaceButton(prefs)}
          allowTimedWordBreak={allowsTimedWordBreak(prefs)}
          messages={messages}
          playingId={playback.messageId}
          activeLetter={playback.letterIndex}
          onKeyDown={toneOn}
          onKeyUp={toneOff}
          onSend={handleSend}
          onPreview={(symbols) => play('draft', symbols, timing)}
          onPlayCode={(code) => play(`guide:${code}`, code, timing)}
          onTogglePlay={handleTogglePlay}
          onPlayLetter={handlePlayLetter}
          onGuessChange={handleGuessChange}
          onHint={handleHint}
          onHintAt={giveLetter}
          onOpenUp={handleOpenUp}
          echoMode={usesEchoDecoding(prefs)}
          decodingId={decodingId}
          onStartDecode={startDecode}
          onStopDecode={() => setDecodingId(null)}
          onDecodeSymbol={handleDecodeSymbol}
          onEchoListen={handleEchoListen}
          onEchoSelect={handleEchoSelect}
          onRetry={(id) => {
            setDelivery(id, 'queued');
            flushQueued();
          }}
        />
      ) : null}

      {tab === 'chart' ? (
        <ChartScreen
          playingCode={playback.messageId?.startsWith('chart:') ? playback.messageId.slice(6) : null}
          onPlay={(code) => play(`chart:${code}`, code, timing)}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsScreen
          prefs={prefs}
          onChange={setPrefs}
          messageCount={messages.length}
          onClearHistory={() => {
            setMessages([]);
            setDecodingId(null);
            clearMessages();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  failureBar: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.bad,
    backgroundColor: theme.surface,
  },
  failureText: { color: theme.bad, fontSize: 11, fontFamily: 'Courier', lineHeight: 15 },
  title: { color: theme.text, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: theme.surfaceHigh },
  tabText: { color: theme.textDim, fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: theme.text },
});

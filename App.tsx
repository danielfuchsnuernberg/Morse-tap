import { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme } from './src/theme';
import { unitMsForWpm } from './src/morse';
import { useRelay, type Incoming } from './src/useRelay';
import { useTone } from './src/useTone';
import KeyScreen, { type Message } from './src/screens/KeyScreen';
import ChartScreen from './src/screens/ChartScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const DEFAULT_SERVER = 'wss://morse-tap-server.onrender.com';

type Tab = 'key' | 'chart' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'key', label: 'Key' },
  { id: 'chart', label: 'Chart' },
  { id: 'settings', label: 'Settings' },
];

let messageCounter = 0;
const nextId = () => `m${++messageCounter}`;

export default function App() {
  const [tab, setTab] = useState<Tab>('key');
  const [room, setRoom] = useState('');
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const [wpm, setWpm] = useState(5);
  const [soundOn, setSoundOn] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);

  const unitMs = unitMsForWpm(wpm);
  const { toneOn, toneOff, play, stop, playback, lit } = useTone(soundOn, hapticsOn);

  const handleIncoming = useCallback(
    (incoming: Incoming) => {
      const id = nextId();
      setMessages((current) => [
        ...current,
        {
          id,
          mine: false,
          symbols: incoming.symbols,
          at: incoming.sentAt,
          guess: '',
          revealed: false,
        },
      ]);
      // Play it straight away so the highlight runs while it arrives.
      play(id, incoming.symbols, unitMs);
    },
    [play, unitMs]
  );

  const { status, peers, lastError, sendMorse } = useRelay({
    url: serverUrl,
    room,
    enabled: connected,
    onMorse: handleIncoming,
  });

  const handleSend = useCallback(
    (symbols: string) => {
      sendMorse(symbols);
      const id = nextId();
      setMessages((current) => [
        ...current,
        { id, mine: true, symbols, at: Date.now(), guess: '', revealed: true },
      ]);
      // Hear back what you just sent, highlighted letter by letter.
      play(id, symbols, unitMs);
    },
    [sendMorse, play, unitMs]
  );

  const handleTogglePlay = useCallback(
    (message: Message) => play(message.id, message.symbols, unitMs),
    [play, unitMs]
  );

  const handleGuessChange = useCallback((id: string, guess: string) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, guess } : message))
    );
  }, []);

  const handleReveal = useCallback((id: string) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, revealed: true } : message))
    );
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.title}>MORSE TAP</Text>
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

      {tab === 'key' ? (
        <KeyScreen
          room={room}
          onRoomChange={setRoom}
          connected={connected}
          onToggleConnect={() => setConnected((value) => !value)}
          status={status}
          peers={peers}
          lastError={lastError}
          unitMs={unitMs}
          messages={messages}
          lit={lit}
          playingId={playback.messageId}
          activeLetter={playback.letterIndex}
          onKeyDown={toneOn}
          onKeyUp={toneOff}
          onSend={handleSend}
          onPreview={(symbols) => play('draft', symbols, unitMs)}
          onTogglePlay={handleTogglePlay}
          onGuessChange={handleGuessChange}
          onReveal={handleReveal}
        />
      ) : null}

      {tab === 'chart' ? (
        <ChartScreen
          playingCode={playback.messageId?.startsWith('chart:') ? playback.messageId.slice(6) : null}
          onPlay={(code) => play(`chart:${code}`, code, unitMs)}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsScreen
          wpm={wpm}
          onWpmChange={setWpm}
          soundOn={soundOn}
          onSoundChange={setSoundOn}
          hapticsOn={hapticsOn}
          onHapticsChange={setHapticsOn}
          serverUrl={serverUrl}
          onServerUrlChange={setServerUrl}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  title: { color: theme.text, fontSize: 20, fontWeight: '800', letterSpacing: 4 },
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

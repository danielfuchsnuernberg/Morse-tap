import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';
import type { Status } from '../useRelay';

export type Props = {
  room: string;
  onRoomChange: (room: string) => void;
  connected: boolean;
  onToggleConnect: () => void;
  status: Status;
  peers: number;
  lastError: string | null;
  open: boolean;
  onToggleOpen: () => void;
};

export function statusLabel(status: Status, peers: number): { text: string; color: string } {
  if (status === 'connected' && peers > 0) return { text: 'Partner online', color: theme.good };
  if (status === 'connected') return { text: 'Waiting', color: theme.accent };
  if (status === 'connecting') return { text: 'Connecting', color: theme.accent };
  if (status === 'error') return { text: 'Disconnected', color: theme.bad };
  return { text: 'Offline', color: theme.textDim };
}

/**
 * A dot and a word in the header. Tap it and the room controls drop
 * down; tap again and they fold away. Costs one row only when you're
 * actually using it.
 */
export function ConnectionChip({
  status,
  peers,
  room,
  onPress,
}: {
  status: Status;
  peers: number;
  room: string;
  onPress: () => void;
}) {
  const badge = statusLabel(status, peers);
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} hitSlop={8}>
      <View style={[styles.dot, { backgroundColor: badge.color }]} />
      <Text style={[styles.chipText, { color: badge.color }]} numberOfLines={1}>
        {room.length > 0 ? room : badge.text}
      </Text>
    </TouchableOpacity>
  );
}

/** The room controls, shown only while the chip is open. */
export default function ConnectionBar(props: Props) {
  if (!props.open) return null;
  const badge = statusLabel(props.status, props.peers);

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <TextInput
          style={styles.roomInput}
          value={props.room}
          onChangeText={(text) => props.onRoomChange(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ROOM CODE"
          placeholderTextColor={theme.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          editable={!props.connected}
        />
        <TouchableOpacity
          style={[styles.joinButton, props.connected && styles.joinButtonActive]}
          onPress={props.onToggleConnect}
        >
          <Text style={[styles.joinText, props.connected && styles.joinTextActive]}>
            {props.connected ? 'Leave' : 'Join'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.close} onPress={props.onToggleOpen} hitSlop={8}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.statusLine, { color: badge.color }]}>
        {badge.text}
        {props.lastError ? ` · ${props.lastError}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    maxWidth: 160,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  panel: { paddingHorizontal: 16, paddingTop: 8, gap: 5 },
  row: { flexDirection: 'row', gap: 6 },
  roomInput: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingHorizontal: 14,
    color: theme.text,
    fontSize: 16,
    letterSpacing: 2,
    fontWeight: '600',
  },
  joinButton: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: theme.radius,
    backgroundColor: theme.accent,
  },
  joinButtonActive: {
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
  },
  joinText: { color: '#000', fontWeight: '700', fontSize: 15 },
  joinTextActive: { color: theme.text },
  close: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
  },
  closeText: { color: theme.textDim, fontSize: 14 },
  statusLine: { fontSize: 11, fontWeight: '600' },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Ask the server if it's still there after this much quiet. */
const PING_AFTER_MS = 20000;
/** If it doesn't answer within this, the link is dead. */
const PONG_TIMEOUT_MS = 8000;

export type Status = 'idle' | 'connecting' | 'connected' | 'error';

export type Incoming = { symbols: string; sentAt: number };

export type Ack = { id: string | null; deliveredTo: number };

type Options = {
  url: string;
  room: string;
  /** Set false to stay disconnected. */
  enabled: boolean;
  onMorse: (message: Incoming) => void;
  /** The server confirming what happened to something we sent. */
  onAck?: (ack: Ack) => void;
  /** Called once the room is joined, so queued messages can go out. */
  onReady?: () => void;
};

/**
 * Keeps one WebSocket open to the relay server and rejoins the room
 * automatically if the connection drops.
 */
export function useRelay({ url, room, enabled, onMorse, onAck, onReady }: Options) {
  const [status, setStatus] = useState<Status>('idle');
  const [peers, setPeers] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  /** When we last heard anything at all from the server. */
  const lastHeardRef = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reopenRef = useRef<() => void>(() => undefined);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const onMorseRef = useRef(onMorse);
  const onAckRef = useRef(onAck);
  const onReadyRef = useRef(onReady);
  const closingRef = useRef(false);

  // Keep the callback fresh without re-opening the socket every render.
  useEffect(() => {
    onMorseRef.current = onMorse;
    onAckRef.current = onAck;
    onReadyRef.current = onReady;
  }, [onMorse, onAck, onReady]);

  useEffect(() => {
    if (!enabled || url.trim().length === 0 || room.trim().length < 3) {
      setStatus('idle');
      setPeers(0);
      return;
    }

    closingRef.current = false;
    let socket: WebSocket | null = null;

    const clearRetry = () => {
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };

    const open = () => {
      if (closingRef.current) return;
      setStatus('connecting');

      try {
        socket = new WebSocket(url.trim());
      } catch {
        setStatus('error');
        setLastError('Bad server address');
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attemptsRef.current = 0;
        setStatus('connected');
        setLastError(null);
        socket?.send(JSON.stringify({ type: 'join', room }));
      };

      socket.onmessage = (event) => {
        lastHeardRef.current = Date.now();
        let message: any;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === 'joined') onReadyRef.current?.();
        if (message.type === 'peers') setPeers(Number(message.count) || 0);
        if (message.type === 'ack') {
          onAckRef.current?.({
            id: message.id ?? null,
            deliveredTo: Number(message.deliveredTo) || 0,
          });
        }
        if (message.type === 'error') setLastError(String(message.reason));
        if (message.type === 'morse') {
          onMorseRef.current({
            symbols: String(message.symbols || ''),
            sentAt: Number(message.sentAt) || Date.now(),
          });
        }
      };

      socket.onerror = () => {
        setLastError('Cannot reach server');
      };

      socket.onclose = () => {
        socketRef.current = null;
        setPeers(0);
        if (closingRef.current) return;
        setStatus('error');
        // Back off: 1s, 2s, 4s, capped at 10s.
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 10000);
        attemptsRef.current += 1;
        clearRetry();
        retryRef.current = setTimeout(open, delay);
      };
    };

    reopenRef.current = () => {
      // Drop whatever we have and start again from scratch.
      clearRetry();
      attemptsRef.current = 0;
      const current = socketRef.current;
      socketRef.current = null;
      if (current) {
        try {
          current.close();
        } catch {
          /* ignore */
        }
      }
      open();
    };

    open();

    /**
     * A WebSocket that dies quietly - a sleeping phone, a server going
     * idle - never tells you. So we ask, and if nothing answers we treat
     * the link as gone rather than showing a green light over nothing.
     */
    heartbeatRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== 1) return;

      const quietFor = Date.now() - lastHeardRef.current;
      if (quietFor > PING_AFTER_MS + PONG_TIMEOUT_MS) {
        setStatus('error');
        setPeers(0);
        try {
          socket.close();
        } catch {
          /* the onclose handler will reconnect */
        }
        return;
      }
      if (quietFor > PING_AFTER_MS) {
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* ignore - the timeout above will catch it */
        }
      }
    }, 5000);

    // Coming back to the app is the most likely moment for a stale link.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== 1) {
        reopenRef.current();
        return;
      }
      lastHeardRef.current = Date.now() - PING_AFTER_MS - 1;
    });

    return () => {
      appStateSub.remove();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      closingRef.current = true;
      clearRetry();
      attemptsRef.current = 0;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [url, room, enabled]);

  /** Force a fresh connection, used when a send goes unanswered. */
  const reconnect = useCallback(() => reopenRef.current(), []);

  /**
   * Try to send. Returns false when the socket isn't open, so the caller
   * can hold onto the message instead of pretending it went.
   */
  const sendMorse = useCallback((id: string, symbols: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify({ type: 'morse', symbols, id }));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { status, peers, lastError, sendMorse, reconnect };
}

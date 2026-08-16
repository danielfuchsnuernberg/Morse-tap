import { useCallback, useEffect, useRef, useState } from 'react';

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

    open();

    return () => {
      closingRef.current = true;
      clearRetry();
      attemptsRef.current = 0;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [url, room, enabled]);

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

  return { status, peers, lastError, sendMorse };
}

/**
 * The connection to the relay server. Same protocol as the phone app,
 * so a phone and a browser can sit in the same room and talk.
 */
/** Ask the server if it's still there after this much quiet. */
const PING_AFTER_MS = 20000;
/** If it doesn't answer within this, the link is dead. */
const PONG_TIMEOUT_MS = 8000;

export function createRelay({ onMorse, onStatus, onAck, onReady }) {
  let socket = null;
  let room = '';
  let url = '';
  let retry = null;
  let attempts = 0;
  let closing = false;
  let lastHeard = 0;
  let heartbeat = null;

  const clearRetry = () => {
    if (retry) clearTimeout(retry);
    retry = null;
  };

  const open = () => {
    if (closing || room.length < 3) return;
    onStatus('connecting', 0);

    try {
      socket = new WebSocket(url);
    } catch {
      onStatus('error', 0);
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      lastHeard = Date.now();
      onStatus('connected', 0);
      socket.send(JSON.stringify({ type: 'join', room }));
    };

    socket.onmessage = (event) => {
      lastHeard = Date.now();
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === 'joined') onReady?.();
      if (message.type === 'peers') onStatus('connected', Number(message.count) || 0);
      if (message.type === 'ack') {
        onAck?.({ id: message.id ?? null, deliveredTo: Number(message.deliveredTo) || 0 });
      }
      if (message.type === 'morse') {
        onMorse({ symbols: String(message.symbols || ''), sentAt: Number(message.sentAt) || Date.now() });
      }
    };

    socket.onclose = () => {
      socket = null;
      if (closing) return;
      onStatus('error', 0);
      // Back off: 1s, 2s, 4s, capped at 10s.
      const delay = Math.min(1000 * 2 ** attempts, 10000);
      attempts += 1;
      clearRetry();
      retry = setTimeout(open, delay);
    };

    socket.onerror = () => undefined;
  };

  /**
   * A WebSocket that dies quietly - a sleeping phone, a server going
   * idle - never tells you. So we ask, and if nothing answers we treat
   * the link as gone rather than showing a green light over nothing.
   */
  const startHeartbeat = () => {
    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (!socket || socket.readyState !== 1) return;
      const quietFor = Date.now() - lastHeard;
      if (quietFor > PING_AFTER_MS + PONG_TIMEOUT_MS) {
        onStatus('error', 0);
        try {
          socket.close();
        } catch {
          /* onclose will reconnect */
        }
        return;
      }
      if (quietFor > PING_AFTER_MS) {
        try {
          socket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* the timeout above will catch it */
        }
      }
    }, 5000);
  };

  const reopen = () => {
    clearRetry();
    attempts = 0;
    const current = socket;
    socket = null;
    if (current) {
      try {
        current.close();
      } catch {
        /* ignore */
      }
    }
    open();
  };

  // Coming back to the app is the most likely moment for a stale link.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || closing || room.length < 3) return;
      if (!socket || socket.readyState !== 1) reopen();
      else lastHeard = Date.now() - PING_AFTER_MS - 1;
    });
  }

  return {
    reconnect: reopen,
    join(nextUrl, nextRoom) {
      closing = false;
      url = nextUrl.trim();
      room = nextRoom.trim().toUpperCase();
      clearRetry();
      attempts = 0;
      socket?.close();
      socket = null;
      open();
      startHeartbeat();
    },
    leave() {
      closing = true;
      clearRetry();
      clearInterval(heartbeat);
      heartbeat = null;
      socket?.close();
      socket = null;
      onStatus('idle', 0);
    },
    /** Returns false when the socket isn't open, so nothing is silently lost. */
    send(id, symbols) {
      if (!socket || socket.readyState !== 1) return false;
      try {
        socket.send(JSON.stringify({ type: 'morse', symbols, id }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

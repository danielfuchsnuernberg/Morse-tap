/**
 * The connection to the relay server. Same protocol as the phone app,
 * so a phone and a browser can sit in the same room and talk.
 */
export function createRelay({ onMorse, onStatus, onAck, onReady }) {
  let socket = null;
  let room = '';
  let url = '';
  let retry = null;
  let attempts = 0;
  let closing = false;

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
      onStatus('connected', 0);
      socket.send(JSON.stringify({ type: 'join', room }));
    };

    socket.onmessage = (event) => {
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

  return {
    join(nextUrl, nextRoom) {
      closing = false;
      url = nextUrl.trim();
      room = nextRoom.trim().toUpperCase();
      clearRetry();
      attempts = 0;
      socket?.close();
      socket = null;
      open();
    },
    leave() {
      closing = true;
      clearRetry();
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

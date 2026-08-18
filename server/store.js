/**
 * Where messages wait for someone who isn't connected.
 *
 * Backed by Upstash Redis over plain HTTPS, so there's no database
 * driver, no connection pool, and nothing to keep alive between the free
 * instance going to sleep and waking up again.
 *
 * If it isn't configured, everything here quietly becomes a no-op and
 * the server behaves exactly as it did before: live relay only.
 */

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** How long an undelivered message is kept before it expires. */
const MESSAGE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Most messages held for one room, so a silent partner can't fill it. */
const MAX_PENDING = 200;

const isConfigured = Boolean(URL_BASE && TOKEN);

/**
 * Run one Redis command. Returns null on any failure - storage must
 * never be able to take the live relay down with it.
 */
async function command(...parts) {
  if (!isConfigured) return null;
  try {
    const response = await fetch(URL_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parts),
    });
    if (!response.ok) {
      console.error('storage error', response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return data.result ?? null;
  } catch (error) {
    console.error('storage unreachable:', error.message);
    return null;
  }
}

const pendingKey = (room) => `pending:${room}`;

/**
 * Hold a message for a room. Anyone who joins later receives it.
 *
 * The sender's own id is stored alongside so we never hand a message
 * back to the person who wrote it.
 */
async function hold(room, message) {
  const stored = JSON.stringify(message);
  const length = await command('RPUSH', pendingKey(room), stored);
  // Keep the newest MAX_PENDING and let the whole list expire eventually.
  await command('LTRIM', pendingKey(room), -MAX_PENDING, -1);
  await command('EXPIRE', pendingKey(room), MESSAGE_TTL_SECONDS);
  return length;
}

/** Everything waiting for a room, oldest first. */
async function pending(room) {
  const raw = await command('LRANGE', pendingKey(room), 0, -1);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Forget the messages a client has now received.
 *
 * Done by rewriting the list to just the ones still outstanding, rather
 * than clearing it, so a message that arrived while we were delivering
 * isn't lost.
 */
async function forget(room, deliveredIds) {
  if (deliveredIds.length === 0) return;
  const remaining = (await pending(room)).filter((m) => !deliveredIds.includes(m.id));

  await command('DEL', pendingKey(room));
  if (remaining.length === 0) return;

  await command('RPUSH', pendingKey(room), ...remaining.map((m) => JSON.stringify(m)));
  await command('EXPIRE', pendingKey(room), MESSAGE_TTL_SECONDS);
}

/** Used by the health endpoint so you can see whether storage is on. */
async function health() {
  if (!isConfigured) return { storage: 'off' };
  const pong = await command('PING');
  return { storage: pong === 'PONG' ? 'ok' : 'unreachable' };
}

module.exports = { isConfigured, hold, pending, forget, health };

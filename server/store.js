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
const deliveredKey = (room, clientId) => `delivered:${room}:${clientId}`;
const handoutKey = (room) => `handouts:${room}`;

/**
 * A message is given up on after this many hand-outs.
 *
 * Older clients don't identify themselves, so the server cannot tell one
 * of their visits from the next and would offer them the same message
 * every time they opened the app. Counting hand-outs puts a hard stop on
 * that. Four is far more than a two-person room ever needs, so nothing
 * is lost, but the loop can't run for thirty days.
 */
const MAX_HANDOUTS = 4;
const tokensKey = (room) => `tokens:${room}`;

/** How long a push token is remembered without being seen again. */
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

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

/**
 * Which held messages this device has already been handed.
 *
 * Confirmation is the tidy way to drop a message, but a client that
 * never confirms - an older build, or one killed mid-delivery - would
 * otherwise be given the same message again every single time it opened
 * the app. This remembers what it has seen so that cannot happen.
 */
async function alreadyDelivered(room, clientId) {
  if (!clientId) return [];
  const raw = await command('SMEMBERS', deliveredKey(room, clientId));
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** Note that these messages have now been handed to this device. */
async function markDelivered(room, clientId, ids) {
  if (!clientId || ids.length === 0) return;
  await command('SADD', deliveredKey(room, clientId), ...ids.map(String));
  await command('EXPIRE', deliveredKey(room, clientId), MESSAGE_TTL_SECONDS);
}

/**
 * Remember where to notify a device, keyed by the device's own id so a
 * reinstall replaces the old token rather than adding a second one.
 */
async function rememberToken(room, clientId, token) {
  if (!token) return;
  await command('HSET', tokensKey(room), clientId, token);
  await command('EXPIRE', tokensKey(room), TOKEN_TTL_SECONDS);
}

/**
 * Every device registered for a room, except the one asking, as
 * { clientId, token } pairs - the id is needed to work out how many
 * messages are waiting for that particular person.
 */
async function tokensFor(room, exceptClientId) {
  const raw = await command('HGETALL', tokensKey(room));
  if (!raw) return [];

  // Upstash returns a flat [field, value, field, value] array.
  const entries = [];
  if (Array.isArray(raw)) {
    for (let index = 0; index < raw.length; index += 2) {
      entries.push([raw[index], raw[index + 1]]);
    }
  } else if (typeof raw === 'object') {
    entries.push(...Object.entries(raw));
  }

  return entries
    .filter(([clientId, token]) => clientId !== exceptClientId && Boolean(token))
    .map(([clientId, token]) => ({ clientId, token }));
}

/**
 * Count how often these messages have now been handed out, and report
 * the ones that have run out of chances so the caller can drop them.
 */
async function countHandouts(room, ids) {
  const spent = [];
  for (const id of ids) {
    const count = await command('HINCRBY', handoutKey(room), String(id), 1);
    if (typeof count === 'number' && count >= MAX_HANDOUTS) spent.push(String(id));
  }
  if (ids.length > 0) await command('EXPIRE', handoutKey(room), MESSAGE_TTL_SECONDS);
  return spent;
}

/** Drop a token the push service has told us is dead. */
async function forgetToken(room, token) {
  const raw = await command('HGETALL', tokensKey(room));
  if (!Array.isArray(raw)) return;
  for (let index = 0; index < raw.length; index += 2) {
    if (raw[index + 1] === token) await command('HDEL', tokensKey(room), raw[index]);
  }
}

/** Used by the health endpoint so you can see whether storage is on. */
async function health() {
  if (!isConfigured) return { storage: 'off' };
  const pong = await command('PING');
  return { storage: pong === 'PONG' ? 'ok' : 'unreachable' };
}

module.exports = {
  isConfigured,
  hold,
  pending,
  forget,
  alreadyDelivered,
  markDelivered,
  countHandouts,
  health,
  rememberToken,
  tokensFor,
  forgetToken,
};

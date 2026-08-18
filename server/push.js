/**
 * Sending notifications through Expo's push service.
 *
 * The notification shows the dots and dashes but never the decoded
 * letters. The pattern is visible in the app anyway - the work is
 * reading it - so this gives you something to start on from the lock
 * screen without giving the answer away.
 */

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Lock screens truncate anyway; cut it somewhere sensible ourselves. */
const MAX_SYMBOLS = 56;

/**
 * Trim morse for a lock screen, breaking between letters rather than
 * mid-letter so what's shown is always readable.
 */
function forLockScreen(symbols) {
  const clean = String(symbols || '').trim();
  if (clean.length <= MAX_SYMBOLS) return clean;

  const cut = clean.slice(0, MAX_SYMBOLS);
  const lastBreak = cut.lastIndexOf(' ');
  return `${(lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trim()} …`;
}

/**
 * Notify some devices that something is waiting.
 *
 * Returns the tokens the push service rejected as dead, so the caller
 * can stop storing them. Never throws - a failed notification must not
 * affect message delivery.
 */
async function notify(recipients) {
  const valid = recipients.filter(
    (entry) => typeof entry?.token === 'string' && entry.token.startsWith('Expo')
  );
  if (valid.length === 0) return { dead: [] };

  const body = valid.map(({ token, count = 1, symbols }) => {
    const morse = forLockScreen(symbols);
    return {
      to: token,
      // The dots and dashes, never the letters.
      title: count > 1 ? `Morse Chat · ${count} waiting` : 'Morse Chat',
      body: morse.length > 0 ? morse : 'A message is waiting',
      sound: 'default',
      badge: count,
      priority: 'high',
    };
  });

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error('push failed', response.status, await response.text());
      return { dead: [] };
    }

    const result = await response.json();
    const tickets = Array.isArray(result.data) ? result.data : [];

    // A token can stop being valid when the app is uninstalled.
    const dead = [];
    tickets.forEach((ticket, index) => {
      if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
        dead.push(valid[index].token);
      }
    });
    return { dead };
  } catch (error) {
    console.error('push unreachable:', error.message);
    return { dead: [] };
  }
}

module.exports = { notify };

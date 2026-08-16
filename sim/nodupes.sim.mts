/**
 * One send must produce exactly one message on the other phone.
 *
 * Two ways that broke:
 *   v022 - a replaced socket reconnected, so the app sat in the room
 *          twice and received its own messages
 *   v024 - no delivery confirmation was treated as "lost", so the app
 *          resent every 8 seconds against a server that never confirms
 *
 * This drives the real relay against a fake server and counts what a
 * peer would actually receive.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { JSDOM, VirtualConsole } from 'jsdom';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

execSync(
  'npx esbuild web/relay.js --bundle --format=iife --global-name=RelayMod --outfile=/tmp/relay2.bundle.js --log-level=error',
  { stdio: 'inherit' }
);

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  virtualConsole: new VirtualConsole(),
});
const { window } = dom as any;

/** Everything any socket ever sent to the "server". */
const relayed: { id: string; symbols: string }[] = [];
const sockets: any[] = [];

/**
 * A server that deliberately never acknowledges anything - exactly the
 * older Render deployment. The app must cope without duplicating.
 */
class SilentServerSocket {
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    sockets.push(this);
    setTimeout(() => {
      if (this.closed) return;
      this.readyState = 1;
      this.onopen?.();
      this.onmessage?.({ data: JSON.stringify({ type: 'joined', room: 'ROOM' }) });
      this.onmessage?.({ data: JSON.stringify({ type: 'peers', count: 1 }) });
    }, 5);
  }
  send(data: string) {
    if (this.readyState !== 1) throw new Error('not open');
    const message = JSON.parse(data);
    // A ping is answered, so the link never looks dead.
    if (message.type === 'ping') {
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'pong' }) }), 1);
      return;
    }
    if (message.type === 'morse') relayed.push({ id: message.id, symbols: message.symbols });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}
window.WebSocket = SilentServerSocket as any;

const source = readFileSync('/tmp/relay2.bundle.js', 'utf8') + '\nwindow.RelayMod = RelayMod;';
window.eval(source);
const { createRelay } = (window as any).RelayMod;

let ready = 0;
const relay = createRelay({
  onMorse: () => undefined,
  onStatus: () => undefined,
  onAck: () => undefined,
  onReady: () => { ready += 1; },
});

relay.join('wss://example.test', 'ROOM');
await new Promise((r) => setTimeout(r, 50));
check(ready === 1, `joined ${ready} times, expected 1`);

/* ---- one send, one delivery ---- */
const accepted = relay.send('msg1', '... --- ...');
check(accepted === true, 'the socket should have accepted the message');
check(relayed.length === 1, `one send produced ${relayed.length} messages`);

/* ---- wait past every retry window; still one ---- */
await new Promise((r) => setTimeout(r, 12000));
check(relayed.filter((m) => m.id === 'msg1').length === 1,
  `after waiting, msg1 was sent ${relayed.filter((m) => m.id === 'msg1').length} times`);
check(sockets.filter((s) => !s.closed).length === 1,
  `${sockets.filter((s) => !s.closed).length} live sockets, expected 1`);

/* ---- a genuine reconnect must not resend what already went ---- */
relay.reconnect();
await new Promise((r) => setTimeout(r, 100));
check(relayed.filter((m) => m.id === 'msg1').length === 1,
  'reconnecting resent a message that had already gone out');
check(ready === 2, `expected a second join after reconnecting, got ${ready}`);

/* ---- several sends, several deliveries, no extras ---- */
const before = relayed.length;
relay.send('msg2', '.-');
relay.send('msg3', '-...');
relay.send('msg4', '-.-.');
await new Promise((r) => setTimeout(r, 12000));
check(relayed.length - before === 3, `three sends produced ${relayed.length - before} messages`);
for (const id of ['msg2', 'msg3', 'msg4']) {
  check(relayed.filter((m) => m.id === id).length === 1, `${id} was sent more than once`);
}

/* ---- a refused send is not counted as delivered ---- */
const liveSocket = sockets.filter((s) => !s.closed)[0];
liveSocket.readyState = 0;
const refused = relay.send('msg5', '.');
check(refused === false, 'a send on a closed socket must report failure');
check(relayed.filter((m) => m.id === 'msg5').length === 0, 'a refused send must not reach the server');

relay.leave();
console.log(`${relayed.length} messages relayed from 4 accepted sends across ${sockets.length} sockets`);
console.log(problems.length === 0
  ? 'PASS: one send, one delivery - no duplicates, ever'
  : `FAIL (${problems.length}):\n` + problems.join('\n'));
process.exit(problems.length ? 1 : 0);

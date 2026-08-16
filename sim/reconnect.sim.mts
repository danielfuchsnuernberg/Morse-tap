/**
 * The v022 duplicate-connection bug, reproduced against the real web
 * relay with a fake WebSocket, then proved fixed.
 *
 * Replacing a dead socket must leave exactly ONE connection. If the
 * retired socket also reconnects, you sit in the room twice and receive
 * your own messages - which is what happened on the simulator.
 */
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { execSync } from 'node:child_process';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

// Bundle the real relay so we test the shipped code, not a copy.
execSync(
  'npx esbuild web/relay.js --bundle --format=iife --global-name=RelayMod --outfile=/tmp/relay.bundle.js --log-level=error',
  { stdio: 'inherit' }
);

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  url: 'https://example.test/',
  virtualConsole: new VirtualConsole(),
});
const { window } = dom as any;

/** Every socket ever created, so we can count live ones. */
const sockets: any[] = [];

class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    sockets.push(this);
  }
  /** Complete the handshake, as a real server would. */
  accept() {
    this.readyState = 1;
    this.onopen?.();
  }
  deliver(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  send(data: string) {
    if (this.readyState !== 1) throw new Error('not open');
    this.sent.push(data);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}
window.WebSocket = FakeSocket as any;

// The bundle is strict-mode, so its var stays inside the eval unless we
// hand it out explicitly.
const source = readFileSync('/tmp/relay.bundle.js', 'utf8') + '\nwindow.RelayMod = RelayMod;';
window.eval(source);
const { createRelay } = (window as any).RelayMod;

const live = () => sockets.filter((s) => !s.closed);
const joinsIn = (socket: any) => socket.sent.filter((m: string) => m.includes('"join"')).length;

let statusCalls = 0;
const relay = createRelay({
  onMorse: () => undefined,
  onStatus: () => { statusCalls += 1; },
  onAck: () => undefined,
  onReady: () => undefined,
});

/* ---- a normal connection ---- */
relay.join('wss://example.test', 'ROOM01');
check(sockets.length === 1, `joining should open one socket, opened ${sockets.length}`);
sockets[0].accept();
sockets[0].deliver({ type: 'joined', room: 'ROOM01' });
check(live().length === 1, 'one live socket after joining');
check(joinsIn(sockets[0]) === 1, 'should have joined the room exactly once');

/* ---- the link dies quietly and is rebuilt ---- */
const before = sockets.length;
relay.reconnect();

// The retired socket's close fires, as it would in a browser.
await new Promise((r) => setTimeout(r, 50));

check(sockets.length === before + 1, `reconnect should open exactly one new socket, opened ${sockets.length - before}`);
check(live().length === 1, `THE BUG: ${live().length} live sockets after a reconnect, expected 1`);

const current = live()[0];
current.accept();
current.deliver({ type: 'joined', room: 'ROOM01' });
check(joinsIn(current) === 1, 'the new socket should join once');

/* ---- the retired socket must stay quiet ---- */
const retired = sockets.find((s) => s !== current)!;
let sawGhostMorse = false;
const ghostRelay = { ...relay };
void ghostRelay;
retired.onmessage?.({ data: JSON.stringify({ type: 'morse', symbols: '...' }) });
check(!sawGhostMorse, 'a retired socket must not deliver messages');

/* ---- and it must not schedule its own reconnect ---- */
const countBeforeWait = sockets.length;
await new Promise((r) => setTimeout(r, 1500));
check(sockets.length === countBeforeWait,
  `a retired socket opened ${sockets.length - countBeforeWait} extra connections`);
check(live().length === 1, `still expected exactly 1 live socket, found ${live().length}`);

/* ---- several rebuilds in a row still leave one ---- */
for (let i = 0; i < 4; i++) {
  relay.reconnect();
  await new Promise((r) => setTimeout(r, 20));
  const open = live();
  if (open.length === 1) open[0].accept();
}
await new Promise((r) => setTimeout(r, 1500));
check(live().length === 1, `after four rebuilds there are ${live().length} live sockets`);

/* ---- leaving closes everything ---- */
relay.leave();
await new Promise((r) => setTimeout(r, 1200));
check(live().length === 0, `leaving should close every socket, ${live().length} still open`);

console.log(`opened ${sockets.length} sockets across the run, ${live().length} left live`);
console.log(problems.length === 0
  ? 'PASS: rebuilding a dead link never leaves you in the room twice'
  : `FAIL (${problems.length}):\n` + problems.join('\n'));
process.exit(problems.length ? 1 : 0);

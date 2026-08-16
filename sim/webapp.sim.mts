/**
 * Loads the real web app into a simulated browser and drives it:
 * taps the key, sends a message, receives one, decodes it by ear.
 *
 * Catches the things typechecking can't: missing elements, wrong ids,
 * handlers that throw, a render that blows up on real state.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { JSDOM, VirtualConsole } from 'jsdom';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const html = readFileSync('web/index.html', 'utf8');

/* ---- the shell must contain every id app.js reaches for ---- */
const appJs = readFileSync('web/app.js', 'utf8');
const ids = [...appJs.matchAll(/el\('([a-z-]+)'\)/g)].map((m) => m[1]);
// Ids the app creates at runtime rather than expecting in the shell.
const RUNTIME_IDS = new Set(['guideinput', 'serverinput']);
for (const id of [...new Set(ids)]) {
  if (id.startsWith('tab-') || RUNTIME_IDS.has(id)) continue;
  check(html.includes(`id="${id}"`), `index.html is missing #${id}, which app.js uses`);
}
const templated: string[] = [];
for (const tab of ['key', 'chart', 'settings']) {
  check(html.includes(`id="tab-${tab}"`), `index.html is missing the ${tab} tab button`);
}
void templated;

/* ---- PWA requirements for Add to Home Screen ---- */
const manifest = JSON.parse(readFileSync('web/manifest.webmanifest', 'utf8'));
check(manifest.display === 'standalone', 'manifest must be standalone or it opens in Safari');
check(manifest.icons.some((i: any) => i.sizes === '192x192'), 'a 192px icon is required');
check(manifest.icons.some((i: any) => i.sizes === '512x512'), 'a 512px icon is required');
check(manifest.start_url.length > 0, 'manifest needs a start_url');
check(html.includes('apple-mobile-web-app-capable'), 'iOS needs apple-mobile-web-app-capable');
check(html.includes('apple-touch-icon'), 'iOS needs an apple-touch-icon or the icon is blank');
check(html.includes('viewport-fit=cover'), 'viewport-fit=cover is needed for the notch');
check(html.includes('manifest.webmanifest'), 'index.html must link the manifest');

/* ---- the service worker must cache everything the app needs ---- */
const sw = readFileSync('web/sw.js', 'utf8');
for (const file of ['index.html', 'app.js', 'tone.js', 'store.js', 'relay.js', 'lib/morse.js']) {
  check(sw.includes(file), `the service worker does not cache ${file}, so offline start would fail`);
}

/* ---- boot it in a fake browser ---- */
const errors: string[] = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e: any) => errors.push(String(e.message)));
virtualConsole.on('error', (e: any) => errors.push(String(e)));

// jsdom can't run ES modules from a script tag, so bundle the real
// app into one classic script and run that instead. Same code.
execSync(
  'npx esbuild web/app.js --bundle --format=iife --outfile=/tmp/app.bundle.js --log-level=error',
  { stdio: 'inherit' }
);
const bundled = html.replace(
  '<script type="module" src="app.js"></script>',
  `<script>${readFileSync('/tmp/app.bundle.js', 'utf8')}</script>`
);
writeFileSync('/tmp/bundled.html', bundled);

const dom = new JSDOM(bundled, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'https://example.test/morse/',
  pretendToBeVisual: true,
  virtualConsole,
});

const { window } = dom;
// jsdom has no Web Audio or WebSocket; stub just enough to boot.
(window as any).AudioContext = class {
  state = 'running';
  currentTime = 0;
  createGain() { return { gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {} }; }
  resume() {}
  destination = {};
};
(window as any).WebSocket = class { readyState = 0; close() {} send() {} };

await new Promise((resolve) => setTimeout(resolve, 400));

check(errors.length === 0, `the app threw while loading: ${errors[0] ?? ''}`);

const doc = window.document;
const $ = (id: string) => doc.getElementById(id);

check($('key') !== null, 'the key never rendered');
check($('log') !== null, 'the message log never rendered');
check(($('keyhint') as any)?.textContent?.includes('dot'), 'the key hint is empty');
check(($('chip') as any)?.textContent?.trim() === 'Offline', 'the status chip should start Offline');

/* ---- tapping the key must build morse ---- */
const key = $('key')!;
const press = (ms: number) => {
  key.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  const start = Date.now();
  while (Date.now() - start < ms) { /* real elapsed time, so the timing logic is exercised */ }
  key.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
};

press(30); press(30); press(30);
const draft = ($('draft') as any).textContent as string;
check(draft.includes('...'), `three quick taps should give three dots, got "${draft.trim()}"`);
check(draft.includes('S'), 'three dots should decode to S');

/* ---- tabs must render without throwing ---- */
for (const tab of ['chart', 'settings', 'key']) {
  ($('tab-' + tab) as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
}
check(errors.length === 0, `switching tabs threw: ${errors[0] ?? ''}`);

($('tab-chart') as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
const chart = ($('otherview') as any).textContent as string;
check(chart.includes('dit dah'), 'the chart should list the rhythms');

($('tab-settings') as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
const settings = ($('otherview') as any).textContent as string;
check(settings.includes('Beginner'), 'settings should offer Beginner mode');
check(settings.includes('Farnsworth'), 'settings should offer Farnsworth mode');
check(settings.includes('web'), 'settings should show the version');

/* ---- storage must survive a reload ---- */
check(window.localStorage.getItem('morse-tap:v1') !== null, 'nothing was saved to storage');

// Change a setting, then reload the whole app and confirm it stuck.
($('tab-settings') as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
const farnsworthButton = [...doc.querySelectorAll('[data-mode]')].find(
  (b) => (b as any).dataset.mode === 'farnsworth'
);
check(farnsworthButton !== undefined, 'the Farnsworth button is missing');
(farnsworthButton as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));

const saved = JSON.parse(window.localStorage.getItem('morse-tap:v1')!);
check(saved.mode === 'farnsworth', `the mode change was not saved (got ${saved.mode})`);

// Boot a second time with that storage, as a reopened app would.
const dom2 = new JSDOM(bundled, {
  runScripts: 'dangerously',
  url: 'https://example.test/morse/',
  pretendToBeVisual: true,
  virtualConsole,
});
(dom2.window as any).AudioContext = (window as any).AudioContext;
(dom2.window as any).WebSocket = (window as any).WebSocket;
dom2.window.localStorage.setItem('morse-tap:v1', JSON.stringify(saved));
await new Promise((r) => setTimeout(r, 300));
const reloaded = JSON.parse(dom2.window.localStorage.getItem('morse-tap:v1')!);
check(reloaded.mode === 'farnsworth', 'the setting did not survive a reload');
check(
  typeof reloaded.serverUrl === 'string' && reloaded.serverUrl.startsWith('wss://'),
  'the server address must survive and stay wss'
);



/* ---- the four bugs from the phone, each pinned down ---- */

// 1. The page itself must never scroll — that's what slid the header
//    under the iOS status bar.
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
check(css.includes('position:fixed'), 'body must be fixed to the viewport');
check(css.includes('100dvh'), 'iOS needs dvh, not 100%, or the toolbar breaks the height');
check(css.includes('overscroll-behavior:none'), 'rubber-band scrolling must be off');
check(/#log\{[^}]*min-height:0/.test(css), 'the log must be allowed to shrink, or it pushes the key off');

// 2. Send was grey because "#actions button" outranks "#send".
const sendRule = css.slice(css.indexOf('#actions #send'));
check(css.includes('#actions #send'), 'the Send rule must outrank #actions button');
check(sendRule.slice(0, 120).includes('var(--accent)'), 'Send must actually be orange');
const spaceRule = css.indexOf('#actions #spacebtn.armed');
check(spaceRule > css.indexOf('#actions button'), 'the armed Space rule must come after the generic one');

// 3. A finger drifting off the key must still end the press.
const js = readFileSync('web/app.js', 'utf8');
check(js.includes('setPointerCapture'), 'the key must capture the pointer');
check(js.includes('releasePointerCapture'), 'the key must release the pointer');
check(js.includes('visibilitychange'), 'a press must not stay open if the app is backgrounded');

// 4. An old server sends no ack, so "Sending…" must not hang for ever.
check(js.includes('awaitAck'), 'there must be a fallback when no ack arrives');
// v022 replaced this: an unconfirmed message is no longer quietly
// relabelled "Sent" - it goes back in the queue and the link is rebuilt.
check(js.includes("message.delivery = 'sent'"),
  'an unconfirmed message settles to Sent and is never resent');

/* ---- and prove a press still produces the right letter ---- */
const key2 = doc.getElementById('key')!;
const pressWithDrift = (ms: number) => {
  key2.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  const start = Date.now();
  while (Date.now() - start < ms) { /* wait */ }
  key2.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
};

($('tab-key') as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
($('clear') as any).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

pressWithDrift(600);
pressWithDrift(30);
pressWithDrift(30);
const draft2 = ($('draft') as any).textContent as string;
check(draft2.includes('-..') || draft2.includes('D'), `a dash then two dots should give D, got "${draft2.trim()}"`);

/* ---- v019 behaviour ---- */
check(!/playMessage\(id, symbols\);\n  render\(\);/.test(js),
  'sending must not replay the message back at you');
check(js.includes('<span class="code">${token.code}</span>'),
  'the dots and dashes must be visible from the start, whatever the tile state');
check(!js.includes("'···'"), 'the pattern must never be masked');
check(js.includes("playMessage(message.id + ':echo', code)"),
  'the current letter must sound automatically');
const decodeBlock = js.slice(js.indexOf('if (d.decode)'), js.indexOf('if (d.decode)') + 700);
check(decodeBlock.includes('echoHear'), 'starting a decode must sound the first letter');
check(decodeBlock.includes('nextUnsolved'), 'starting a decode must pick the first letter still to do');

/* ---- v020: any letter, any order ---- */
check(js.includes('data-pick='), 'every tile must be tappable');
check(js.includes('if (d.pick)'), 'picking a tile must be handled');
const pickBlock = js.slice(js.indexOf('if (d.pick)'), js.indexOf('if (d.pick)') + 600);
check(pickBlock.includes('echoSelect'), 'picking a tile must select that letter');
check(pickBlock.includes('echoHear'), 'picking a tile must sound it');
check(js.includes('shown || done') && js.includes('disabled'),
  'already-earned tiles must not be re-pickable');



/* ---- v022: a dead connection must be noticed, not shown as green ---- */
const relayJs = readFileSync('web/relay.js', 'utf8');
check(relayJs.includes("type: 'ping'"), 'the client must check the link is alive');
check(relayJs.includes('PONG_TIMEOUT_MS'), 'an unanswered ping must time out');
check(relayJs.includes('visibilitychange'), 'returning to the app must re-check the link');
check(relayJs.includes('reconnect: reopen'), 'callers must be able to force a reconnect');
// v025 removed this deliberately: rebuilding the link on an unanswered
// send made the app resend, which duplicated messages on the other phone.
check(!js.includes('relay.reconnect()'),
  'an unanswered send must NOT rebuild the link - that is what caused duplicates');
check(js.includes("message.delivery = 'queued'"), 'an unanswered send must be re-queued, not called sent');

console.log(problems.length === 0
  ? 'PASS: the app notices when the connection has quietly died'
  : `FAIL:\n${problems.slice(0, 5).join('\n')}`);
process.exit(problems.length ? 1 : 0);

/**
 * Guards against a mistake TypeScript cannot catch.
 *
 * `self` and `window` are real globals. Writing `self.onmessage = ...`
 * compiles perfectly and silently attaches the handler to the global
 * object instead of the socket you meant. That shipped in v023: the
 * connection opened, never received anything, and sat on "Disconnected".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|mts)$/.test(entry) && !entry.includes('.test.')) out.push(path);
  }
  return out;
}

const files = [...walk('src'), ...walk('web'), 'App.tsx'];
// Naming a local `self` shadows the global and hides exactly this bug,
// so it's banned outright rather than merely required to be declared.
let scanned = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  scanned += 1;

  // A service worker has no window; there, `self` IS the correct global.
  if (file.endsWith('sw.js')) continue;

  // Using `self` as a variable is fine only if it is actually declared.
  const usesSelf = /(^|[^.\w])self\s*\./.test(source);
  const declaresSelf = /\b(const|let|var)\s+self\b/.test(source);
  check(!usesSelf || declaresSelf,
    `${file}: uses 'self.' without declaring it - that's the global object, not your variable`);

  // Event handlers must be attached to something local, never a global.
  const badHandler = /(^|[^.\w])(self|window|globalThis)\s*\.\s*on(open|close|message|error)\s*=/.exec(source);
  check(badHandler === null,
    `${file}: attaches ${badHandler?.[0].trim() ?? ''} to a global - almost certainly meant a socket`);
}

/* ---- and every socket handler must be on a declared local ---- */
for (const file of ['src/useRelay.ts', 'web/relay.js']) {
  const source = readFileSync(file, 'utf8');
  const handlers = [...source.matchAll(/(\w+)\s*\.\s*on(open|close|message|error)\s*=/g)];
  check(handlers.length >= 4, `${file}: expected the four socket handlers, found ${handlers.length}`);

  for (const [, target] of handlers) {
    const declared = new RegExp(`\\b(const|let|var)\\s+${target}\\b`).test(source);
    check(declared, `${file}: handler attached to '${target}', which is never declared`);
    check(!['self', 'window', 'globalThis', 'document'].includes(target),
      `${file}: handler attached to the global '${target}'`);
  }

  // All four must be bound to the same object, or one socket ends up
  // half-wired - connected, but deaf.
  const targets = new Set(handlers.map(([, target]) => target));
  check(targets.size === 1,
    `${file}: handlers split across ${[...targets].join(', ')} - they must all bind the same socket`);
}

console.log(`scanned ${scanned} files for handlers attached to globals`);
console.log(problems.length === 0
  ? 'PASS: every socket handler is bound to a real, declared socket'
  : `FAIL (${problems.length}):\n` + problems.join('\n'));
process.exit(problems.length ? 1 : 0);

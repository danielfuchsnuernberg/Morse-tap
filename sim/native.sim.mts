/**
 * Every native module must be loaded defensively.
 *
 * A plain `import` of a native module throws while the release bundle is
 * still loading - before React exists, before any error boundary can
 * catch it. The splash screen then never lifts and there is no clue why.
 * That is what v027 through v030 did.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

/** Modules that need native code and can therefore fail to load. */
const NATIVE = [
  'expo-audio',
  'expo-haptics',
  'expo-keep-awake',
  'expo-splash-screen',
  '@react-native-async-storage/async-storage',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) out.push(path);
  }
  return out;
}

const files = [...walk('src'), 'App.tsx'];
const guard = 'src/native.ts';

for (const file of files) {
  if (file === guard) continue;
  const source = readFileSync(file, 'utf8');
  for (const name of NATIVE) {
    const imported = new RegExp(`from\\s+['"]${name.replace('/', '\\/')}['"]`).test(source);
    check(!imported,
      `${file} imports ${name} directly - it must come through src/native.ts, or a load failure hangs the app on the splash screen`);
  }
}

/* ---- and the guard must cover every native module ---- */
const guardSource = readFileSync(guard, 'utf8');
for (const name of NATIVE) {
  check(guardSource.includes(`'${name}'`), `src/native.ts does not load ${name}`);
}
check(guardSource.includes('try {') && guardSource.includes('catch'),
  'src/native.ts must actually catch failures');
check(guardSource.includes('nativeFailures'),
  'failures must be reportable, or a broken module is silent');

/* ---- and the app must show them ---- */
const app = readFileSync('App.tsx', 'utf8');
check(app.includes('nativeFailures'), 'App must surface native failures on screen');
check(app.includes('Splash?.hideAsync'), 'the splash must be dismissed defensively');

console.log(`checked ${files.length} files against ${NATIVE.length} native modules`);
console.log(problems.length === 0
  ? 'PASS: no native module can hang the app on the splash screen'
  : `FAIL (${problems.length}):\n` + problems.join('\n'));
process.exit(problems.length ? 1 : 0);

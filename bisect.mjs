/**
 * Switches the app entry between the real app and a minimal one, to find
 * out whether a failing build is caused by app code or by the native
 * project. Run it, build, look, run it again to switch back.
 *
 *   node bisect.mjs minimal   -> build the bare test app
 *   node bisect.mjs real      -> back to Morse Chat
 */
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2];
if (mode !== 'minimal' && mode !== 'real') {
  console.error('Usage: node bisect.mjs minimal | real');
  process.exit(1);
}

const target = mode === 'minimal' ? './App.minimal' : './App';
const index = `import { registerRootComponent } from 'expo';

import App from '${target}';

registerRootComponent(App);
`;
writeFileSync('index.ts', index);

const app = JSON.parse(readFileSync('app.json', 'utf8'));
app.expo.name = mode === 'minimal' ? 'Morse Chat TEST' : 'Morse Chat';
writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');

console.log(
  mode === 'minimal'
    ? 'Entry switched to the MINIMAL test app. Build it, and see whether anything renders.'
    : 'Entry switched back to the real Morse Chat app.'
);

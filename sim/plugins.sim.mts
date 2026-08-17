/**
 * Guards against a whole class of bug that only appears in a real build.
 *
 * Some Expo packages ship a config plugin - native settings the app needs
 * (permission strings, background modes, entitlements). Expo Go already
 * has all of that configured, so a missing plugin entry is invisible
 * during development and only breaks the release build, where iOS can
 * terminate the app outright for touching an API with no usage string.
 *
 * That shipped in v027: expo-audio's plugin was never listed, and the
 * TestFlight build showed a black screen.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const problems: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) problems.push(msg); };

const appJson = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const declared = (appJson.plugins ?? []).map((entry: unknown) =>
  Array.isArray(entry) ? String(entry[0]) : String(entry)
);

/** Every dependency that ships a config plugin. */
const needsPlugin: string[] = [];
for (const name of Object.keys(pkg.dependencies ?? {})) {
  const dir = join('node_modules', name);
  if (!existsSync(dir)) continue;
  if (existsSync(join(dir, 'app.plugin.js'))) needsPlugin.push(name);
}

for (const name of needsPlugin) {
  check(declared.includes(name),
    `${name} ships a config plugin but is not in app.json "plugins" - it will work in Expo Go and break the real build`);
}

/** And nothing declared should be missing from the project. */
for (const name of declared) {
  if (name.startsWith('.') || name.startsWith('/')) continue;
  check(existsSync(join('node_modules', name)),
    `app.json lists the plugin "${name}", which isn't installed`);
}

/* ---- permission strings must exist, or iOS kills the app ---- */
const audio = (appJson.plugins ?? []).find(
  (entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-audio'
);
if (needsPlugin.includes('expo-audio')) {
  check(Array.isArray(audio), 'expo-audio must be configured, not just listed');
  const options = Array.isArray(audio) ? (audio[1] as Record<string, unknown>) : {};
  const message = options?.microphonePermission;
  check(typeof message === 'string' && message.length > 10,
    'expo-audio needs a microphone usage string - iOS terminates apps that touch mic APIs without one');
}

/* ---- a splash config needs the module that dismisses it ---- */
const hasSplashPlugin = declared.includes('expo-splash-screen');
const hasLegacySplash = appJson.splash !== undefined;
check(!hasLegacySplash,
  'the legacy top-level "splash" key is superseded by the expo-splash-screen plugin - having it without the module leaves a launch screen nothing can dismiss');
check(hasSplashPlugin === existsSync('node_modules/expo-splash-screen'),
  'expo-splash-screen must be both installed and declared, or neither');

/* ---- the build number must move, or App Store Connect rejects it ---- */
check(typeof appJson.ios?.buildNumber === 'string', 'ios.buildNumber must be set');
check(appJson.version === pkg.version,
  `app.json version (${appJson.version}) and package.json version (${pkg.version}) must match`);

/* ---- every asset app.json points at must exist ---- */
const assets = [
  appJson.icon,
  appJson.splash?.image,
  appJson.web?.favicon,
  appJson.android?.adaptiveIcon?.foregroundImage,
].filter(Boolean) as string[];
for (const path of assets) {
  check(existsSync(path.replace(/^\.\//, '')), `app.json points at ${path}, which is missing`);
}

console.log(
  `checked ${Object.keys(pkg.dependencies ?? {}).length} dependencies; ${needsPlugin.length} ship a config plugin (${needsPlugin.join(', ') || 'none'})`
);
console.log(problems.length === 0
  ? 'PASS: every config plugin is declared and every asset exists'
  : `FAIL (${problems.length}):\n` + problems.join('\n'));
process.exit(problems.length ? 1 : 0);

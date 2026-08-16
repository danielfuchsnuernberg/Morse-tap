/**
 * Rebuilds the shared core and copies the web app into docs/,
 * which is what GitHub Pages serves.
 *
 *   npm run web:build
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

execSync('node web/build.mjs', { stdio: 'inherit' });

mkdirSync('docs/lib', { recursive: true });
const files = [
  'index.html', 'app.js', 'tone.js', 'store.js', 'relay.js', 'sw.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];
for (const file of files) copyFileSync(`web/${file}`, `docs/${file}`);
copyFileSync('web/lib/morse.js', 'docs/lib/morse.js');
// Stop GitHub Pages running Jekyll over it, which would hide lib/.
writeFileSync('docs/.nojekyll', '');

console.log(`published ${files.length + 1} files to docs/ for GitHub Pages`);

/**
 * Compiles the shared morse core to browser JavaScript.
 * The web app and the phone app run the exact same tested logic.
 */
import { execSync } from 'node:child_process';

execSync('npx tsc -p web/tsconfig.web.json', { stdio: 'inherit' });
console.log('built web/lib/morse.js from the same source the app uses');

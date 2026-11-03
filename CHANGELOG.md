# Changelog

## 2026-11-03 — this repo is now the relay server, and only that

**Why:** two entries called "Morse-Tap" and "Morse-Chat" were impossible to tell apart, and the
obvious guess — that one was a spare copy of the app — was wrong in a way that would have cost
something live.

**What it actually held:** the relay server, a web version of Morse Chat published to GitHub Pages
from `docs/`, and a stale fork of an old React Native app. Three things, two of them live.

**Removed:**

- The web version — `web/` (source) and `docs/` (what GitHub Pages served). It existed only
  because there was no App Store build yet. TestFlight 1.1.3 shipped on 1 September 2026, so it
  was retired rather than kept running in parallel. **This takes the GitHub Pages site offline.**
- The stale app fork — `App.tsx`, `App.minimal.tsx`, `index.ts`, `src/`, `assets/`, `sim/`,
  `app.json`, `eas.json`, `tsconfig.json`, root `package.json` and lockfile, `bisect.mjs`,
  `START-HERE.md`, `TESTFLIGHT.md`. Last touched 18 August 2026. The real app is, and was, in
  `morse-chat-app`.

**Kept:** `server/`, `render.yaml`, `README.md`, `LICENSE`, `.gitignore`.

**Not as separable as it looked.** `src/` was not only dead app code — `web/tsconfig.web.json`
compiled `src/morse.ts` into the published web app, and `web/build.mjs` shelled out to the
TypeScript in the root `package.json`. Removing the app files alone would have left a web app that
could no longer be rebuilt. That is why the web version went in the same cut rather than being
stranded.

**Checked before and after:** nothing in `server/` or `render.yaml` reaches outside `server/`, and
the server's 52 tests pass both before and after the deletion. Render builds `rootDir: server`, so
nothing removed here is part of the deploy.

Everything deleted remains in git history.

**Still to do by hand:** GitHub → Settings → Pages is presumably still set to serve `main` /
`docs`. With `docs/` gone the site has nothing to serve, so that setting wants turning off.

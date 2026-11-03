# Morse Chat — relay server

The WebSocket relay that carries morse between two phones. **This repo is the server and
nothing else.**

| | Where |
|---|---|
| **The iPhone app** | `~/Documents/GitHub/morse-chat-app` — remote `danielfuchsnuernberg/morse-chat`. That is the TestFlight lineage and the only place app code lives. |
| **This repo** | The relay the app talks to: `wss://morse-tap-server.onrender.com` |

If you are looking for a screen, a button or anything a person taps, it is not here.

## Running it

```bash
cd server
npm install
npm start          # listens on PORT, default 8080
```

Health check, which is also how you tell the service is awake:

```bash
curl -s https://morse-tap-server.onrender.com/health
# {"status":"ok","version":"v7","storage":"ok"}
```

The free Render tier sleeps after inactivity, so the first call can take ~30 seconds.

## Tests

52 tests across six files, all expected to pass:

```bash
cd server
for f in test.js duplicate.test.js echo.test.js delivery.test.js offline.test.js push.test.js; do
  node --test --test-force-exit "$f"
done
```

## Deploying

Render serves this from `render.yaml` (`rootDir: server`).

**Pushing does not deploy it.** `render.yaml` says `autoDeploy: true`, but the service was not
created from that blueprint, so the dashboard's own setting governs — and it does not fire. Push,
then open the Render dashboard and press **Deploy**, then check it actually took. `/health` cannot
tell you, because it reports `version: v7` on every build. The honest test is a round trip of
something the new build changed.

## The rules not to break

`stillOwedTo()` in `server/index.js` deliberately re-offers a held message the recipient has not
confirmed, because a connection can die between the server sending and the phone showing it.
`countHandouts` (MAX_HANDOUTS = 4) is the backstop, not the filter. **Never filter delivery on
`alreadyDelivered`** — that list records what has been *shown*, and exists only for `unseenBy()`,
which feeds the app-icon badge. Two different questions. Locked in by `echo.test.js` → *"a message
handed to a connection that dies is offered again"*.

Message ids must be unique across phones, and the app puts the device into them.
`offline.test.js` → *"a reply survives when the two phones cannot pick the same id"* holds that,
and shows what breaks when it is not true: a second `m1` in a room counts as already confirmed, so
it is never delivered.

## What used to be here

Until November 2026 this repo also held a stale copy of an old React Native app, and a web version
of Morse Chat published to GitHub Pages from `docs/`. Both are gone.

The app code lives in `morse-chat-app` and always did; the copy here was a fork left behind. The
web version existed only because there was no App Store build yet — there is one now, so it was
retired rather than kept running in parallel.

Both are still in git history if they are ever wanted back.

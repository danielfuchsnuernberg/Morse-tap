# Morse Tap — v002

Send morse code to another person, in real time, from your iPhone. Tap a key, watch it turn into
dots and dashes, hit send. Your partner's phone beeps it out.

Built with Expo, so **you do not need a Mac** to run it on a real iPhone.

## What's in here

| Path | What it is |
|---|---|
| `App.tsx` | Tab shell and app state |
| `src/morse.ts` | All morse logic — encode, decode, tap timing, playback |
| `src/morse.test.ts` | 35 unit tests for the above |
| `src/useRelay.ts` | WebSocket connection with auto-reconnect |
| `src/useTone.ts` | The beep and the flashing key |
| `src/components/MessageReader.tsx` | Letter tiles, synced highlight, decode puzzle |
| `src/screens/` | Key, Chart, Settings |
| `server/` | The relay server that connects two phones |
| `assets/tone.wav` | 600 Hz sine, generated to loop seamlessly |

## Run it on your iPhone

**1. Install Node.js** (v20 or newer) from https://nodejs.org

**2. Get the code running**

```bash
git clone https://github.com/YOUR-USERNAME/morse-tap.git
cd morse-tap
npm install
npx expo start
```

**3. Install "Expo Go"** from the App Store on your iPhone, open it, and scan the QR code that
appears in your terminal. The app loads on your phone. Edit a file, the phone updates instantly.

## Deploy the server

Two phones can only talk once a relay server is running somewhere.

**Render (free):**

1. Push this repo to GitHub
2. Go to https://render.com → New → Blueprint → pick your repo
3. Render reads `render.yaml` and deploys `server/` automatically
4. Copy the URL it gives you, e.g. `https://morse-tap-server.onrender.com`
5. In the app's Settings tab, paste it as `wss://morse-tap-server.onrender.com` — note **wss**, not https

Free Render instances sleep after inactivity, so the first connection can take ~30 seconds.

**Test locally instead:**

```bash
cd server && npm install && npm start
```

Then set the server URL to `ws://YOUR-COMPUTER-LOCAL-IP:8080` (both phones on the same WiFi).

## How two people connect

There are no accounts. Both people type the **same room code** — any 3-12 letters or numbers, like
`BANANA7` — and press Join. Anyone with that code can join, so pick something not obvious.

## Hearing and decoding

Everything you send and receive plays as a real tone, and the letter currently sounding lights up
so you can follow along.

- Tap your draft to **hear it before you send it**
- Sending plays it back to you, highlighted letter by letter
- Incoming messages play automatically the moment they land
- Tap **Listen** on any message to replay it; tap again to stop

Messages you receive arrive **undecoded**. You see the dots and dashes for each letter and hear the
tone, and you type what you think it says. Letters you get right lock in green as you type; wrong
ones show in red so you know where you slipped. The Chart tab is one tap away if you get stuck, and
there's a **Reveal** button when you've had enough.

Your own sent messages are always shown in plain text — the puzzle is only for incoming.

## How to actually send morse

- **Short press** = dot
- **Long press** (hold ~3× as long) = dash
- **Pause** between letters, **longer pause** between words
- The Chart tab lists every letter and number. Tap any row to hear it.
- Start at 5 words per minute in Settings. It's slow on purpose.

The app shows the decoded English under your dots and dashes as you tap, so you always know whether
you got it right before you send.

## Tests

```bash
npm test           # 56 morse logic tests
npm run typecheck  # TypeScript, strict mode
npm run test:server # 11 live server tests (boots the real server)
```

## Not in v001

- Message history (messages vanish when you close the app)
- Push notifications when the app is closed
- App Store build — that needs an Apple Developer account ($99/yr) and `eas build`

## Licence

MIT

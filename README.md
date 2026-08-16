# Morse Tap — v016

Send morse code to another person, in real time, from your iPhone. Tap a key, watch it turn into
dots and dashes, hit send. Your partner's phone beeps it out.

Built with Expo, so **you do not need a Mac** to run it on a real iPhone.

## What's in here

| Path | What it is |
|---|---|
| `App.tsx` | Tab shell and app state |
| `src/morse.ts` | All morse logic — encode, decode, tap timing, playback |
| `src/morse.test.ts` | 109 unit tests for the above |
| `sim/` | Ten end-to-end simulations of real usage |
| `src/useRelay.ts` | WebSocket connection with auto-reconnect |
| `src/useTone.ts` | The beep and the flashing key |
| `src/components/MorseKey.tsx` | The key, with live dot/dash feedback |
| `src/components/GuideStrip.tsx` | Type a message, see the morse, tap along |
| `src/storage.ts` | Saving settings, room and messages on the phone |
| `src/components/ConnectionBar.tsx` | Header status chip and the room controls |
| `src/components/EchoReader.tsx` | Decode a received message by ear, letter by letter |
| `src/components/MessageReader.tsx` | Letter tiles, synced highlight, decode puzzle, hints |
| `src/screens/` | Key, Chart, Settings |
| `server/` | The relay server that connects two phones |
| `assets/tone.wav` | 600 Hz sine, generated to loop seamlessly |

## The web version — no install, no Mac

There's a second version of the app that runs in the browser and can be added to an iPhone home
screen like a normal app. It shares the exact same morse core as the phone app — `src/morse.ts` is
compiled straight to `docs/lib/morse.js`, so both run the same 182-tested logic.

**Why it exists:** the Expo route needs your Mac awake with a terminal running, and the tunnel
address changes every restart. The web version needs none of that. It lives on GitHub Pages, so it
works whenever, from anywhere, for anyone you send the link to.

**Publishing it:**

```
npm run web:build   # rebuilds docs/ from web/
git add docs && git commit -m "web" && git push
```

Then on GitHub: Settings → Pages → Source: `main` branch, `/docs` folder.

Your app is then at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

**Adding it to a home screen (iOS):** open that URL in **Safari** (not Chrome), tap the Share
button, then **Add to Home Screen**. It gets its own icon and opens fullscreen with no browser
chrome.

**What differs from the phone app:** no vibration (iOS Safari doesn't allow it), and the beep is
generated with Web Audio rather than a sound file — which is actually cleaner. Sound needs one tap
to start, because iOS blocks audio until you touch the screen.

| Path | What it is |
|---|---|
| `web/` | Source of the web version |
| `docs/` | Built output, served by GitHub Pages |
| `web/build.mjs` | Compiles `src/morse.ts` to browser JavaScript |
| `web/publish.mjs` | Rebuilds and copies into `docs/` |

## Run it on your iPhone

> **Expo SDK 54.** Pinned deliberately so it loads in the App Store version of Expo Go. Don't run
> `npx expo upgrade` — a newer SDK means Expo Go refuses the project with "incompatible version".

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

## Put it on someone else's iPhone, free

Getting an app permanently onto another person's iPhone normally needs an Apple Developer account
at $99/year. There's a way around it: build it as a web app.

```
npm run build:web
```

That writes an installable site into `docs/`. Commit and push it, then on GitHub go to
**Settings → Pages** and set the source to the **/docs folder on main**. Your app is then live at
`https://YOUR-USERNAME.github.io/YOUR-REPO/`.

Whoever you send that link to opens it in Safari, taps **Share → Add to Home Screen**, and gets an
icon on their home screen. It opens fullscreen with no browser chrome, keeps its own settings and
message history, and works whether or not your Mac is switched on.

It is the same app — same key, same tones, same decoding by ear — running in Safari instead of as a
native binary. Tones use the Web Audio API, storage uses the browser's, and the WebSocket connects
to the same relay server.

What you give up: no push notifications, and no vibration on iPhone (Safari doesn't allow it). The
app switches vibration off by itself there.

If your repo name changes, rebuild with the new path:

```
BASE_URL=/your-repo-name npm run build:web
```

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

## What the app remembers

Settings, your room code and your messages are kept on the phone. Reopen the app and it's where you
left it, already rejoining the room you were in — no typing the code again.

Half-finished decoding survives too. Get three letters into a message, close the app, come back, and
you carry on from the fourth.

The last 200 messages are kept. Settings has a button to delete them.

**This is on-device only.** Messages are not stored on the server, so anything sent while your phone
is closed is missed.

## Did it actually send?

Every message you send now shows what really happened to it:

- **Sending…** — handed to the server, waiting for confirmation
- **Delivered** — the server confirmed your partner received it
- **Nobody there** — it reached the server, but the room was empty
- **Not sent · Retry** — the connection was down, so it never left. Tap to try again

Anything that couldn't go out is held and sent automatically the moment the connection returns,
including after a restart. Nothing is silently dropped, and nothing claims to have been sent when
it wasn't.

## How two people connect

The connection status lives as a small dot beside the title. Tap it to open the room controls; tap
again to fold them away, so they cost screen space only while you're using them.

There are no accounts. Both people type the **same room code** — any 3-12 letters or numbers, like
`BANANA7` — and press Join. Anyone with that code can join, so pick something not obvious.

## Hearing and decoding

Everything you send and receive plays as a real tone, and the letter currently sounding lights up
so you can follow along.

- Tap your draft to **hear it before you send it**
- Sending plays it back to you, highlighted letter by letter
- Incoming messages play automatically the moment they land
- Tap **Listen** on any message to replay it; tap again to stop

## Decoding by ear

The default. A message arrives **silent and blank** — no dots, no dashes, no letters, and it does
not play on its own.

For each letter in turn:

1. **Listen** — you hear that one letter
2. Its **dots and dashes appear**
3. You **tap that pattern back** on the key
4. Only now does **the letter itself** appear

Hear it, see it, send it, then read it. Nothing is ever copied off the screen, because the letter
doesn't exist on screen until you've already produced it.

Tap a wrong symbol and the letter resets so you can listen again — it costs you a miss, not your
progress. There's **Skip this letter** when one won't come, and **Show all** to give up. Finish
without a single miss or skip and it reads *Decoded · perfect*.

While decoding, the key belongs to that message; the compose controls step aside and a banner says
so. Matching is symbol by symbol, so there's no timing to get right while decoding — only dot
versus dash.

Switch to **By typing** in Settings for the older, quicker style below.

## Decoding by typing

Messages you receive arrive **fully coded**. Nothing is filled in for you — just the dots and
dashes and the sound. You type what you think it says; correct letters lock in green, wrong ones
show red so you know where you slipped.

When you're stuck, four things help, all opt-in:

- **Tap a tile** to hear that one letter on its own — no replaying the whole message
- **Hold a tile** to reveal that specific letter
- **Slow** replays the message at half speed
- **Give me a letter** reveals the next letter you haven't got

Anything that hands you a letter counts as a hint, and the count is shown on the message. Finish
without any and it reads **Solved · no hints**. There's no difficulty setting — you set the
difficulty by how much help you take.

**Show all** gives up and reveals everything.

Your own sent messages are always shown in plain text — the puzzle is only for incoming.

## How to actually send morse

You don't need to count or guess. The key tells you what it's doing while you hold it:

- **Hold it.** A dot appears, and a bar creeps across the key.
- **When the bar fills, the dot becomes a DASH** and the key turns orange. Let go at whichever one
  you wanted.
- **After you release**, a thin line under the key drains away. Tap again before it empties and
  you're still in the same letter. Let it drain and the next tap starts a new letter.
- **For a new word, press Space.** Pauses never start a word — only that button does. Take as long
  as you like between letters without splitting your message.

Speeds are set with a stepper rather than a handful of presets: Beginner runs 3–20 wpm in fine
steps at the slow end, Farnsworth character speed 8–25, and overall pace right down to 2 wpm. Slower
means longer gaps, which is the cure for letters running together.

At the default 5 words per minute a dash needs about half a second. Slower than feels natural, which
is why the key shows you rather than making you count.

The decoded English appears under your dots and dashes as you tap, so you always know whether you
got it right before you send. The Chart tab lists every letter and number — tap any row to hear it.

## Two modes

Switch in Settings.

**Beginner** — everything at one slow speed, and a **Space** button separates words. Pauses never
split a word, so you can take as long as you like between letters. This is not real morse; it's
training wheels, and there's no shame in it.

**Farnsworth** — how morse actually works, and how it has been taught for decades. Each letter is
sent at full speed (18 wpm by default) so it sounds like real morse, but the silences between
letters are stretched to give you thinking time. There is no Space button: a long enough pause
starts a new word, exactly as on a real telegraph key.

Why letters at full speed? Learning them slowly teaches you to *count* dots, and that becomes a wall
around 10 wpm that's genuinely hard to break through. Farnsworth avoids it by making you learn each
letter's sound shape from the first day.

The key shows a second countdown bar in Farnsworth mode, so you can see the word gap approaching
rather than guessing at it.

## The guide

Above the key there's a **Guide** panel. Type what you want to say — `I LOVE YOU` — and it lays out
the morse for every letter, in order, right where you can see it while tapping.

**It never sends anything.** The only thing that gets sent is what you actually tapped on the key.
The guide is a crib sheet, not a shortcut.

As you tap, each letter turns green when you get it. The panel tells you which letter is next and
what it looks like, so you never leave the Key tab. Tap any guide letter to hear it. Go wrong and it
says so immediately — hit Undo and carry on.

Collapse it when you don't need it.

## Fixing mistakes

- **Tap Undo** — removes one dot or dash
- **Hold Undo** — removes the whole last letter, however many symbols it had
- **Space** — ends the current word. Tapping it twice does nothing extra, and Undo removes it.

A wrong letter three symbols deep shouldn't take three taps to clear. Hold Undo once and the guide
puts you straight back on track.

## Tests

```bash
npm test            # 182 logic tests
npm run typecheck  # TypeScript, strict mode
npm run test:server # 17 live server tests (boots the real server)
```

## Not in v016

- Messages arriving while your phone is closed (nothing is stored on the server)
- End-to-end encryption (the relay sees messages in plain text)
- Push notifications when the app is closed
- App Store build — that needs an Apple Developer account ($99/yr) and `eas build`
- Vibration on the web version (Safari on iOS doesn't support it)

## Licence

MIT

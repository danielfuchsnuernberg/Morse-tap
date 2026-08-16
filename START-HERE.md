# START HERE

Everything you need to run the app. Nothing else.

---

## Every day — two lines

Open Terminal, then type these one at a time, pressing Enter after each:

```
cd ~/Projects/morse-tap
```

```
npx expo start
```

Wait for the QR code, then press the **i** key.

**Leave that window open.** It's the engine running your app. Close it and the app dies.

---

## New version from Claude — five steps

1. Press **Ctrl+C** in the terminal. That stops the engine.
2. In Finder, open your `Projects` folder and **delete the old `morse-tap` folder**.
3. Double-click the new zip in Downloads. Drag the `morse-tap` folder it creates into `Projects`.
4. Back in Terminal:

   ```
   cd ~/Projects/morse-tap
   ```

   ```
   npm install
   ```

   Takes a couple of minutes.

5. Then the usual:

   ```
   npx expo start
   ```

   Press **i**.

`npm install` downloads the app's building blocks. It's the only extra step for a new version, and
you only ever need it once per folder.

---

## While the app is running

Press these keys in the terminal window:

| Key | What it does |
|-----|--------------|
| `i` | Open the iOS simulator |
| `r` | Reload the app |
| `?` | Show all commands |
| `Ctrl+C` | Stop everything |

Edit any file and the simulator updates within a second or two. That's why the window stays open.

---

## In the app

| Action | What it does |
|---|---|
| Hold the key | Dot appears; hold longer and it becomes a dash |
| Tap **Undo** | Delete one dot or dash |
| **Hold Undo** | Delete the whole last letter |
| Tap **Space** | End the word (Beginner mode only) |
| Settings → Mode | Beginner (Space button) or Farnsworth (real timing) |
| Settings → Decoding | By ear (listen, then tap it back) or By typing |
| Settings → History | Delete stored messages |
| Tap **Clear** | Wipe the draft and start over |
| Guide panel | Type what you want to say, tap it out, letters go green |

---

## Publishing the web version

To update the version your fiancée uses:

```
cd ~/Projects/morse-tap
```

```
npm run build:web
```

Then commit and push in GitHub Desktop. Her app updates next time she opens it — she doesn't
reinstall anything.

---

## Three rules that prevent most problems

1. **One line at a time.** Type it, press Enter, wait. Don't paste several lines at once.
2. **The `%` prompt means it finished.** No prompt showing means it's still working — just wait.
3. **Lost? Type this.** It works from anywhere and puts you back where you should be:

   ```
   cd ~/Projects/morse-tap
   ```

---

## When something breaks

| What you see | What it means | What to do |
|---|---|---|
| `command not found` | Typo, or a missing space after `cd` | Retype it carefully |
| `no such file or directory` | You're not where you think you are | `cd ~/Projects/morse-tap` |
| `Operation not permitted` | macOS is blocking Terminal from a folder | Use Finder to move files instead |
| `npm warn` (yellow) | Normal. Ignore it | Nothing |
| `npm error` (red) | Actual problem | Copy the whole thing and send it to Claude |
| Red screen in the simulator | The app crashed | Press `r` to reload. Still broken? Ctrl+C and start again |
| Simulator won't load | Engine isn't running | Check the terminal is still open, press `i` again |

---

## The easy way to share it: the web version

`npm run web:build`, then commit and push. GitHub Pages serves it at your repo's URL.

Anyone opens that link in **Safari** → Share button → **Add to Home Screen**. They get a real icon
and a fullscreen app. No Expo Go, no link that expires, and **your Mac doesn't need to be running**.

This is the version to send your fiancé.

## The developer way: Expo tunnel

Run `npx expo start --tunnel` instead of `npx expo start`. That works over the internet, so someone
in another country can load it — they need Expo Go and the `exp://` link.

Their Expo Go must support **SDK 54**, which this project is pinned to. If they see "Project is
incompatible with this version of Expo Go", their Expo Go is older than the project.

Your Mac must stay awake with the terminal running the whole time.

## Where things live

- **Your code:** `~/Projects/morse-tap` — the `~` means your home folder, `/Users/danielfuchs`
- **Never put it in iCloud Drive or Desktop.** Both sync, and syncing tens of thousands of files
  breaks builds.

---

## Two things still to do

- **The GitHub repo is incomplete.** It's missing `src`, `server`, and `assets` — the browser
  upload dropped the folders. Needs a proper push.
- **The server isn't deployed.** Until it is, you can't send morse to another person. Everything
  else works.

Ask Claude about either when you're ready.

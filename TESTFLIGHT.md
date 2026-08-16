# Getting Morse Tap onto her phone properly

Four phases. Phase 1 has a waiting period, so start it first.

---

## Phase 1 — Enrol with Apple ($99/year)

1. Your Apple ID needs **two-factor authentication** switched on. iPhone →
   Settings → your name → Sign-In & Security. Turn it on if it isn't.
2. Go to **developer.apple.com/programs/enroll**
3. Sign in, choose **Individual / Sole Proprietor** (not Company — that needs a
   registered business and a D-U-N-S number)
4. Apple asks to verify who you are. Have a **passport or driving licence** to
   hand; on iPhone the Developer app can scan it, which is quicker.
5. Pay the $99. It renews yearly unless cancelled.

**Then wait.** Approval usually takes 24-48 hours. You'll get an email.

Nothing below works until that email arrives.

---

## Phase 2 — Prepare (do this while waiting)

Everything here is already set up in the project:

- Bundle identifier: `com.danielfuchs.morsetap` — your app's permanent name to
  Apple. Changing it later means a new app, so it's set now.
- `eas.json` — how the cloud build is configured
- A 1024px app icon with no transparency, which Apple requires

What you need to do:

1. Make a **free Expo account** at expo.dev/signup
2. In Terminal, in the project folder:

   ```
   npm install
   npm install -g eas-cli
   ```

   If that second one fails on permissions, use:

   ```
   sudo npm install -g eas-cli
   ```

   It asks for your **Mac password**, not an Apple one.

3. Log in:

   ```
   eas login
   ```

---

## Phase 3 — Build it in the cloud

Once Apple has approved you:

```
eas build --platform ios --profile production
```

- It asks to log into your **Apple Developer account**. Say yes — EAS creates
  the certificates and provisioning profiles for you. This is the part that
  would otherwise need Xcode and a lot of patience.
- The build runs on Expo's Mac servers. **15-30 minutes.** You can close the
  terminal; it emails you when it's done.
- First build asks a few questions. The defaults are right.

---

## Phase 4 — TestFlight

```
eas submit --platform ios --latest
```

Then at **appstoreconnect.apple.com**:

1. Your app appears under **Apps** → **TestFlight**
2. Processing takes 10-20 minutes
3. Add a **test group**, then add her by email address
4. **The first build needs Apple's Beta App Review** — usually a day. Later
   builds skip it.
5. She gets an email, installs **TestFlight** from the App Store, and taps
   Accept. Morse Tap lands on her home screen like any other app.

---

## Shipping an update later

```
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Her TestFlight tells her there's an update.

---

## Things worth knowing

- **Builds expire after 90 days.** You'll need to send a fresh one roughly
  quarterly, or her copy stops opening.
- **The $99 renews yearly.** Miss it and TestFlight stops working.
- **The server is separate.** Render still relays the messages; none of this
  changes that.
- **The web version still works** and costs nothing. Keep it as a fallback.

# Android

**Partly built, mostly not, and the split is the point of this file.** TASKS.md
§ *Build for Android* asked for two things — evaluate the relevant differences,
and establish a dev simulator on the Mac. Both were done on 2026-09-01, along
with the one piece of code that could not be deferred without shipping a known
defect. Everything else this file describes is unbuilt, and each item says what
it would cost. When Android ships, what survives moves to
`decisions/DECISIONS.md` and this file goes.

It replaces BACKLOG.md § *Android has never been built or run*, whose factual
claims had gone stale — there is an `android/`, and a build has been attempted.

---

## What is true now

`bin/android` builds and installs the app on an emulator. `app/src/audio/`
configures the Android audio session, which it did not before. Nothing else
about this app is Android-aware, and **no Android build has ever been in
anybody's hands**: there is no signing key, no Play listing, no `eas.json`, and
`bin/upload-ios` remains the only release path this repository has.

The premise BACKLOG.md wrote down still holds where it matters:

> Every hard problem in this project has been an iOS problem, and each was
> solved against iOS's rules.

What that section got wrong was the scale of the *first* step, not the shape of
the rest. Getting the thing to build and run took an afternoon. The list below
is what is left, and it is longer than the build was.

---

## The dev loop

`bin/android --setup` once, `bin/android` thereafter. The script carries the
four environment facts that no error message names; read its header rather than
this paragraph, since it is the thing that goes stale otherwise.

**What has actually been seen**, so that the claim is a measurement rather than
a promise: the app builds, installs, launches, renders the sign-in screen in
the light palette, and reaches the deployed server — Pixel 7 profile, API 36,
arm64, `versionCode` 131. Nobody has signed in on it, so **no channel, no
audio and no floor has been exercised on Android at all**. That is the next
step and it needs a second device.

Three of those facts are worth repeating here, because each cost part of the
afternoon and none of them announces itself:

- **Every JDK on this machine is too new.** Android Studio bundles JDK 25;
  Homebrew's `openjdk` is 26. Gradle 8.14.3 — what the wrapper pins — supports
  neither, and says so as a class-file-version error naming a jar. `bin/android`
  pins the keg-only `openjdk@17`, and `brew install openjdk@17` is the fix if it
  is missing.
- **The emulator sends digital silence unless you ask twice.** `-allow-host-audio`
  on the command line is necessary and not sufficient: the runtime toggle in
  Extended Controls → Microphone → "Virtual microphone uses host audio input" is
  **off by default and resets on every boot**. Both are needed. An audio port
  debugged against an emulator missing either is an audio port debugged against
  a dead microphone, and everything else will look perfect while it happens.
- **A changed `app.json` does not reach the build.** `expo run:android`
  regenerates `android/` only when it is *missing*; an existing one is left
  alone, silently, and the build succeeds carrying the old configuration.
  `bin/android --prebuild` is the answer, and this is how `versionCode` was
  set, built cleanly, and still shipped as 1.

### Getting a build onto somebody else's phone

`bin/android --apk` produces a standalone APK to send. **Release, not debug**,
and the distinction is the trap: a debug apk carries no JavaScript — it fetches
the bundle from Metro on the building machine at launch, so to anybody else it
is a blank or red screen with nothing naming the cause.

Three things to know before sending one:

- **It is signed with the debug keystore**, which the Expo template uses for
  `release` too. Fine for sideloading, useless for Play — Google refuses the
  shared debug key, and a real upload key is one of the deferred items below.
- **`EXPO_PUBLIC_API_URL` is baked in at bundle time** from `app/.env`. Nothing
  in the app tells you which server it is talking to, so check that file before
  building a copy for somebody else — a build made while pointed at a LAN
  address is one they cannot use and cannot diagnose.
- **`accounts.debug` is a server-side column, not a build flag.** It arrives in
  `hello` and turns on the debug panel and the audio-log shipping in
  `AppProvider`. So a remote tester can be given diagnostics without a new
  build: set the column for their account with `bin/db --write`. This matters
  because a release build has no `__DEV__`, so the `[audio]` console trace that
  made the emulator legible is simply absent on their phone.

And one thing to tell whoever installs it: **backgrounding the app will
probably drop the audio**, because the foreground service does not exist yet.
Keep it in the foreground. That is a known gap rather than a bug worth
reporting — see below — and without saying so, it is the first thing they will
report and the least informative.

### Getting onto Play

Decided 2026-09-01: **internal testing track first**, production later. The
internal track is Play's TestFlight — up to 100 testers, live in minutes, no
review, and testers update through the Play Store itself. When Android ships,
this section moves to RELEASING.md.

**The account is the long pole and nothing else can start it.** There was no
Play Console account as of this date. It is $25 once, and identity
verification takes days — so it is the thing to begin before any of the work
below matters. The choice at signup has a consequence that is awkward to undo:
a **personal** account registered recently must run a closed test with 12+
testers for 14 days before it may reach production, where an **organization**
account is exempt but needs a D-U-N-S number.

What is already done:

- **The upload key exists**, generated 2026-09-01: 4096-bit RSA, PKCS12, in
  `~/.config/thefloor/upload.keystore` with its password in
  `upload-keystore.txt` beside it, both mode 600. It is the ninth credential;
  planning/CREDENTIALS.md carries it. **It is the *upload* key, not the app
  signing key** — Play App Signing means Google holds the latter and re-signs
  what we send, so a lost upload key is a support ticket rather than the end of
  the listing. That is the entire reason to let Google hold it.
- **`bin/android --aab`** builds and signs the bundle. Verified as signed by
  `CN=The Floor` rather than Android's debug key, which is the thing Play
  rejects.

Three things about the artifact that differ from the APK path:

- **Play takes an App Bundle, not an APK**, for any new app.
- **The bundle carries every architecture** and Play splits it per device, so
  the arm64-only trick `--apk` uses is deliberately absent here. 64MB is
  expected.
- **Signing is injected on the command line** rather than written into
  `android/app/build.gradle`, because that file is regenerated by prebuild and
  an edit to it disappears silently — leaving a debug-signed bundle that fails
  at upload.

#### Where the account is created, and what to have ready first

**play.google.com/console/signup.** It cannot be done by anybody but the person
whose identity backs it: it takes a government ID, a payment card and
acceptance of an agreement in their name.

Assemble these before starting, because the flow asks for them in the middle
and several are permanent:

| | |
| --- | --- |
| **Google account** | Owns the listing more or less forever — transferring later is a support process. Pick the one that should still exist in five years, not the convenient one. |
| **Account type** | **Personal.** Organization skips the 12-tester gate but needs a D-U-N-S number and a registered entity. |
| **$25** | One-time, not annual — unlike Apple. |
| **Government photo ID and an address** | Verification takes days, and nothing proceeds until it clears. Start here. |
| **A public developer name** | Shown on every listing. |
| **A public contact email and address** | Google publishes developer contact details. For a personal account this can mean a home address unless an alternative is given — read those screens rather than clicking through, since changing it later is harder. |

Then the app entry itself, whose answers are mostly already decided by things
in this repository:

| | |
| --- | --- |
| App name | `The Floor` — **check availability, do not assume the iOS compromise applies.** Play does not require globally unique titles, so the App Store's `The Floor Uninterrupted` may be unnecessary here. |
| Package name | `co.rvanegas.thefloor`, matching the iOS bundle id. **Permanent once uploaded.** |
| App or game | App |
| Free or paid | **Free, and permanent in one direction**: a free app can never become paid. Donations are external and do not make it paid. |
| Category | Communication |
| Website | `https://thefloor.rvanegas.co` |
| Privacy policy | `https://thefloor.rvanegas.co/privacy` — already served, already accurate |
| The artifact | `bin/android --aab` |

And the **App content** declarations, which must all be answered before a
release reaches *any* track, internal included:

- **App access** — not a public app; give the App Review demo account from
  planning/DEMO-ACCOUNT.md. The same credentials serve both stores.
- **Ads** — none. `/privacy` says so and is true.
- **Content rating** — a questionnaire. This app carries user-generated content
  and direct user-to-user communication, which is the branch that asks about
  moderation; see the safety note below.
- **Target audience** — not children. `/privacy` has a Children section.
- **Data safety** — the substantive one, drafted below.
- **Government apps, financial features, health** — none.
- **Data deletion** — asks for a URL. **There is not one**; see below.

#### Data safety, drafted from `/privacy`

The form is a transcription of a policy that is already written, not new
research — but it is a public declaration and must agree with `/privacy`
exactly. What that page says is collected:

| Item | Play's category | Notes |
| --- | --- | --- |
| Email address | Personal info → Email address | How you sign in; required |
| Display name | Personal info → Name | Shown to contacts and channel members |
| WhatsApp/Telegram/Signal handle | Personal info → **Phone number** | Optional, user-typed. `/privacy` says outright that two of the three are phone numbers, so this must be declared even though nothing reads the device for them |
| Audio recordings | Audio → Voice or sound recordings | Deliberate, visible to the channel, stored in S3 in the US |
| Transcripts | Audio, or Other | **Shared with AssemblyAI**, and the only third party that receives anything |
| Channels and membership | App activity, or Other | So a conversation survives the app closing |
| Notification token | Device or other IDs | Identifies an installation, not a person |
| Last connected | App activity | Shown to contacts |
| Usage totals | Other | Durations and byte counts, never content, deleted after the retention window |

Also true and worth stating because it is unusually clean: **no advertising, no
third-party analytics, no address book access, no profiling, no location.**
Encrypted in transit, yes. Deletion available, yes — with the gap below.

#### A safety question the content rating will raise

Play's user-generated-content policy expects a way to report or block. **There
is no report and no block in this app.** What there is:

- The graph is **consent-based** — a contact request must be accepted before
  anybody can reach you, and `/contacts/:id/decline` refuses it.
- **A contact can be removed**, and it is not merely cosmetic: `DELETE
  /contacts/:id` calls `removeContact` and then `leavePairChannels`, so the
  shared channels go with it.

That is a real answer to "how does a user get away from somebody", and it is
the answer App Review accepted. It is **not** the same as a reporting channel,
which is what Google's policy asks for, and whether the closed graph is
accepted in its place is unknown rather than settled. Worth deciding what to
say before the questionnaire rather than during it.

#### What Play wants that Apple did not

- **A web account-deletion path, which is being built as this is written.**
  Google requires apps with accounts to offer deletion *without* the app — a
  URL submitted in the console — alongside the in-app route. `DELETE /me` is a
  bearer-token API route, and `/privacy` said in as many words that "your
  account is deleted from inside the application". A separate piece of work
  started 2026-09-01 closes it; **when it lands, the URL goes in the Data
  safety form and this paragraph should say what the URL is** rather than that
  the gap exists.

  **It is on the critical path to the first tester, not to the public
  listing** — this file said the latter for part of 2026-09-01 and it was
  wrong. The Data safety form asks for the URL, and Data safety must be
  complete before a release reaches *any* track, internal included. So it
  blocks handing the app to one person, which is the whole current goal.
- **The Data safety form**, which is more specific than Apple's nutrition
  label and is a public declaration. What this app actually collects: an email
  address, audio recordings, transcripts, push tokens, and per-account usage
  figures. `/privacy` is the source of truth for all of it and is already
  written — the form is a transcription exercise, not a research one, but it
  must agree with the policy exactly. **Transcripts leave for AssemblyAI**,
  which is third-party sharing and must be declared as such.
- **The app-access section wants working credentials**, exactly as App Review
  does. The demo account answers both — see planning/DEMO-ACCOUNT.md, which
  becomes dual-purpose rather than Apple-only, and whose teardown ordering now
  has a second consumer.
- **Content rating questionnaire and target audience**, neither of which has an
  App Store equivalent in that form.
- **The name may not need changing.** Play does not require globally unique
  listing titles, so `The Floor` may be available where the App Store forced
  `The Floor Uninterrupted`. Worth checking rather than assuming the iOS
  compromise carries over. The package name `co.rvanegas.thefloor` is already
  registered against Apple and is fine to reuse; on Play it is likewise
  permanent once uploaded.
- **The donation link needs a decision, and `region.ts` cannot answer it.**
  That gate implements Apple's guideline 3.1.1(a) and is written entirely in
  terms of the US storefront. Google's rules are different, so the Ko-fi link
  needs a platform dimension — not removal, which would break the iOS build's
  compliance.
- **`/privacy` is Apple-shaped in at least one place**: it says a push token is
  discarded "when Apple reports it as" stale. Whatever the Android push story
  becomes, that sentence needs to cover it.

#### What a tester will find missing

Worth stating before anybody installs from the track, because all three are
known and none is a bug report worth having: **no notifications at all** (there
is no FCM sender), **audio probably stops when the app is backgrounded** (no
foreground service), and **nobody has yet heard two-party audio on Android at
all**. The last is the reason production is not the first target.

### What the emulator cannot tell you

This matters more than what it can, because a green emulator reads as a working
port and is not one. The emulator cannot answer:

- **Echo cancellation.** There is no acoustic path between a virtual speaker and
  a virtual microphone, so the failure the whole of POSTMORTEM-echo.md is about
  cannot occur on one. `MODE_IN_COMMUNICATION` being set is checkable; whether
  it does its job is not.
- **Bluetooth and routing.** No A2DP, no HFP, no headset. The mic-less-Bluetooth-
  speaker trap that `CALL` is written around — DECISIONS.md § *No output that
  cannot also capture* — cannot be reproduced or ruled out here.
- **Background audio**, which is unbuilt in any case; see below.
- **The phone-call interruption** that TASKS.md § *Websocket Lost* is still open
  on. An emulator has no cellular call to be interrupted by.

All four need a physical Android handset. None of them is a reason to delay the
emulator loop, and all of them are reasons not to trust it.

---

## The audio session, which is the part that was built

`app/src/audio/session.ts` held two states, `IDLE` and `CALL`, as Apple
configurations. It now also holds the same two states in Android's vocabulary,
chosen by the same boolean from the same rule in `core/micNeeded.ts`.

| | iOS | Android |
| --- | --- | --- |
| `IDLE` | `playback` / `mixWithOthers` / `spokenAudio` | mode `normal`, stream `music`, usage `media` |
| `CALL` | `playAndRecord` / `allowBluetooth`+`allowAirPlay`+`defaultToSpeaker` / `videoChat` | mode `inCommunication`, stream `voiceCall`, usage `voiceCommunication` |

**This was not an enhancement, it was a defect — but not the defect it first
looked like, and the correction is worth keeping.** The obvious reading is that
an unconfigured Android build captures under `MODE_NORMAL` with the hardware
echo canceller off, which would be POSTMORTEM-echo's build 17 reached by
omission. That reading is **wrong**, and it was wrong in the first draft of this
file. The SDK defaults `audioMode` to `MODE_IN_COMMUNICATION`
(`AudioSwitchManager.java`), so the echo canceller was already on.

What was missing was the **transition**. Android held communication mode for
the entire time it was connected, whether or not this app had any audio of its
own — so an empty channel kept the phone in voice-call mode, on the voice
stream, taking another app's playback with it. That is `IDLE` being
unavailable, not `CALL` being wrong, and it is the same argument `IDLE` exists
for on iOS arrived at from the other end.

Confirmed on the emulator: joining a channel alone now logs `[audio] IDLE` and
Android requests focus with `USAGE_MEDIA`. Before the change that request
carried `USAGE_VOICE_COMMUNICATION` and never left it.

Three structural notes, all of which are load-bearing and none of which is
guessable from the code:

- **Two states, not two state machines.** The `hasAudio` boolean is computed
  once, cross-platform, in `core/`. `session.test.ts` pins that the two
  platforms move with it in the same direction, which is the assertion an
  Android-only third state would fail.
- **`pushPolicy` stays iOS-only, and that guard is not a debt.** Every other
  `Platform.OS !== 'ios'` in `src/audio/` marks something Android still owes.
  That one does not: the policy exists to agree with the SDK's *native observer*,
  a second writer that re-applies configuration on every audio-engine transition
  with no JavaScript in the path. Android has no observer and no shared
  process-wide session object for one to write to. There is nobody to agree
  with. STATES.md's three-writers section is the iOS story and has no Android
  counterpart — which makes Android the simpler platform in this one respect,
  and is worth knowing before somebody "fixes" the asymmetry.
- **Mixing is not expressible as a flag here.** On iOS `mixWithOthers` is a
  category option. On Android what decides whether another app keeps playing is
  the audio-*focus* request, and both presets ask for `gain`. So the behaviour
  `IDLE` exists to provide — an empty channel costing the speakers nothing — is
  **unverified on Android**. It is the first thing to check on real hardware
  after echo.

### What was left iOS-only, deliberately

`muteMode.ts`, `engineState.ts`, `probe.ts`, `diagnostics.ts` and
`app/modules/audio-route/` are all `AudioDeviceModule` or `AVAudioSession`
readers, and all already degrade to `null` off iOS by design. They stay.

The consequence worth naming: **on Android nothing in this stack can read a
route back.** `audio-route` was built precisely because five builds were spent
on routing questions nobody could measure; Android is back in that position.
`adb logcat` filtered to `AudioManager` is the substitute, and it is a poor one.

`routePicker.ts` is the one with a real Android answer that was not taken:
`AudioSession.getAudioOutputs()` + `selectAudioOutput(deviceId)`, a list rather
than a system sheet. So `ChannelSettingsView.tsx`'s "Audio output" card needs a
*different control*, not the same one with its guard removed. Unbuilt.

---

## Push, which is the largest gap

`device_tokens` has carried a `platform` column accepting `'android'` since it
was written, and that is the entire extent of the readiness.

- `server/src/push.ts` is a hand-written **APNs HTTP/2 provider** — ES256
  provider JWTs, `apns-topic`, `apns-collapse-id`, 410 pruning. None of it is a
  transport abstraction; it is APNs specifically. FCM is a second sender
  alongside it, not a parameter to this one.
- `app/src/push.ts:196` registers with `Platform.OS as 'ios'` — a cast, so an
  Android build would send `'android'` at runtime and reach a server with no
  path for it.
- **No notification channel.** Android 8+ requires `setNotificationChannelAsync`
  before any notification can be shown; there is no call to it anywhere. Without
  one, notifications are silently dropped — no error, nothing on screen.
- **No `POST_NOTIFICATIONS` permission**, required to even ask from Android 13.
- The tap-to-open-a-channel path (`channelOf`, `getLastNotificationResponseAsync`)
  is the only deep link into this app, and it rides on the delivery that does not
  exist.

Cost: a Firebase project, `google-services.json` in the build, an FCM v1 sender
in `server/src/push.ts` with its own credential (a ninth, for CREDENTIALS.md),
and a channel + permission on the client. It is the largest single item here and
it is not on the critical path to a working dev loop, which is why it was
deferred rather than started.

## Background audio, where the work genuinely diverges

iOS's `UIBackgroundModes: ["audio"]` has no counterpart. Android needs a
**foreground service typed `microphone`**, which means:

- `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` permissions, neither
  declared;
- a persistent notification the user can see for as long as the channel is open,
  which is a product decision as much as a technical one — iOS shows nothing
  equivalent;
- and from Android 14, the service may only start while the app is already
  foregrounded, which interacts badly with being *pulled* into a channel by a
  notification.

BACKLOG.md's sequencing was right and stands: this is third, after the build and
after a channel works between two real devices.

Also absent and needed on real hardware: **`BLUETOOTH_CONNECT`**, required from
Android 12 for headset routing. Its absence would present as Bluetooth simply
not working, with no permission prompt to suggest why.

## The release-shaped items

Named so nobody meets them for the first time under a deadline. All deferred.

- **`versionCode` and `MIN_SUPPORTED_BUILD`, which is not a release-shaped
  item at all — it blocks the first run.** This was found the hard way and is
  the most useful thing the emulator produced. The first Android build
  installed, launched, rendered and reached the deployed server, and then
  replaced itself with the **"Time to update"** screen before showing a single
  channel. `app/src/api/build.ts` reads `Application.nativeBuildVersion`, which
  on Android is `versionCode`; `app.json` declared none, so it was **1**;
  `MIN_SUPPORTED_BUILD` is 51; `mustUpdate` is therefore true for every Android
  build that has ever existed. The expiry client works perfectly, which is why
  it took a screenshot rather than a stack trace to see.

  Fixed by giving `app.json` a `versionCode` matching the iOS `buildNumber`
  (131), i.e. **one build-number stream across both platforms**. That is the
  cheap answer to the platform-dimension problem rather than a workaround for
  it: while the two numbers stay equal, `MIN_SUPPORTED_BUILD` keeps meaning one
  thing, and AGENTS.md's floor rule needs no second column.

  **`bin/upload-ios` now moves both**, decided the same day. It takes the next
  number from the *larger* of the two rather than from iOS, so a pair that has
  already drifted is healed rather than carried forward, and it says so on
  stderr when it finds one — drift is repairable but is evidence that something
  bumped one alone, which is worth knowing. The commit it makes is *Bump build
  number to N* rather than *Bump iOS build number to N*, because it is no
  longer only that.

  Two things this does not do. It does not regenerate `android/`, so a bumped
  `app.json` reaches an Android build only through `bin/android --prebuild` —
  the same trap as any other `app.json` edit. And it is still the *only*
  bumper: an Android-only release path, when there is one, has to move both
  numbers too or the drift comes back from the other side.
- **`UpdateRequiredView.tsx` says "Open the App Store"**, and the expiry screen
  is the one piece of UI every expired install sees.
- **The Ko-fi gate implements an Apple rule.** `server/src/region.ts` hides the
  donate link outside the US storefront because guideline 3.1.1(a) permits
  external payment links only there. Google's policy is different, so this needs
  a *platform dimension*, not removal — and removing it on the reasoning that
  "it is an Apple rule" would break the iOS build's compliance.
- **No `eas.json`.** EAS was deferred until Android arrived, on the grounds that
  local `expo run:ios` was enough for one platform. Two platforms is the
  argument for it, and it has not been had.

## Smaller things found along the way

- **`setupIOSAudioManagement` is called unguarded in `app/index.ts`, and that is
  safe.** The SDK guards internally and returns a no-op off iOS. This was
  expected to be an import-time crash and is not; the guard beside it on
  `configureMuteMode` is needed because `AudioDeviceModule.setMuteMode` genuinely
  throws. Do not add a symmetrical guard on the assumption that the pair should
  match — they should not, and the reason is in the SDK rather than in this code.
- **The WebRTC config plugin's manifest is over-broad.** The generated manifest
  asks for `CAMERA`, `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE` and
  `BLUETOOTH` for an audio-only app. Harmless in development, a Play listing
  question later, and not worth trimming until there is a listing.
- **`DynamicColorIOS` throws on Android**, which `ui/theme.ts` and
  `appearance.ts` already guard, and the guarded path had never executed before
  this work. It executes correctly: Android renders the **light** palette,
  which is what `theme.ts` documents and intends. `appearance.ts` said the
  opposite — "the whole scheme there is the dark one" — and has been corrected.
  A guard whose comment describes the wrong behaviour is how somebody comes to
  "fix" the guard.
- **There were stale root-level `ios/` and `android/` directories**, from a
  `prebuild` run in the wrong working directory on 2026-08-31, carrying
  `com.anonymous.thefloor` and 1.2 GB of Pods. Deleted 2026-09-01. Both are
  gitignored by unanchored patterns, which is why they were invisible to
  `git status` and survived a fortnight.
- **`app/android/` is gitignored and regenerated**, like `app/ios/`. Nothing in
  it should be hand-edited; `app.json` is the source.

---

## What to do next, in order

1. **A channel between an Android device and an iPhone**, which is the first
   real test of whether the media layer is as portable as assumed. An emulator
   can do half of this; the half it cannot do is the half that matters.
2. **Real hardware for the four questions an emulator cannot answer** — echo,
   Bluetooth routing, mixing/focus, the interruption.
3. **Background audio**, and only then.

Push, and everything release-shaped, sit outside that sequence: none of them
blocks the next step, and each is a day of its own.

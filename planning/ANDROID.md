# Android

**Partly built, mostly not, and the split is the point of this file.** TASKS.md
§ *Build for Android* asked for two things — evaluate the relevant differences,
and establish a dev simulator on the Mac. Both were done on 2026-09-01, along
with the one piece of code that could not be deferred without shipping a known
defect — the audio session — and the foreground service followed on 2026-09-03,
once hardware had shown the defect it fixes. **Push followed on 2026-09-04**,
and is the first item here built entirely ahead of the thing it needs: it is
complete and inert until a Firebase project exists. Everything else this file
describes is unbuilt, and each item says what it would cost. When Android
ships, what survives moves to
`decisions/DECISIONS.md` and this file goes.

**Three of the sections below now describe built work rather than gaps**, and
each says so in its first line. Read the first line before the section.

It replaces BACKLOG.md § *Android has never been built or run*, whose factual
claims had gone stale — there is an `android/`, and a build has been attempted.

---

## What is true now

`bin/android` builds and installs the app on an emulator. `app/src/audio/`
configures the Android audio session, which it did not before. **`app/modules/
call-service/` keeps a channel alive off screen**, added 2026-09-03 and the
second piece of Android-aware code this app has. **Push exists end to end as of
2026-09-04** — `FcmPusher`, platform routing, three notification channels — and
sends nothing until somebody creates a Firebase project, by construction rather
than by omission. There is an upload key and a signed bundle; there is no Play
listing, no `eas.json`, no `bin/upload-android`, and **no Android build has ever
been in anybody's hands** — `bin/upload-ios` remains the only release path this
repository has.

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
a promise. On the emulator: the app builds, installs, launches, renders the
sign-in screen in the light palette, signs in, joins a channel, and connects to
LiveKit — Pixel 7 profile, API 36, arm64, `versionCode` 131.

And on a physical handset, 2026-09-01, from the sideloaded APK:

- **Two-party audio works.** An Android phone and an iPhone in one channel,
  audible both ways. This was the open question the whole port rested on —
  BACKLOG.md called it "the first real test of whether the media layer is as
  portable as assumed" — and the answer is that it is.
- **A call did not survive backgrounding.** Confirmed rather than suspected,
  which promoted the foreground service from a known gap to the next piece of
  work. **It was built on 2026-09-03 and has not been on a handset since** —
  see below, and treat the line above as the last measurement rather than as
  the current behaviour.

Still unheard, and not to be inferred from the above: **echo**, Bluetooth and
wired-headset routing, and what an incoming phone call does. A call being
audible both ways says nothing about any of them.

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

`bin/android --apk` produces a standalone APK to send, and leaves it on the
Desktop as `thefloor-<versionCode>.apk`. Gradle's own name is `app-release.apk`,
four directories deep in a gitignored tree, and is what every other Expo project
on the machine writes too; the number that would tell two of them apart is the
one the recipient quotes back at you. It prebuilds first when `app.json` has
changed since `android/` was generated from it, so the stale-configuration trap
above cannot reach an artifact that has left the machine — `APK_DEST` puts it
somewhere other than the Desktop.

**That check is a hash of the whole file, and comparing version numbers instead
is the version of it that looks sufficient and is not.** `versionCode` moves on
nearly every build, so a field-wise check fires when it matters — but only if
every `app.json` edit comes with a version bump, and the case where it does not
is the Android one. An Android-only change (an icon, a permission, a plugin
setting) has no reason to touch `ios.buildNumber`, `bin/upload-ios` is what
bumps the pair, and there is no reason to run it for a change iOS does not
have. So the versions match, the tree is stale, and the APK ships the old
configuration.

**Release, not debug**, and the distinction is the trap: a debug apk carries no
JavaScript — it fetches the bundle from Metro on the building machine at launch,
so to anybody else it is a blank or red screen with nothing naming the cause.

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

And one thing to ask whoever installs it: **background the app during a call
and say whether the audio survives.** It should now — the foreground service
landed 2026-09-03 — and nobody has watched it do so on a handset. Until
somebody has, that is the single most useful report a tester can make, in
either direction. They will see a notification reading *In a channel* for as
long as they are in one; that is the service, and it is what buys the process
its life rather than an announcement.

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

- **A web account-deletion path. Built 2026-09-01; the URL is
  `https://thefloor.rvanegas.co/delete-account`**, and that is what goes in the
  Data safety form. Google requires apps with accounts to offer deletion
  *without* the app, alongside the in-app route.

  **What was missing was a page, not a capability**, and the distinction shaped
  the work. `DELETE /me` is authenticated and reached from Settings — and the
  web app at `/app` is the same application, so a browser could already sign in
  with a mailed code and delete an account end to end. What did not exist was
  an address saying so, and `/privacy` actively misled by saying the account is
  "deleted from inside the application", which reads as mobile-only. So the new
  route is a document that points at the existing path; it carries no controls
  and destroys nothing.

  **A signed-out deletion endpoint was considered and rejected.** It would be a
  second way to destroy an account, keyed on an email address, with its own
  proof-of-address handling, sitting on the most destructive operation this
  server has. A requirement to publish a URL is not a requirement to build a
  new trust surface. `server/src/deletion.ts` carries the argument, and
  `delete-account.test.ts` asserts the page deletes nothing itself.

  **It is on the critical path to the first tester, not to the public
  listing** — this file said the latter for part of 2026-09-01 and it was
  wrong. The Data safety form asks for the URL, and Data safety must be
  complete before a release reaches *any* track, internal included. So it
  blocked handing the app to one person, which is the whole current goal.
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
- **`/privacy` is Apple-shaped, and one of the two places is fixed.** The
  notification-token sentence said the token is discarded "when Apple reports
  it as" dead; it now names the device's notification service instead, which is
  true today and stays true when there is a second one. **The other was
  deliberately left, and has since changed**: "Apple delivers notifications",
  under *Who else can see any of it*, was accurate for as long as it was the
  only path, and naming Google beside it would have been a claim about one that
  did not exist. That sentence was held to be part of shipping FCM rather than
  of preparing for it — and shipping happened on 2026-09-04, so it now reads
  "Apple and Google deliver notifications, each to their own phones."

#### What a tester will find missing

Worth stating before anybody installs from the track: **whether there are
notifications at all depends on how the build was made.** Built without
`app/google-services.json`, there are none — silently and by design, since the
plugin leaves Firebase out entirely and the app reports itself unregistered
exactly as a phone that refused permission would. Built with it, against a
server holding the service account, they work. Neither case is a bug report
worth having; what is worth asking a tester is which build they installed.

That sentence said "no notifications at all, because there is no FCM sender"
until 2026-09-04, and the sender is the half that stopped being true.

**The backgrounding defect was the other half of this paragraph until
2026-09-03**, and the foreground service that fixes it now exists. What is left
of it is a question rather than a gap: nobody has seen the service work on a
handset, so ask, and ask in the words they would otherwise use — *does the call
drop when you switch apps?*

One thing they will see that iOS testers do not: **a persistent notification
for as long as they are in a channel**. It is not optional and cannot be
dismissed; Android will not let a process capture audio off screen without one.

Two-party audio itself works, so what a tester is being asked to try is real.

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

## Push, which was the largest gap

**Built 2026-09-04, and inert until somebody creates a Firebase project.** This
section described a hole until that date; what is left is one credential and a
handset, and the shape of what was built is below because the decisions in it
are not recoverable from the diff.

The whole path exists: `FcmPusher` in `server/src/push.ts`, platform routing
through the fan-out, three notification channels on the client, and the build
wiring that turns itself on when `google-services.json` appears. With no
credential, an Android address is printed by `ConsolePusher` exactly as an iOS
one is without `APNS_KEY_PATH` — so every part of it except Google's own
acceptance is exercised by `npm test` today.

### What was decided, and why

- **A second sender rather than a transport abstraction.** `server/src/push.ts`
  said this would happen before it did: *"Android will arrive later as a second
  implementation rather than a rewrite of the callers."* `ApnsPusher` and
  `FcmPusher` share the `Pusher` interface and `PushMessage` and nothing else,
  because nothing else is genuinely shared — transport, authentication, message
  shape and the meaning of every failure code all differ.
- **Hand-rolled against FCM v1 with `fetch`, no `firebase-admin`.** The direct
  continuation of DECISIONS § *Direct APNs rather than Expo's push service*:
  the argument that declined a third party in the path of every notification
  declines a large dependency to compose one JSON object and sign one JWT.
  Node 24 has `fetch`, so the server still carries no push dependency at all.
- **Routing happens above `Pusher`, not inside it.** `DeviceAddress` carries
  `platform`, `app.ts` groups by `(platform, alert)`, and `createApp` takes an
  `androidPusher` beside `pusher`. A router hidden behind the interface would
  have made `MemoryPusher.sent` ambiguous about which service a notification
  reached, which is the one thing those assertions exist to pin down.
- **Three notification channels**, ids `passive` / `silent` / `audible`, from
  `ANDROID_CHANNEL_IDS` in `core/notifications.ts` so both ends read one table.
  This is the deepest divergence from iOS in the whole feature: **iOS decides
  loudness per message, Android per channel**, and a channel's importance is
  fixed when it is created and belongs to the user afterwards. So the three
  values were chosen once and changing one later means a new channel id and an
  orphan left in Settings.
- **`silent` is `DEFAULT` importance with the sound removed**, not `LOW`.
  `DEFAULT` alone makes a noise, which is the one thing `silent` promises not
  to do; `LOW` would be right about the noise and wrong about the banner, and
  `silent` on iOS is precisely a banner without a sound.
- **The cost of three channels, stated plainly:** they are three rows in
  Android's system settings, each of which a person can turn down *there*,
  independently of the per-channel level this app offers. The server cannot see
  that they have. iOS has one such switch; Android has four.

### The three traps, each of which fails silently

Worth naming separately because none of them produces an error anywhere, and
each cost a test to pin rather than a debugging session on a handset.

1. **`data` values are strings on FCM and booleans on APNs.** Google refuses a
   `data` block carrying a JSON boolean, so `reachesInApp` arrives as `"true"`.
   `app/src/push.ts` read it as `data?.reachesInApp === true`, which is `false`
   for every quoted value — so every Android notification would have looked
   like one that must not draw a banner, and a ping over an open app would
   silently never appear on one platform only. The reader now accepts both, and
   still equality-tests rather than truthiness, because `"false"` is truthy.
2. **`collapse_key` is not the whole of collapsing.** It discards messages
   still queued *at Google*; what replaces a notification already in the tray is
   `android.notification.tag`. APNs's single `apns-collapse-id` does both jobs,
   so parity needs both fields carrying the same value — and both omitted
   together, so a ping still collapses with nothing. Sent with only the first,
   presence stacks on the lock screen all evening while appearing to work.
3. **FCM's maximum `ttl` is four weeks; `PARTICIPATION_LIFETIME_MS` is thirty
   days.** Unclamped, *every invitation to an Android device is rejected* with
   `INVALID_ARGUMENT` — and rejected identically to a malformed token. The
   constant stays thirty days because that number is APNs-shaped and still right
   for Apple; the clamp is the Android transport's business.

And the trap that is not silent but is expensive: `INVALID_ARGUMENT` must
**not** prune the row. FCM returns it for a malformed *message* as well as a
malformed token, which means the TTL bug above would have deleted every Android
device in the database as its second act. `isDeadFcmToken` forgets a row on
`404 UNREGISTERED` and nothing else — same judgement as `isDeadToken`'s refusal
to prune on `BadDeviceToken`, and `403 SENDER_ID_MISMATCH` is its exact
counterpart: a good token from the wrong project.

### What has no Android counterpart

- **`threadId` is carried nowhere.** `AndroidNotification` has no `group` field
  in FCM v1, and Android's grouping is client-side and per channel — which
  cannot express `ASKING_THREAD`, since the notifications it gathers arrive on
  three different channels. Dropped deliberately rather than approximated.
- **`apns-topic` and `apns-push-type`** have nothing to map to: the app
  identity is carried by the token and by the Firebase project the service
  account belongs to.
- **No sandbox/production split.** One project serves debug and release builds,
  so the setting most likely to be wrong on iOS simply does not exist here.

### The build wiring, which could not be the documented way

`expo.android.googleServicesFile` in `app.json` is how this is normally done and
**would break every checkout that has no Firebase project** — Expo's mod throws
outright when the file it names is missing, so `expo prebuild` would fail rather
than build without push. `app/plugins/with-google-services.js` sets the key only
when `app/google-services.json` exists, and returns the config untouched
otherwise. Both branches are verified.

`bin/android`'s freshness stamp had to move with it: it hashed `app.json`, and
the file appearing changes the generated tree *without* changing `app.json`.
`config_hash` now covers both, so a machine that has just been given the
credential correctly sees a stale tree.

### What is left

1. **A Firebase project**, and the two files it yields — `google-services.json`
   into `app/`, the service-account JSON to `~/.config/thefloor/` and the box.
   See CREDENTIALS.md § *Firebase service account*.
2. **A handset.** Nothing below has been seen work, and a Mac cannot settle any
   of it. In the order they are likely to be what is wrong:
   - **That the notification appears at all** — the assumption a test cannot
     reach is that expo-notifications honours `channel_id` from the FCM
     `notification` block. If it does not, the message shape is what needs
     revisiting, not the channels.
   - The right channel, by turning one down in Settings and watching only that
     kind go quiet.
   - **A second arrival in one channel replaces the first** rather than
     stacking. This is the `tag` half, and is the one assertion the unit test
     cannot make.
   - Two pings both survive.
   - A ping while the app is foregrounded draws a banner — the string-versus-
     boolean fix, on real data rather than a fixture.
   - The tap-to-open-a-channel path, which is the only deep link into this app
     and has never once run on Android.
   - Uninstall, send again, and confirm the row is pruned on `UNREGISTERED`.
   - Point the server at the wrong project once and confirm `SENDER_ID_MISMATCH`
     prunes **nothing** — the one failure whose cost is data rather than
     delivery.

## Background audio, which was where the work genuinely diverged

**Built 2026-09-03, and unverified on hardware.** `app/modules/call-service/`
is a local Expo module — the second this project has, after
`modules/audio-route` — holding a foreground service typed `microphone` and two
functions to start and stop it. `useSessionAudio` starts it when this app
enters a channel and stops it when it leaves.

iOS's `UIBackgroundModes: ["audio"]` has no counterpart, and the shape of the
difference is worth keeping even now the code exists: on iOS the background
mode is a line in `Info.plist` and the system does the rest, where Android will
kill a process that captures audio with nothing visible on screen. So the
persistent notification is not a courtesy — it is what buys the process its
life, and it cannot be traded away.

Four things about it that are decisions rather than mechanics:

- **The service is scoped to the channel, not to the room**, which is why it is
  started by an effect keyed on `mediaRoom` alone rather than inside the
  connect effect. A reconnect bumps `generation` and rebuilds the room, and a
  reconnect is *precisely* when the app may be in the background — where
  Android refuses a foreground-service start. A service tied to the connection
  would therefore stop and fail to restart at the one moment it is needed.
  `__tests__/callService.test.tsx` pins that a rebuild does not cycle it, which
  is a regression no assertion about the audio state could catch.
- **The notification does not name the channel.** It is visible on the lock
  screen for as long as the channel is open, and iOS shows nothing equivalent —
  so a name there would be this app disclosing on one platform what it does not
  on the other, to whoever picks the phone up. The words live in
  `modules/call-service/index.ts` rather than in Kotlin, so that a reader of
  this app can find them.
- **`POST_NOTIFICATIONS` is declared, and since 2026-09-04 it is asked for.**
  From Android 13 an ungranted notification permission means the notification is
  *not shown* — the service still runs and the call still survives, so this was
  cosmetic rather than functional, but it left the user with a microphone
  running and nothing on screen saying why.

  This bullet said "declared and never requested" and predicted that asking
  would arrive with the push work. It did, and with **no code of its own**:
  `registerForPush` already called `requestPermissionsAsync` on a path that was
  never platform-gated, so the Android 13 runtime prompt appears the first time
  somebody signs in. The loose end closed by something else being built, which
  is the pleasant version of a dependency.

  One wart worth knowing rather than fixing: the prompt comes **before** the
  token is minted, so a build with no `google-services.json` behind it asks for
  notification permission and then quietly cannot register. Harmless, and the
  alternative — asking only after a token exists — would mean the foreground
  service's notification stays invisible on any build without Firebase, which is
  the worse of the two.
- **Everything answers `false` rather than throwing**, on the same contract
  `modules/audio-route` keeps: a channel with no service behind it still works
  for as long as the app is on screen, which is every case except the one this
  fixes. The start that genuinely fails is the one Android 14 refuses — a
  service started while the app is not foregrounded — and it is recorded in the
  audio log as `call service unavailable`, which is the only way to tell from
  inside the app.

Verified as far as a Mac can: it compiles, autolinks, and the merged manifest
carries the service and all three permissions. **That is not the same as
knowing a call survives the app switcher**, and the emulator cannot settle it
either, since what is being tested is the platform's willingness to keep a
process alive. It needs the handset.

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

1. ~~A channel between an Android device and an iPhone.~~ **Done 2026-09-01,
   and it worked** — audible both ways, which settles the question the port
   rested on.
2. ~~Background audio.~~ **Built 2026-09-03**, and it is the first item on the
   list below rather than off it: what was a defect is now an unverified fix.
3. **A handset, and four questions for it**, which is now one errand rather
   than several. The first is whether a backgrounded call actually survives —
   nothing short of hardware can say, since what is being tested is the
   platform's willingness to keep a process alive. The other three were already
   waiting and are unchanged: echo, Bluetooth and wired routing, and what an
   incoming phone call does. Echo is the one with a two-day precedent in
   planning/POSTMORTEM-echo.md.
4. **Audio focus** — whether an empty channel lets another app keep playing,
   which is `IDLE`'s whole purpose and has no `mixWithOthers` equivalent here.

Push, and everything release-shaped, sit outside that sequence: none of them
blocks the next step, and each is a day of its own. **Push is now the only one
of that kind a tester meets in the first ten minutes** — it and the foreground
service were the pair, and the service has been built.

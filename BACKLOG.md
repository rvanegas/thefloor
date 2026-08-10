# Backlog

Everything known and not done: work deliberately deferred, defects found and
left, behaviour nobody has tested, and the places where the spec was ambiguous
and the implementation had to choose.

Ordered roughly by size — the substantial pieces first, then individual
defects, then the reference material.

---

## Backgrounding: real failures, not currently reproducible

**Status:** investigated 2026-08-07 and 2026-08-08. The audio background mode
is confirmed working. The failures were real and are not reproducing. Nobody
has explained why.

### What was observed failing

On 2026-08-07, on a real iPhone: backgrounding the app dropped the phone from
the LiveKit room within seconds, it did not rejoin, and it did not recover on
returning to the foreground. On 2026-08-08 a foregrounded session dropped after
85 seconds with auto-lock disabled.

Each of those was seen once.

### What was confirmed working

On 2026-08-08, unplugged, on Wi-Fi, instrumented: **six minutes backgrounded
with no drop**, two of those minutes with the room silent. Across 854,000 lines
of device log there were zero suspensions and zero releases of the audio
assertion.

The app holds `com.apple.mediaexperience:MediaPlayback` from `audiomxd` — the
assertion the `audio` background mode exists to grant. **The audio session is
configured correctly.** That was the leading hypothesis for the whole problem
and it is wrong.

### What is not explained

Nothing in the app changed between the failing runs and the working ones. The
audio-session commit (c63726f, removing a duplicate owner) was already in place
during the 85-second foreground failure. The only changes after that were
server-side — the track egress fix and a restart — and neither touches the
phone's audio.

So the difference is unaccounted for. Candidates nobody has tested:

- **Network.** Both failures happened on the same Wi-Fi, but a transient is
  indistinguishable from a suspension in what we measured.
- **Accumulated app state.** The failing runs came after many
  background/foreground cycles; the working ones came after a fresh launch.
- **Coincidence.** Two observations is not a pattern.

### How to investigate when it recurs

The instrumentation is set up and works without a cable:

    idevicesyslog -n -u <udid> > capture.log

The device is paired for network access ("Show this iPhone when on Wi-Fi" in
Finder). `server/dev-guest.mjs --status` reads LiveKit room membership and
`server/dev-session.mjs` reads the server's own view; both are gitignored.

Useful greps once a drop is caught: `MediaPlayback` for the audio assertion,
`suspend` for the decision, and the app's bundle id for its lifecycle.

**Do not plug in the phone to investigate.** USB masked the failure entirely —
plugged in, nothing reproduced across several minutes in either state.

Three separate defects surfaced during this investigation and are worth fixing
on their own account — the socket-close eviction race, the missing websocket
heartbeat, and the stale audio status. They are listed under **Known defects**
below.

### The general lesson

Presence is derived from the app's websocket; participation is what happens in
the LiveKit room. These can disagree for a long time in either direction.
Presence probably ought to follow room membership — that is exactly "speaking
or hearing".

---

## Deployment

Deployed 2026-08-09 to **https://thefloor.rvanegas.co**.

`bin/deploy` syncs the server, reinstalls, restarts, and waits for health. It
runs the tests first and refuses to continue if they fail.

### What is where

| | |
| --- | --- |
| Instance | Lightsail `thefloor`, us-west-2a, Ubuntu 24.04, 2GB, $12/mo |
| Static IP | `44.241.121.49` |
| DNS | Namecheap, A record `thefloor` → that IP |
| TLS | Caddy, automatic Let's Encrypt, renews itself |
| Service | systemd `thefloor`, restarts on failure and on boot |
| Node | 22, required for the built-in `node:sqlite` |
| Database | `/home/ubuntu/thefloor-data/thefloor.db`, outside the synced tree |
| Logs | `journalctl -u thefloor` and `-u caddy` |

Node binds to loopback only; nothing reaches it except through Caddy.

### Credentials

Three, deliberately separate, so no single leak is worse than it has to be:

- **LiveKit** — media, held by the server.
- **`thefloor-egress`** — PutObject only, and it travels to LiveKit. It cannot
  read the bucket back, so a leak of the key a third party holds does not
  expose anyone's conversations.
- **`thefloor-server`** — `ses:SendEmail` on the rvanegas.co identity and
  `s3:GetObject` on the recordings bucket. Nothing else. Created for this
  deployment because Lightsail instances get no IAM role, so the default
  credential chain has nothing to find.

  It also needs the **configuration set** in its resource list, not only the
  identity. The rvanegas.co identity has `my-first-configuration-set` attached
  as its default, so SES applies it to every send and checks permission on it —
  which failed with a message naming a resource nothing in this codebase asks
  for. Worth knowing before scoping an SES policy anywhere else.

`server/.env` on the box holds all of it, mode 600, and is excluded from the
sync so a deploy cannot overwrite it.

### Known rough edges

- **A deploy drops every live session.** Sessions are in memory; see below.
- **The 380-day-uptime box is not this one.** dianoia runs on a separate
  instance and was deliberately left alone — it owns ports 80 and 443 there
  with its own nginx and certbot.
- **`tsx` runs TypeScript directly in production.** Fine at this scale and it
  keeps the cross-package `core/` imports working without a build step, but a
  compile step would start faster and use less memory if that ever matters.

---

## `prebuild --clean` drops the signing team

`expo prebuild --platform ios --clean` regenerates `ios/` from scratch, which
discards `DEVELOPMENT_TEAM` and leaves the next archive failing with "Signing
for TheFloor requires a development team".

Pass it explicitly until something better exists:

    xcodebuild ... DEVELOPMENT_TEAM=9946JKHZUJ CODE_SIGN_STYLE=Automatic

Note too that changing `expo.name` renames the whole native project. It became
`TheFloor` when the display name did, so the workspace, scheme and source
directory all moved from `thefloor` to `TheFloor`. Anything with those paths
hard-coded breaks silently, and the error names a missing scheme rather than
the rename that caused it.

---

## Shared audio playback during a session

**Status:** built and deployed to the server 2026-08-09. Raised the same day as
"can we play YouTube so both people hear it, audio only", and answered as
something narrower: a file the user supplies, played to both parties by the
server.

The client shipped to TestFlight pointed at `https://thefloor.rvanegas.co`.
TestFlight only — the app has not been submitted for App Store review.

### iOS build 2 did not start at all, and why

**Build 2 rendered a black screen for every tester.** It shipped without
`expo-document-picker`'s native module, because `bin/release-ios` ran
`expo prebuild` *without* `--clean` and prebuild reused the existing `ios/`,
never linking the newly added pod. `ExpoDocumentPicker` appeared nowhere in
`Podfile.lock`.

What turned a missing optional module into a dead app is the import graph.
`expo-document-picker` resolves its native module at module scope —
`requireNativeModule('ExpoDocumentPicker')`, with no optional variant — and
`App.tsx` → `SessionView` → `api/upload.ts` reached it at startup. So it threw
while the bundle was still evaluating: React never mounted, and the root view
showed the app's own background colour, `#0E1013`. It looked like a rendering
bug and was a linking failure.

Three things changed as a result:

- **`bin/release-ios` uses `--clean`.** Regenerating costs a couple of minutes;
  shipping an app that cannot launch costs a build and everyone's time.
- **It verifies linking before archiving**, comparing `Podfile.lock` against
  the autolinker's own list. The expected pods come from
  `expo-modules-autolinking resolve` rather than from guessing pod names off
  package names — `expo-status-bar` is JS-only and has no pod, so the naive
  mapping fails the release for a module that was never meant to be there.
- **The picker loads lazily** (`api/upload.ts`). Choosing a file is one
  feature, and failing to load it should cost that feature rather than the
  whole app, however well the linking is guarded.

The general lesson: a native dependency added to `package.json` is not a native
dependency in the build, and nothing between the two fails loudly. The gap is
only visible in `Podfile.lock`.

**Playback is confirmed working on a device** (2026-08-09, iOS build 3): a file
uploaded, both parties heard it, and the transport controls behaved.

**The recording half is still unverified.** No session has yet recorded while a
track was playing, so nothing has confirmed that a media stem is captured,
uploaded, and mixed into an export. The only recording in the database predates
the feature by fifteen hours. To test it, one session must start recording,
play something, claim the floor, then end — and the export checked for the
track and for the silenced speaker still being gated.

### It was choppy first, and why

The first device test played badly. The pump was paced on
`AudioSource.captureFrame` resolving when audio had played out, which it does
not do — it awaits the FFI acknowledgement that the native side took the
buffer, and the promise it keeps for playout is consumed by `waitForPlayout`
alone. So the loop ran at ffmpeg's decode speed, many times real time, and
overran the one-second native queue.

Pacing now comes from the wall clock, and the decoder pauses its pipe past a
high-water mark rather than accumulating a whole decoded track in memory —
which the pacing fix would otherwise have made considerably worse. Both are
pinned by tests.

The lesson worth keeping: **a promise resolving is not evidence of what it
waited for.** The plan for this feature asserted that `captureFrame` provided
backpressure, in bold, and built the pacing on it. Nothing checked until a
person listened.

Either party uploads an audio file; the server decodes it and publishes it into
the LiveKit room as a third participant, so both hear the same thing at the
same moment. It is included in the recording as its own stem.

### What the floor does to it, which is not what the note assumed

The original note asked "does a claim pause it? does it duck? does the silenced
party still hear it?" — all three framed around protecting a speaker from
competing sound. That framing was rejected on 2026-08-09.

> **A claim does not pause playback. It grants the claimant exclusive control
> of it.**

The purpose of the floor is to be in control of what is heard, not merely to be
heard. So a claim changes nothing about what the track is doing and everything
about who may change it: while someone holds the floor, only they may load,
play, pause, seek, re-level or remove it. While nobody holds it, either party
may.

This is also the cheaper design. It is one guard — `canControlPlayback` in
`core/session.ts`, derived from `floor.holder` rather than stored — where
pausing would have been coupled state transitions that every path moving the
floor had to drive correctly, including expiry and a holder dropping off.

### YouTube is still out, for the reasons already recorded

The YouTube API Services Terms require the embedded player to be visible and
unobscured, and prohibit separating audio from video; fetching the audio
server-side is a clearer violation again. Nothing here changes that. What was
built is the "audio the user already owns" option, which carries no third-party
terms at all.

### How it works

- **A pump per session** (`server/src/playback.ts`) produces a continuous
  stream of 10ms frames for as long as a track is loaded: decoded audio while
  playing, silence otherwise. `ffmpeg` decodes; `@livekit/rtc-node` publishes.
- **Seeking and resuming are the same operation** — both re-open the decoder at
  a position. Volume scales the samples in passing, so it lands on the next
  frame rather than after a respawn.
- **The recording gets the same frames**, tee'd into a second `ffmpeg` that
  encodes the stem live. What is stored is what was heard — the seeks, the
  pauses and the volume are in it because they are the same bytes, not because
  anything replayed them afterwards.
- **Alignment is the pump's job.** A track loaded partway through a recording
  has exactly that much silence prepended to its stem, so the export mixes it
  against the speakers' stems by plain concatenation. `server/src/export.ts`
  needed no change at all.
- **The media participant is not a speaker.** It never claims the floor, is
  never silenced, and carries no windows in the floor timeline.

### Decisions taken while building, worth knowing

- **The uploaded file lives on the server's local disk** for the session's
  lifetime and is deleted when it ends. No presigned URL, no new credential.
  Stems upload with the PutObject-only key LiveKit already has.
- **100 MB and an ffprobe check.** Duration comes from ffprobe rather than the
  client, because it drives the scrubber and the end-of-track transition.
- **One track at a time.** Loading another replaces it, and does *not* re-open
  the media participant — swapping the file mid-recording would otherwise break
  the stem in a way the export cannot express.
- **Default volume is 0.7** (`PLAYBACK_DEFAULT_VOLUME`), on the grounds that
  shared listening runs underneath a conversation rather than instead of one.

### The risk that was accepted deliberately

**Exports carry whatever was played.** This was chosen with the trade-off
stated: a conversation with a copyrighted track mixed into it is a different
thing to redistribute than a conversation. The media is a separate stem, so
excluding it is a change at encode time rather than a re-architecture — drop
the `media` key from `stems` in the export route and it is gone.

### Not done

- **No scrubber and no volume slider.** Seeking is ±15s buttons and volume is
  ±10% buttons, because a draggable control means `@react-native-community/
  slider`, a native module, and a rebuild. The state supports any position and
  any level; only the input is coarse.
- **Nothing has been run on a device.** The pump, the publisher and the live
  stem encoding are covered by tests against fakes and by integration tests
  against `MemoryMediaServer`, but no real audio has travelled through
  `@livekit/rtc-node` in this project. That is the first thing to do when this
  is picked up, and the most likely place for a surprise.
- **No back-pressure story if the decoder stalls.** A starved frame is
  published as silence, which keeps the clock honest but would sound like a
  dropout. Untested, since a local file decodes far faster than real time.
- **A second `@livekit/rtc-node`** now sits alongside `livekit-server-sdk`.
  Both are needed — the latter has no media plane — but it is a second native
  dependency on the deployment box, with `linux-x64-gnu` bindings.

---

## Names, which are three different things

- **`The Floor`** — what appears under the icon. `CFBundleDisplayName`, set in
  `app.json`. Nine characters, inside the dozen or so iOS shows before
  truncating.
- **`The Floor Uninterrupted`** — the App Store listing name, registered
  2026-08-09. Both `The Floor` and `TheFloor` were already taken; listing names
  are unique across the whole store, and this one never reaches a device.
- **`co.rvanegas.thefloor`** — the bundle identifier, which is permanent once
  registered and is what actually identifies the app to Apple.

Worth writing down because only the first is in the codebase. The other two live
in App Store Connect, and a future reader finding "The Floor" everywhere in the
repo has no way to know the store calls it something else.

---

## Before the first TestFlight build

Configuration decided 2026-08-09 and worth knowing the reasons for.

- **`supportsTablet` is now false.** Nothing in the layout adapts to a larger
  screen and nobody has opened it on an iPad. Claiming support invites App
  Review to test there, on a layout built for a phone. Turn it back on after
  actually looking at one.
- **`voip` removed from `UIBackgroundModes`.** It does nothing without PushKit,
  and reviewers have objected to apps declaring it unused. It becomes load
  bearing again if push notification is ever picked up.
- **`userInterfaceStyle` is `dark`,** matching the interface. It said `light`,
  which left system surfaces — alerts, the keyboard, the status bar — rendering
  pale against a `#0E1013` app.
- **`ITSAppUsesNonExemptEncryption: false`.** All traffic is HTTPS and WebRTC,
  which is the standard exemption. Declaring it stops App Store Connect asking
  on every single upload.
- **Icons are still the Expo defaults.** A build will upload, and every tester
  gets a generic square.

`buildNumber` must increase for each upload, even when the version does not.

---

## Live sessions do not survive a server restart

**Status:** known, not scheduled. Becomes urgent on deployment.

`SessionRegistry` holds live sessions in memory and writes only ended ones to
SQLite. Restarting the server therefore drops every conversation in progress:
participants keep their websockets briefly, then find the session gone.

The trade was deliberate. Sessions are short-lived by construction, and keeping
the tick loop in memory avoids writing to disk every 500ms. It costs nothing
while the server is restarted by hand between tests.

It stops being free once the server is deployed, because then a routine deploy
drops live calls. Two directions:

1. **Persist on transition.** Write the session row whenever the reducer
   produces a new state, and rehydrate on boot. Simple, and the write rate is
   bounded by how often people actually act — the 500ms tick only matters when
   it changes something.
2. **Drain before exit.** Refuse new sessions, wait for existing ones to end,
   then stop. Avoids persistence entirely but makes deploys slow and unbounded,
   since a session can legitimately run for hours.

The first is probably right.

Two things a rehydration would have to decide, neither obvious:

- **Presence.** A dropped socket is a leave, so on boot nobody is present and
  the empty-session timer would end every restored session within a minute
  unless clients reconnect first. Restoring `present` verbatim would be wrong
  for anyone who never comes back.
- **Recordings in flight.** Egress handles live in the same memory. A restart
  mid-recording orphans them: LiveKit keeps capturing, the server no longer
  knows the handle, and nothing ever calls `stopRecording`. That bills until
  the room closes and leaves a stem the recording row does not reference.

---

## Android has never been built or run

**Status:** not started. The spec asks for it; nothing has been done about it.

> React Native, targeting both iOS and Android from a single codebase.

`app.json` carries Android configuration from the scaffold, and the icons are
still Expo's defaults. There is no `android/` directory, no build has ever been
attempted, and no line of this has run on Android hardware or an emulator.

### What makes it more than a build step

Every hard problem in this project has been an iOS problem, and each was solved
against iOS's rules:

- **Background audio** was chased for two days through `UIBackgroundModes`,
  AVAudioSession ownership and CallKit. Android's foreground-service model is
  different in every particular, and the work does not transfer.
- **The audio session** is started explicitly through
  `@livekit/react-native`'s `AudioSession`, whose behaviour differs by
  platform — `AndroidAudioTypeOptions` exists precisely because the two need
  configuring differently.
- **Export** hands a file to `expo-sharing`, which resolves to a different
  system sheet with different expectations about file URIs.
- **The dev loop** is `expo run:ios` against a paired device. Nothing equivalent
  is set up, and EAS was deliberately deferred until Android arrived — which is
  now.

So this is not "flip a target and rebuild". Expect the platform-specific parts
to need doing twice, and expect the second time to surface assumptions the
first one baked in.

### Sequence when picked up

1. `npx expo prebuild --platform android`, and confirm the WebRTC and
   file-system config plugins produce a working build at all.
2. Get a session running between an Android device and an iPhone, which is the
   first real test of whether the media layer is as portable as assumed.
3. Only then background audio, where the work genuinely diverges.

---

## An invite cannot reach anyone whose app is closed

**Status:** deliberately deferred (decision, 2026-08-08). In-app only for now,
to keep the development loop short. Not a defect, and the spec stands as
written.

The spec is explicit (§Session Lifecycle):

> sends an **in-app live invite notification** to that contact — visible only
> if their app is open (foreground or backgrounded but running); there is no
> push notification / OS-level delivery to a closed app in this version.

That is implemented faithfully: the invite goes over the websocket and renders
as a banner on Home. If the app is not running, the socket does not exist and
nothing arrives.

### What it costs while deferred

Both parties must already have the app open for a session to begin, so testing
means arranging that by some other means. An empty session self-destructs after
a minute, so an initiator who starts one and waits gets nothing unless the
other party happens to be looking.

Worth knowing before showing this to anyone who has not been told: the first
thing a person does is check the lock screen, and finding nothing there reads
as the app being broken rather than as a deliberate scope decision.

### What it needs

- **APNs**, and a registry of device tokens per account.
- **A push on session creation**, to the invitee, deep-linking to the session.
- An **Apple Developer account** — already needed for TestFlight.
- For a genuinely call-like experience, **PushKit** to wake a closed app, which
  in turn requires **CallKit** — Apple requires a PushKit VoIP push to report an
  incoming call. Note CallKit was ruled out for background *audio* (see above);
  this is the other thing it is for, and here it would be the right tool.
- `voip` in `UIBackgroundModes`, currently declared and unused, becomes load
  bearing again if PushKit is adopted.

### When it is picked up

A plain APNs alert — a notification you tap to open the app into the session —
needs no CallKit or PushKit and covers most of the value. Full call semantics
(ringing, answering from the lock screen) is the larger version.

Nothing about the in-app path needs undoing to add either: the invite already
exists as a server-side event, and a push would be a second delivery of it.

---

## Two-party consent has not been reviewed

**Status:** unanswered. A gate on letting anyone outside this machine record.

The spec raises it and defers it (§Recording, Consent indicator):

> a visual indicator provides notice but may not by itself satisfy legal
> consent requirements in all jurisdictions with two-party consent laws for
> recorded calls — this should be reviewed against applicable law before
> shipping, independent of the in-app UI.

That review has not happened. It is a legal question rather than a code one, so
no amount of implementation settles it — but it constrains what may ship, and
it is cheaper to answer before there are recordings of other people than after.

### What exists today

- A persistent red dot and "Recording" label in the Session view, visible to
  both parties whenever capture is running.
- Either party may stop the recording at any time, except the silenced party
  during an active claim.
- A silenced speaker is told explicitly that they are still being captured.
- Recording is never automatic; someone has to start it.

So notice is given. Whether notice is *consent* is the open question, and in
several US states it is not.

### What makes it sharper than the spec anticipated

Capture is complete and continuous. A silenced speaker's audio is recorded in
full and stored as a stem; the floor is applied only when a recording is
encoded for export. That was a deliberate decision — the bucket is server-only
and stems never reach a client — but it means the system holds audio of someone
at a moment they were being prevented from being heard. Worth putting in front
of whoever reviews this, because it is not what "you are being recorded"
ordinarily implies.

### Likely shapes of an answer

- **Explicit consent at session start**, from both parties, before recording is
  offered at all.
- **Consent per recording**, with the other party able to refuse.
- **Restrict by jurisdiction**, which requires knowing where users are.
- **Do not record at all** in the first release.

Each has a real product cost, which is why this wants deciding before it is
built around rather than after.

---

## SMS authentication — shelved indefinitely

**Status:** shelved 2026-08-04. Not scheduled.

Sign-in by phone number. The spec (§Accounts & Contacts) says identity is
established "via phone number or email plus a one-time verification code". Only
the email half exists.

### What is already built

Nothing about the auth machinery is email-specific. The one-time code lifecycle
— issue, hash, ten-minute expiry, five-attempt limit, single use, one-minute
resend throttle — lives in `server/src/accounts.ts` and is transport-agnostic.
Delivery sits behind the `Mailer` interface in `server/src/mail.ts`.

### What SMS would take

1. A `SmsSender` implementation alongside `SesMailer` — AWS SNS or Twilio.
2. Routing in `POST /auth/request-code`, which currently rejects any
   non-email identifier with `sms_unavailable`. The branch point already
   exists (`isEmailAddress`), so this is a dispatch, not a redesign.
3. Phone number normalisation to E.164. Absent today, and it matters:
   `+1 555 000 0001` and `+15550000001` would otherwise be different accounts,
   and contact search is an exact string match.
4. **Regulatory registration, which is the actual reason this is shelved.**
   US A2P SMS requires a registered originating number (10DLC) with a
   registered brand and campaign. Days to weeks of someone else's process,
   plus per-message and per-registration cost. No amount of code shortens it.

### Consequences of shelving, which are live now

- **Sign-in is email-only.** Accounts are created at code verification, so no
  account can ever hold a phone identifier.
- **Contact search by phone number therefore always fails.** Not because the
  search is broken — `findByIdentifier` would match one fine — but because no
  such account can exist. The UI still invites a phone number, which is
  misleading and worth changing to say email.
- The spec's "phone number or email" should be read as aspirational until this
  is picked up.

### Related decision

`AUTH_DEV_BYPASS` was introduced because phone identifiers had no transport,
making sign-in impossible rather than merely insecure. That justification is
gone: every identifier the app now supports has real delivery, and local
development can read codes off the server console by leaving `MAIL_FROM` unset
(`ConsoleMailer`). The bypass has since been deleted outright (`d0ffab3`).

---

## Multiple auth per user — done

**Status:** complete as of 2026-08-09, both sides. The server enforces one
session per account, and the client catches up: `api/http.ts` turns any 401
into a sign-out via the `onSignedOut` listener, and `ws.ts` re-checks each
socket's token on the heartbeat sweep, closing revoked ones with 4401 — which
`api/socket.ts` treats as terminal. (Commit `12e35bc` fixed exactly the two
items below; they are kept for the reasoning.)

The server enforces one session per account as of 2026-08-09.
`issueToken` revokes every existing token for the account before minting a new
one, so signing in anywhere ends the session everywhere else. `Accounts.
revokeAllForAccount` is the operation behind it, and the only one that can
reach a session whose token you do not hold — signing out on the device in your
hand cannot revoke the one you lost.

That was the point. A token is good for ninety days, and nothing in the product
lists or cancels a session, so signing in elsewhere is the only signal
available that a device may have left the owner's hands. The accepted cost is
that a genuine second device signs the first one out.

### What the app still does badly with it

The server is right; the client has not caught up, and this is now reachable
rather than theoretical — any second sign-in produces it.

- **A revoked token is only noticed at launch.** `AppProvider` handles a 401
  when restoring a stored token, and nowhere else. Mid-session, a revoked
  device's next HTTP call surfaces the raw error instead of signing out.
- **An open websocket is never re-checked.** `ws.ts` authenticates once at
  connect, so the kicked device keeps its live conversation — microphone
  included — until something makes it reconnect.

Neither is dangerous: the revoked token cannot start anything new, and the
session it is still in was already one it was entitled to. But the experience
is a stale screen and a confusing error rather than "you signed in on another
device."

When picked up: treat a 401 from any call as a sign-out (`api/http.ts` is the
one place all of them pass through), and have the server close sockets whose
token has been revoked. Both need a TestFlight build to reach anyone.

---

## Multiple users in a session

**Status:** implemented 2026-08-09. Sessions hold up to six people
(`MAX_SESSION_PARTICIPANTS`); the roster is chosen at creation (`POST
/sessions` takes `contactIds`) and any participant may invite more mid-session
(the `INVITE` action — the invitee must be a contact of the *inviter* only). A
claim silences every other participant to every listener, the silenced from
each other included. Stems now carry a per-segment `startMs`, so someone who
joins mid-recording is placed at the right offset by the export; legacy plain
key lists still export by concatenation. The DB gained a `participants` JSON
column on `sessions` and `recordings`, backfilled from the legacy two-party
columns at open. Wire compat broke deliberately (`SessionView.participants`,
`RejoinableView.others` etc.); build 4 needs replacing alongside the server
deploy.

Deliberately deferred, as designed below: with four or more, everyone outside
the two most recent speakers ties at zero delay and races.

The design that was implemented:

The original note said the session does not display who you are speaking with.
It does — the other party's name is the largest thing on the screen — so that
step is done and the work is the rest.

### The eligibility rule, generalised

> **Whoever spoke longest ago may claim immediately. Everyone else waits ten
> seconds for each person who spoke longer ago than they did, up to twenty.**

Anyone who has never claimed counts as having spoken longest ago.

The invariant that shapes it: **someone must always be able to claim without
delay.** Since somebody is always last in that ordering, somebody is always at
zero, and the floor can never sit free and unclaimable. An earlier draft ranked
by the last two claims and gave 20s / 10s / 0s by class — which left two people
at 10s and 20s with nobody at zero, and so produced dead time.

What it yields:

| | |
| --- | --- |
| Two people, both eager | Gapless alternation — the original guarantee, intact |
| Three, all eager | Gapless rotation; the least-recent speaker is always free |
| Two eager, one quiet | The pair are held 10s and 20s while the quiet one is at zero |

That third row is the point. The gap is not a pause added for fairness; it is
the pair being held back while the person who has not spoken has the floor to
themselves, should they want it. If they do not take it, the pair resumes ten
seconds later and nothing is lost.

### Known limitation, deliberately deferred

**With four or more, everyone outside the two most recent speakers is at zero
together, so they race.** Whoever taps first wins. The rule bounds how often any
one person can hold the floor, but does not order the people waiting. To be
addressed as a later feature — noted here so it is not mistaken for an
oversight.

### What it costs in state

`floor.lastClaimant: UserId | null` becomes a timestamp per person —
`lastClaimedAt: Record<UserId, number>` — from which the ordering is derived, so
nothing needs maintaining separately. `FLOOR_SAME_USER_COOLDOWN_MS` is replaced
by a ten-second step with a twenty-second cap.

`SessionState.initiator` / `invitee` become a participant list, and
`otherParty`, `bothPresent` and the protocol's singular `other` all follow.
Recording already generalises: stems are per participant and the floor timeline
is per identity, so neither needs changing.

### Decided at implementation

- People are added at creation *and* during a session, by any participant.
- The maximum is six.
- A claim silences everyone else, present or not — and pairwise: two silenced
  people do not hear each other either, so the full matrix is N×(N−1)
  subscription statements per transition rather than one.

---

## Interaction with phonecalls

There ought to be a proper co-existence with phone calls and equivalents, modeled after the
functionality of Facetime and Zoom sessions.

---

## Known defects

Real, reproducible, and left alone. Resolved entries have been dropped — the
commits record them.

1. **"Audio connected" can be stale.** When the audio hook tears down, its
   cleanup cannot update state — the effect has already been cancelled — so the
   last status sticks and the screen asserts audio that is not there.
   `app/src/audio/useSessionAudio.ts`.
2. **The keyboard's submit key is labelled "Go" and sits in the corner.** The
   code field uses a number pad, which has no return key, so iOS floats a
   standalone key in the bottom-right — far from the fields, over empty space,
   reading "Go" while the button below says "Sign in". Either match the label or
   reconsider the number pad. `app/src/ui/components.tsx`.
3. **Timers derive from wall clock.** Every rule uses a caller-supplied `now`.
    The server is now the authority, which removed the device-drift problem, but
    a clock change on the server would still skew live countdowns. A monotonic
    source would be sounder.
4. **`bin/db` cannot show a JSON column.** `recordings.stems` and
    `floor_timeline` are JSON, and `-column` mode truncates them to the terminal
    width, so the values that matter most are the ones you cannot read. Working
    around it means `instr()` or `json_extract` in every query when you wanted
    to look at the value. A `--json` flag, or `.mode line` for wide results,
    would fix it. Noted 2026-08-09 while checking whether a media stem reached a
    recording. `bin/db`.
5. **`bin/db`'s remote one-shot has no busy timeout.** The interactive and local
    paths set `.timeout 2000`; the one that runs a single query over SSH does
    not, so it fails immediately against a locked database instead of waiting
    the way the others do. `bin/db`.

---

### Not a defect: requesting someone who already requested you

Considered and declined (decision, 2026-08-08). `requestContact` treats an
inbound pending request as an acceptance, so the pair goes straight to
`accepted` with no confirmation.

That reads intent correctly — requesting someone who has requested you is
consent to be their contact — and reaching it means walking past the obvious
affordance to find an obscure one: incoming requests sort to the top of the
contact list with Accept and Decline beside them, while this path requires
scrolling to Add Contact and typing their address instead.

The only cost is silence: the user learns of it by noticing the person is now
accepted. If it ever wants improving, the fix is a sentence rather than a rule
— "they had already requested you, so you are now contacts" — and not a change
to the model.

### Not a defect: recording has no maximum duration

Considered and declined (decision, 2026-08-08). A session with someone present
records until stopped, and nothing caps it.

Running away with it requires a phone left foregrounded and unattended — and
note that a screen lock does not reliably prevent this, since the app survived
five minutes backgrounded with its connection intact, and capture is
server-side egress that does not care what the phone is doing. It ends only
once the socket actually dies — now detected within about twelve seconds by the
heartbeat, then a minute of grace, then the empty-session minute. Before the
heartbeat existed that bound was theoretical: a half-open socket went unnoticed
for hours, so nothing was ever removed and a forgotten recording really could
run indefinitely.

Against a cap: the spec puts no bound on session length, and cutting off a long
conversation mid-sentence is a poor trade for an app whose premise is
protecting someone's speaking time. Both parties also see a persistent red dot
throughout, which is the answer the spec already gives to this question.

Worth knowing operationally rather than fixing in code: **egress is billed per
minute per stem, and per-speaker capture runs two**, so a recording costs twice
what a room mix would. Watch it on the LiveKit dashboard rather than in the
reducer.

## Untested behaviour

No assertions exist for these. Ordered by how likely they are to be wrong.

1. **Two time-driven transitions in one tick.** If a claim's 3:00 expiry and the
   empty-session 60s deadline fall in the same `TICK`, `reduce` handles floor
   expiry first, then the auto-end. Worth confirming that ordering is intended.
2. **A claim in the same instant the session auto-ends.** The guard checks
   `status === 'active'`, but the interleaving of a tap against the 500ms tick
   is untested.
3. **Chained alternation with early voluntary releases.** The alternation test
   only exercises full 3:00 turns. A releases at 0:30 → B claims → B releases at
   0:10 → can A claim? (Should be yes: B was the last claimant.)
4. **Both parties leave, one re-enters after 30s, then leaves again.** Does the
   empty timer restart cleanly from the second departure, or carry a stale
   `emptySince`? Believed correct, untested.
5. **Recording paused, then the other party claims.** Resume is deliberately
   unrestricted, so a silenced party can resume but not re-pause. Verify that is
   not a control that looks broken.
6. **Self-mute across leave and re-entry.** `selfMuted` is never reset on
   `LEAVE`, so someone who leaves muted returns muted. Probably right; the spec
   does not say.
7. **`END` dispatched twice**, or `LEAVE` after `END`. Should be inert — the
   reducer returns early on non-active sessions — but untested.

---

## Spec interpretations open to review

Places the spec was ambiguous and the implementation chose. Each is a candidate
for "actually, do the other thing."

1. **"Silenced" vs. "does not hold the floor"** (§Recording, control
   restriction). The spec equates them, but when nobody holds the floor neither
   party is silenced. Implemented per the clarifying sentence that follows:
   pause/stop are withheld **only** from the non-holder **during an active
   claim**. `canPauseOrStopRecording` in `core/recording.ts`.
2. **"After both users have connected"** (§Recording). Read as *ever* connected,
   not *currently* present, so a party left alone can still start a recording.
   Consistent with the spec's insistence that recording survives leaving.
   `everPresent` in `core/types.ts`.
3. **Resume carries no floor restriction.** The spec names only pause and stop.
   Resuming does not cut off the record, so a silenced party may resume.
   `canResumeRecording` in `core/session.ts`.
4. **Cooldown is strictly greater than one minute.** "More than one minute has
   elapsed" is `> 60_000`, so reclaiming at exactly 60.000s is refused. The
   off-by-one in the user's favour would be `>=`.
5. **The initiator is present from creation**, so the empty-session timer never
   runs before the first join. Matches "the initiator lands in the Session view
   immediately."
6. **The floor is cut at the listener, not the speaker.** The spec calls it "a
   hard cut at the transport/mic level". It still is — LiveKit stops forwarding
   those packets, so the audio never reaches the other device — but it is made
   by unsubscribing the listener rather than silencing the speaker. Acting on
   the speaker was tried twice and both ways broke them: a server cannot un-mute
   a track it muted, and revoking publish permission tears down iOS's audio
   unit. `setSilenced` in `server/src/media.ts`.
7. **Capture is not the privacy boundary; the export is.** Stems contain what a
   silenced speaker said, and the floor is applied when the recording is
   encoded. The bucket is server-only and stems never reach a client, so the two
   conditions that matter — not heard live, not heard in an export — both hold.

---

## Running the suite

From the repo root, across all three packages:

```bash
npm test           # core + app + server
npm run typecheck
```

Or one at a time: `npm test --prefix core`, `--prefix app`, `--prefix server`.

The per-behaviour table of which test covers what has been dropped: it
duplicated the suite and went stale faster than the code did. The tests are the
record.

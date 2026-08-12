# Backlog

Everything known and not done: work deliberately deferred, defects found and
left, behaviour nobody has tested. Every entry here is outstanding — if it has
shipped, it has moved to DECISIONS.md, and if it is about how to operate the
thing, it is in AGENTS.md.

Ordered roughly by size: the substantial pieces first, then individual defects.

Two neighbours worth knowing about. **FEATURES.md** holds wanted features that
nobody has designed yet, which is a different question from work that is
specified and pending. **DECISIONS.md** holds what was built and why, including
the choices that were considered and declined — several of which read like
missing features until you find the reasoning.

---

## Two things that ship unbounded, both from channels being permanent

Channels themselves survive a restart — `9761d72`, 2026-08-10 — and this entry
used to say the opposite for a day after that shipped, which is worth a moment
of distrust for anything else here that has not been re-read lately. What
follows is what is actually outstanding.

- **Home grows without limit.** `invitesFor` and `rejoinableFor` partition
  channels into "invited, never entered" and "everything else you belong to".
  Nothing ever removes a channel from the second list, so it accumulates every
  channel you have ever been in, for ever. Sorting by presence and recent
  activity is done; bounding the list is not — it wants archiving, or leaving,
  to be something a person can actually do.
- **The tick loop walks every channel ever created**, every 500ms, as do
  `invitesFor`, `rejoinableFor` and `channelsFor`. It wants an active set — the
  channels with a live floor claim, playing playback, an active recording or a
  pending disconnect — and lazy residency for the rest.

---

## Backgrounding: real failures, not currently reproducible

**Status:** investigated 2026-08-07 and 2026-08-08. The audio background mode
is confirmed working. The failures were real and are not reproducing. Nobody
has explained why.

### What was observed failing

On 2026-08-07, on a real iPhone: backgrounding the app dropped the phone from
the LiveKit room within seconds, it did not rejoin, and it did not recover on
returning to the foreground. On 2026-08-08 a foregrounded channel dropped after
85 seconds with auto-lock disabled.

Each of those was seen once.

### What was confirmed working

On 2026-08-08, unplugged, on Wi-Fi, instrumented: **six minutes backgrounded
with no drop**, two of those minutes with the room silent. Across 854,000 lines
of device log there were zero suspensions and zero releases of the audio
assertion.

The app holds `com.apple.mediaexperience:MediaPlayback` from `audiomxd` — the
assertion the `audio` background mode exists to grant. **The audio channel is
configured correctly.** That was the leading hypothesis for the whole problem
and it is wrong.

### What is not explained

Nothing in the app changed between the failing runs and the working ones. The
audio-channel commit (c63726f, removing a duplicate owner) was already in place
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
`server/dev-channel.mjs` reads the server's own view; both are gitignored.

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
- **The audio channel** is started explicitly through
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
2. Get a channel running between an Android device and an iPhone, which is the
   first real test of whether the media layer is as portable as assumed.
3. Only then background audio, where the work genuinely diverges.

---

## Notifications do not ring — they are alerts

**Status:** the alert shipped 2026-08-10 (see DECISIONS.md). This is what was
deliberately left out of it.

A notification arrives, sits on the lock screen, and opens the app into the
channel when tapped. What it does not do is behave like an incoming call:
there is no ringing, no answering from the lock screen, no full-screen incoming
UI, and nothing wakes the app before the tap.

### What the larger version needs

- **PushKit** to wake a closed app, which in turn requires **CallKit** — Apple
  requires a PushKit VoIP push to report an incoming call, and will terminate
  an app that takes one without doing so. Note CallKit was ruled out for
  background *audio* (see above); this is the other thing it is for, and here it
  would be the right tool.
- `voip` in `UIBackgroundModes`, removed before the first TestFlight build
  because it did nothing, becomes load bearing again.
- A second delivery path in `push.ts`: a VoIP push is a different `apns-push-type`
  against a different topic (`<bundle id>.voip`) and a different device token,
  so `Pusher` gains a method rather than a caller.

The alert covers most of the value and none of this is undone by adding it —
the same server-side events would drive both.

### Smaller things left on the table

- **Time Sensitive delivery.** `interruption-level: 'time-sensitive'` would let
  a notification break through a Focus mode, which suits a live conversation.
  It needs the `com.apple.developer.usernotifications.time-sensitive`
  entitlement, so it is a trip through the developer portal rather than a code
  change.
- **Nothing is notified but these two events.** A contact request, a request
  accepted, or somebody inviting you into a channel you are already a member of
  all still reach you in-app only.
- **Android has no delivery at all.** `device_tokens` carries a `platform`
  column and accepts `'android'`, but no FCM sender exists — see the Android
  section above, where this is one item among many.

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

- A persistent red dot and "Recording" label in the Channel view, visible to
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

- **Explicit consent at channel start**, from both parties, before recording is
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

## Per-speaker volume

**Status:** not started. Noted 2026-08-10.

A way to adjust each speaker's volume individually — manually, or automatically
by levelling the decibels so every participant lands at a comparable loudness.
People's microphones, distances and voices differ, and today the only remedy is
the device volume, which moves everyone at once.

Two shapes, not mutually exclusive:

- **Manual.** A per-participant level control, applied at the listener. The
  playback track already has exactly this (`setVolume` scaling samples in
  passing), so the precedent exists; the question is where speaker audio can be
  scaled — client-side per subscribed track is the likely place, since the
  server forwards packets rather than decoding them.
- **Automatic.** Normalise so all speakers sit at a similar level. That means
  measuring loudness per track and applying gain continuously — real DSP,
  either on each client or by putting the server into the media path it
  currently stays out of.

Manual is the smaller step and would likely be client-only. Note the recording
is unaffected either way if the gain is applied at the listener: stems capture
what was published, not what any one listener chose to hear.

---

## Interaction with phonecalls

There ought to be a proper co-existence with phone calls and equivalents, modeled after the
functionality of Facetime and Zoom channels.

---

## `HomeView.recordings` outlived its screen

The app shows recordings on the channel they were made in. The server still
sends the flat Home list, because build 20 and earlier render it and would
otherwise lose every recording at a deploy.

Once nobody is on 20, the field goes: `homeFor` stops calling `recordingsFor`,
and `RecordingView` leaves `HomeView` in `core/protocol.ts`. What must *not* go
with it is `recordingsFor` itself — the export endpoint's permission check
reads it, and it is the only thing that answers for a recording whose channel
ended under the old rule.

Home's "Recordings without a channel" section retires on its own: nothing can
enter that set.

---

## There is no output control, and no static configuration is right without one

Where a call comes out of is currently decided by one fixed AVAudioSession
configuration for everybody, and two device reports say that cannot work:

- Without `defaultToSpeaker` — the SDK's own recording configuration, which is
  what ships — a call with no accessory connected can land on the **receiver**.
  The symptom is audible only with the phone against your ear at full volume,
  and nothing on screen explains it. Observed on build 17.
- With `defaultToSpeaker` added, **Bluetooth headphones lose the route**: audio
  moves to the phone on the first unmute and stays there. Observed on build 18,
  which is why it came back out.

Neither is a configuration error. The correct output depends on what is
connected, and **nothing in this stack can see that**: `@livekit/react-native`
exposes only `selectAudioOutput('default' | 'force_speaker')`, which is a blind
`overrideOutputAudioPort` and overrides headphones too;
`react-native-webrtc`'s `enumerateDevices` returns the built-in microphone and
no outputs at all; neither package surfaces `AVAudioSession.currentRoute` or a
route-change event.

So this needs one of:

1. **A speaker button**, like every other call app has — an explicit override
   the user can correct, mapped to `selectAudioOutput`. Cheapest, and it makes
   the wrong route recoverable rather than merely explicable.
2. **A small native module** exposing the current route and
   `routeChangeNotification`, so the choice can be made properly: force the
   speaker only when the route would otherwise be the receiver, and re-decide
   whenever anything is plugged in or paired.

(1) is worth doing regardless. (2) is what makes the default correct.

Related: `videoChat` is documented as implying `allowBluetooth` and
`defaultToSpeaker` on its own, yet the receiver was observed under it. Whether
explicit `audioCategoryOptions` clear that implication, or `mixWithOthers`
suppresses it, was never established — it was worked around, not understood.

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

## Untested behaviour

No assertions exist for these. Ordered by how likely they are to be wrong.

1. **Two time-driven transitions in one tick.** If a claim's 3:00 expiry and the
   empty-channel 60s deadline fall in the same `TICK`, `reduce` handles floor
   expiry first, then the auto-end. Worth confirming that ordering is intended.
2. **A claim in the same instant the channel auto-ends.** The guard checks
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
   reducer returns early on non-active channels — but untested.

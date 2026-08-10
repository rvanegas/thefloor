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

## Channels do not survive a server restart — and now they promise to

**Status:** known, shipped anyway on 2026-08-10, deliberately. This is now the
largest gap in the product and the one to close first.

`ChannelRegistry` holds channels in memory and writes a row only when one ends.
Restarting the server therefore destroys every channel — its name, its
description, its roster, who had ever entered it. Recordings survive, because
they are rows of their own.

**What changed is the promise, not the mechanism.** When these were sessions,
losing one on restart cost a conversation in progress; sessions were
short-lived by construction and an empty one self-destructed in a minute, so
keeping the tick loop in memory to avoid writing every 500ms was a fair trade.
A channel is a permanent place. It sits on the home screen with a name somebody
chose and a description somebody wrote, it never expires, and the interface
gives every reason to expect it to be there tomorrow. So the same behaviour
that used to be a limitation is now the app breaking its word.

Every deploy triggers it. `bin/deploy` restarts the service.

### The way in, which is now easier than it was

**Persist on transition**: write the channel whenever the reducer produces a new
state, and rehydrate on boot. The write rate is bounded by how often people
actually act, since a tick that changes nothing produces no new state. Storing
the durable projection as one JSON blob beside a few queryable columns avoids a
migration every time a field is added.

Two objections used to make this awkward. One has evaporated:

- **Presence.** The old worry was that restoring with nobody present would let
  the empty-channel timer end every restored channel within a minute. That timer
  no longer exists, so `present: []` on boot is simply the truth, and an empty
  restored channel sitting there is now the correct behaviour rather than a
  problem to work around. Removing the auto-end is what made rehydration viable.
- **Recordings in flight.** Still real. Egress handles live in the same memory,
  so a restart mid-run orphans them: LiveKit keeps capturing, nothing calls
  `stopRecording`, and it bills until the room closes. The lever that does not
  need the handles is calling `closeRoom` for every unended channel at boot —
  nobody is present by construction, so the room holds only ghosts. Filing the
  `recordings` row when a run *starts* rather than when it ends would also let
  an interrupted run be recovered instead of lost.

### Two more things that ship unbounded

Both follow from channels being permanent and neither is fixed:

- **Home grows without limit.** `invitesFor` and `rejoinableFor` still partition
  channels into "invited, never entered" and "entered, then left". Nothing ever
  removes a channel from the second list, so it accumulates every channel you
  have ever stepped out of, for ever. The replacement is one persistent channel
  list, sorted by presence then recent activity.
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

## An invite cannot reach anyone whose app is closed

**Status:** deliberately deferred (decision, 2026-08-08). In-app only for now,
to keep the development loop short. Not a defect, and the spec stands as
written.

The spec is explicit (§Session Lifecycle — the spec predates the rename):

> sends an **in-app live invite notification** to that contact — visible only
> if their app is open (foreground or backgrounded but running); there is no
> push notification / OS-level delivery to a closed app in this version.

That is implemented faithfully: the invite goes over the websocket and renders
as a banner on Home. If the app is not running, the socket does not exist and
nothing arrives.

### What it costs while deferred

Both parties must already have the app open for a channel to begin, so testing
means arranging that by some other means. An empty channel self-destructs after
a minute, so an initiator who starts one and waits gets nothing unless the
other party happens to be looking.

Worth knowing before showing this to anyone who has not been told: the first
thing a person does is check the lock screen, and finding nothing there reads
as the app being broken rather than as a deliberate scope decision.

### What it needs

- **APNs**, and a registry of device tokens per account.
- **A push on channel creation**, to the invitee, deep-linking to the channel.
- An **Apple Developer account** — already needed for TestFlight.
- For a genuinely call-like experience, **PushKit** to wake a closed app, which
  in turn requires **CallKit** — Apple requires a PushKit VoIP push to report an
  incoming call. Note CallKit was ruled out for background *audio* (see above);
  this is the other thing it is for, and here it would be the right tool.
- `voip` in `UIBackgroundModes`, currently declared and unused, becomes load
  bearing again if PushKit is adopted.

### When it is picked up

A plain APNs alert — a notification you tap to open the app into the channel —
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

# Backlog

Everything known and not done: work deliberately deferred, defects found and
left, behaviour nobody has tested. Every entry here is outstanding — if it has
shipped, it has moved to DECISIONS.md, and if it is about how to operate the
thing, it is in AGENTS.md.

Ordered roughly by size: the substantial pieces first, then individual defects.

The neighbours worth knowing about. **TASKS.md** is the roadmap: features,
audits and open questions, at a paragraph each, which is a different question
from work that is specified and pending. One of them large enough to need a design gets a
file of its own, and that file is where it lives while it is being designed and
built, until it ships and whatever survives moves to DECISIONS.md.
**DECISIONS.md** holds what was built and why, including the choices that were
considered and declined — several of which read like missing features until you
find the reasoning.

---

## The watch party has been walked once, and the rest of the walk is outstanding

**Partly done as of 2026-08-23**, and the heading here used to read "Nobody has
watched anything", which stopped being true the first time somebody did. The
verdict was *mostly works*, and the one thing it found is recorded in
DECISIONS.md § *A watch party leaks into the channel through the microphone*
— not a defect but a property of the design, now said in the interface rather
than fixed, because no code can fix it.

What the first pass did **not** cover, and what is still outstanding: steps 2
through 6 below, and in particular step 1's ten minutes. Drift over time is the
thing `WATCH_DRIFT_MS` was chosen to buy and the only one a clock and a pair of
eyes can check. The reasoning for the feature is DECISIONS.md § *The Floor
carries no video, and that is the whole watch party*. Two phones in one
channel, a desktop browser open on each:

1. Paste a link, Start, Play. Both browsers should be within a second or two of
   each other, and **stay there for ten minutes without a visible correction** —
   which is the one thing `WATCH_DRIFT_MS` was chosen to buy and the one thing
   only a clock and a pair of eyes can check.
2. Seek from one phone; both browsers jump.
3. Claim the floor from one phone; the other phone's transport greys out and
   **the video keeps playing** — a claim confers control, it does not pause.
4. Record is greyed with its reason. Load an audio file: the party ends and the
   shared audio takes over.
5. Both step out; the party pauses. Step back in; it is still paused, where it
   was.
6. Restart the server; the party comes back paused at its position and both
   pages reconnect on their own.

7. **Paste a second link while the pages are open.** They should swap to it
   *stopped*, showing its title and staying that way until somebody presses
   Play. A burst of the new video before it settles means `cueVideoById` is
   not doing what its contract says, and the fix would be to hold the swap
   until the transport asks for it.
8. Copy the link from a follower page and check it is the URL as pasted. Then
   click the video itself: it may pause locally, and `follow()` should undo
   that within half a second — nothing should reach the other screens.

**Do it with headphones**, or the microphone bleed above dominates everything
else and you will be listening to that rather than to the drift.

**Steps 7 and 8 are unverified by anything.** The swap-in behaviour rests on
YouTube's documented distinction between `cueVideoById` and `loadVideoById`,
read rather than observed, and `getVideoData` — which supplies the title — is
not in YouTube's published method list at all, though it has been stable for
years and is what every player on the web uses for this. Both are guarded so
that failure is a blank line rather than a broken page, and both want one look
at a real player.

Two things are known-unknown rather than untested, and are worth watching for
during the walk. **Nobody has seen what a video whose embedding is disabled
does** — the page says "That video will not play here" and the channel does not
learn it, so the transport goes on saying playing while one screen shows an
error; whether that is tolerable or wants a `WATCH_FAILED` from the page is a
decision to make after seeing it. And **the gate is per page**: a follower who
has not tapped yet is a screen the transport believes is watching, which is
correct and may still read as a bug to whoever is looking at it.

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

## Presence follows the websocket, not the room

**Status:** not started. This is what survives the 2026-08 backgrounding
investigation, which is otherwise closed — see
DECISIONS-2026-08-07-to-2026-08-13.md for what that settled and how to
instrument a phone if it ever needs doing again.

Presence is derived from the app's websocket; participation is what happens in
the LiveKit room. These can disagree for a long time in either direction, and
every symptom that has come of it — a ghost showing as Present, a channel
invisible to somebody who is in it, a run of empty-to-occupied flaps that are a
network artefact — has been patched at its own site rather than at the cause.

Presence probably ought to follow room membership, which is exactly "speaking
or hearing". The work is not small: the five-minute push quiet window, the
disconnect grace, and the eviction path all read from the socket today.

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
  AVAudioSession ownership and CallKit (see
  DECISIONS-2026-08-07-to-2026-08-13.md). Android's
  foreground-service model is different in every particular, and the work does
  not transfer.
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

**Status:** the alert shipped 2026-08-10 (see
DECISIONS-2026-08-07-to-2026-08-13.md). This is what was deliberately left out
of it.

A notification arrives, sits on the lock screen, and opens the app into the
channel when tapped. What it does not do is behave like an incoming call:
there is no ringing, no answering from the lock screen, no full-screen incoming
UI, and nothing wakes the app before the tap.

### What the larger version needs

- **PushKit** to wake a closed app, which in turn requires **CallKit** — Apple
  requires a PushKit VoIP push to report an incoming call, and will terminate
  an app that takes one without doing so. Note CallKit was ruled out for
  background *audio* (see DECISIONS-2026-08-07-to-2026-08-13.md); this is the
  other thing it is for, and
  here it would be the right tool.
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

## Playing media into a channel is a copyright surface nobody has addressed

**Guideline 5.2.** Somebody can pick an audio file and play it to the room, and
a recording captures it — so a copyrighted track can be played, recorded, and
exported as a file. Nothing anywhere a user or a reviewer would see says a word
about it: not the listing, not the privacy page, not the app.

Raised before the first submission on 2026-08-14 and carried through it
unresolved; it survived review twice without being asked about, which is not the
same as being settled. It is probably a line in the review notes and a line on
the privacy page rather than anything built — but it should be a decision rather
than an omission, and the cheap version costs an afternoon while the version
Apple asks for under time pressure does not.

Its neighbour is above: two-party consent is the same shape of problem, about
who is recorded rather than about what is played.

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
   It needs both of `Mailer`'s messages, not just the code: since 2026-08-15 an
   invitation is a message rather than a row, so a transport that can carry a
   one-time code and not an invitation would sign somebody in and never be able
   to invite them.
2. Routing in `POST /auth/request-code`, which currently rejects any
   non-email identifier with `sms_unavailable`. The branch point already
   exists (`isEmailAddress`), so this is a dispatch, not a redesign.
   **And in `POST /contacts/request`**, which was widened to accept a phone
   shape and then narrowed back to `isEmailAddress` on 2026-08-15 for exactly
   this reason. `isPhoneNumber` and `isPlausibleIdentifier` are still in
   `mail.ts`, unreachable, waiting for this — see
   DECISIONS-2026-08-13-to-2026-08-15.md.
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
  such account can exist. Since 2026-08-15 the server refuses one outright
  rather than storing a request that could never resolve, and the app's field
  has said "Search by email address" throughout.
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
with it is `recordingsFor` itself — the export and playback endpoints both read
it, and it is the one place the access rule is written down.

---

## The output picker is on probation

`ChannelSettingsView` raises iOS's own route picker — an `AVRoutePickerView`
via `AudioSession.showAudioRoutePicker`, not a control of ours, because nothing
in this stack tells JavaScript what outputs exist.

It is there to make a wrong route recoverable by whoever is hearing it rather
than by a release, and **it is expected to be removed.** The default should be
right on its own: `defaultToSpeaker` gives the loudspeaker rather than the
earpiece and yields to anything connected. If nobody reaches for the picker
after a few weeks of real use, that is the evidence that the default works and
this should come out — decided by the author on the day it was added, so that
the removal is a plan rather than a regret.

What would argue for keeping it: people using it to move audio somewhere iOS
would not have chosen — a Bluetooth speaker across a room, a car, an AirPlay
receiver. That is a want the default cannot infer.

---

## Nobody has heard the `IDLE` → `LISTENING` edge on a device

Shipped 2026-08-16 with the "Other Audio Output" work, and this is the one part
of it that reasoning cannot settle. The session becomes exclusive by dropping
`mixWithOthers`, which reliably interrupts another app *when the session is
activated*. That edge does not activate anything: it changes category options
on a session that is already active, because a track arrived. iOS does not
document whether that interrupts.

So the thing to listen for is music playing on through somebody starting to
talk — while an empty channel still leaves it alone, which is the half that is
certainly right. **The fallback is written down and deliberately not adopted
yet**: bracket that one edge with `stopAudioSession()` then
`startAudioSession()`, which costs a brief gap in playout and is safe there
because the microphone is closed. See `DECISIONS.md`, "The audio session has
three states".

Also unconfirmed on hardware, and cheap to check at the same time: that a
Bluetooth route survives the microphone opening and closing, which is the
ground `POSTMORTEM-echo.md` was fought on.

---

## Donations arrive by webhook alone, and nothing reconciles them

`POST /donations/kofi` is the only writer to the `donations` table. **Ko-fi has no
read API**, so there is no way to ask what we missed: a delivery that did not
land — because the server was restarting, or because their retry gave up — is
gone from here and exists only in their dashboard. **Ko-fi's dashboard is the
authoritative record; this database is a convenience copy**, and anyone
comparing the two should start from that rather than discovering it.

Two gaps, and one tool closes both:

- **Donations paid from an address nobody signed in with.** Attribution is by
  matching the payer's address against `accounts.identifier`, and Ko-fi's link
  carries no field to put an account id in. A donation from somebody's work
  address lands with `account_id` and `matched_by` null. This is the *expected*
  case rather than a failure — deliberately, since the alternative was guessing
  from who last opened the app, which credits the wrong person undetectably
  (see DECISIONS-2026-08-13-to-2026-08-15.md).
- **Deliveries missed entirely.** Rare enough not to engineer against on its
  own: the window is the few seconds of a deploy's restart, which at any
  plausible rate of donations and deploys is a fraction of a percent. It was
  investigated on 2026-08-14 and deliberately left, because the tool below
  covers it anyway and Ko-fi's retry policy could not be established — their
  documentation refuses automated fetching, and the empirical test costs real
  downtime.

**`bin/import-donations <file.csv>`**, reading a Ko-fi export: dry run by
default, `--commit` to write, reporting new / already-present / unmatched. The
schema is already shaped for it — `matched_by` takes `'manual'`, `raw` is
nullable precisely so a row from a dashboard does not have to invent a payload,
and `kofi_transaction_id` is the primary key so re-importing the same file twice
is a no-op. If the export carries no transaction id, a stable key hashed from
timestamp + address + amount is re-import-safe, at the cost of collapsing two
identical donations in the same second.

Deferred on 2026-08-14 for the reason it should be: **there is no real export to
write the parser against**, and guessing at a third party's column names is how
you get a parser that passes its own tests and fails on the first real file.
`bin/` rather than a route, because an admin endpoint would be a new kind of
privileged surface in a server that has none, for a job done a few times a year.

---

## Inviting a stranger now sends mail, and nothing bounds how much

Built 2026-08-15 — see DECISIONS-2026-08-13-to-2026-08-15.md.
`POST /contacts/request` sends an email to
any address that has no account, and two things about it are outstanding.

- **`INSTALL_URL` in `server/src/mail.ts` is null.** The invitation says the app
  is not on the App Store yet instead of carrying a link, which is true today
  and stops being true on the day of the first release. **Set it in the same
  change that moves `released`** — an invitation telling somebody to wait for an
  app they could already install is the one failure that gets worse the longer
  it goes unnoticed, because nothing about it looks broken.
- **There is no rate limit on invitations.** `/auth/request-code` has
  `OTP_RESEND_INTERVAL_MS` because issuing sends real mail; this route has only
  a duplicate check, which stops a second invitation to the *same* address from
  the same sender and nothing else. One authenticated account can therefore mail
  an arbitrary number of distinct strangers, billed to this SES identity and
  attributable to this domain's sending reputation. Not urgent at seven
  accounts, all known to the author. It becomes urgent the moment sign-up is
  open to anybody, which is before the first release rather than after it.
  A per-requester budget over a rolling window is the shape; the sweep in
  `Accounts` is where the bookkeeping would live.

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
6. **`closeRoom` fails for every revived channel at boot.** A batch of
    `twirp error unknown: requested room does not exist` at `level: 50`, once
    per restart — 103 in the week to 2026-08-14, dating back to 2026-08-09.

    `restore()` revives channels from their state blobs and tries to tear down
    the media room each one had, but rooms do not survive a LiveKit restart and
    an ended channel's room is already gone. So the server asks the media plane
    to close something that is not there, and logs an error at the severity
    reserved for things that are wrong.

    Nothing breaks: closing an absent room is the state that was wanted. The
    cost is that a restart writes several stack traces that look like a fault
    and are not, which is exactly the noise that makes a real fault at boot easy
    to miss — the same complaint as the `assertSilence` flood that was fixed on
    2026-08-14, and the same shape of fix. A 404 from `deleteRoom` means
    *already closed* and should be swallowed rather than raised.
    `server/src/media.ts`.

    Noted 2026-08-14 while verifying the donations deploy, where it was briefly
    mistaken for a regression caused by that deploy. It is not related to it.
7. **The sweep may not be able to delete anything, and would not say so.**
    `S3RecordingStore.delete` uses the server's own credential chain, and
    planning/CREDENTIALS.md says `thefloor-server` holds `ses:SendEmail` and
    `s3:GetObject` on the bucket, "nothing else" — so `DeleteObject` is denied.
    The rejection is swallowed deliberately (a sweep must not become an
    unhandled rejection), but nothing distinguishes swallowed-because-retryable
    from swallowed-because-forbidden: `sweepDeleted` counts the objects as
    emptied and deletes the row, which is the one order the code goes to
    lengths to avoid, leaving audio in the bucket that no row can identify.

    Unverified against production — the policy might have been widened without
    the document following, and the retention window means little has been due
    for sweeping. Establish which it is before changing anything: either the
    policy needs `s3:DeleteObject`, or `delete` needs to report a permission
    failure rather than absorb it. Noted 2026-08-16 while adding the mix to the
    keys the sweep removes, which is a third kind of object now depending on
    this working. `server/src/storage.ts`, `server/src/channels.ts`.

8. **`media.ts` builds a fresh `S3Client` on every `stopCapture`.** The
    playback stem is stored with a client constructed per call, from the same
    credentials `RecordingStore.put` now holds a long-lived client for. One
    write path would do, and the store is the one that should own it — the
    credentials bundle has to stay in `media.ts` regardless, because LiveKit is
    *given* the key with each egress request and cannot be handed a store.
    Noted 2026-08-16. `server/src/media.ts`.

9. **A channel action that never lands says nothing, and the screen believes it
    anyway.** `app.act` is fire-and-forget: `socket.send` queues a
    `channel.action` taken while the socket is down, but only for
    `QUEUE_TTL_MS` (10s) and 32 deep, and drops it silently past either — and a
    *refused* action is answered with a snapshot and no error, so there is
    nothing to catch even when the send succeeded. `ChannelSettingsView.persist`
    then records `saved.current.name` immediately after dispatching,
    unconditionally, so the screen's own record says the write happened whether
    or not it did, and `done()` leaves regardless. The comment at
    `app/src/api/socket.ts:88` names this shape as the worst a bug can take —
    the queue narrows the window rather than closing it. Compare
    `HomeSettingsView`, whose write is an awaited HTTP call: it reports the
    failure and declines to close. Softened by the channel screen rendering the
    name from the server snapshot, so a lost `SET_NAME` shows as the old name
    still being there — visible, but unexplained, and indistinguishable from
    having mistyped. The full fix is an acknowledgement for `channel.action`,
    which is a wire change and needs the two-step deploy; stopping the premature
    `saved.current` is smaller and independent. Noted 2026-08-17, from asking why
    only one of the two settings screens has a "Saving…" state.
    `app/src/ui/ChannelSettingsView.tsx`, `app/src/api/socket.ts`.

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
6. **Self-mute across leave and re-entry.** *Closed 2026-08-21.* The spec still
   does not say, so it was decided: every departure clears it, in `stepOut`
   itself rather than case by case, and `connectivity.test.ts` now asserts both
   that and the half that did not change — a mute survives a reconnection
   inside the grace period. DECISIONS.md § *Every departure clears the
   self-mute, and the microphone is not the reason why*.
7. **`END` dispatched twice**, or `LEAVE` after `END`. Should be inert — the
   reducer returns early on non-active channels — but untested.

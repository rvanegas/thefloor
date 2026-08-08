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

## Multiple auth per user

Signing in as a user who is already signed in elsewhere, should sign the user out of other location.

---

## Multiple Users

Currently sessions allow for only two speakers. Let us plan to expand to this to multiple users.

To begin with, the session does not even currently display who one is speaking with. Let's begin by displaying this.

Then, the logic of claiming the floor must be generalized to multiple users.

---

## Interaction with phonecalls

There ought to be a proper co-existence with phone calls and equivalents, modeled after the
functionality of Facetime and Zoom sessions.

---

## Known defects

Real, reproducible, and left alone. Resolved entries have been dropped — the
commits record them.

1. **A closing connection can evict a user who has already reconnected.** The
   server treats every socket close as authoritative without checking whether
   that connection is still the user's current one. On foregrounding, the client
   reconnected and re-entered, then the stale socket's close fired `LEAVE` and
   removed them — leaving the phone in a session it was not in.
   `server/src/ws.ts`.
2. **No heartbeat on the app's websocket.** A half-open socket goes unnoticed
   indefinitely: the server reported a phone present for a full thirty seconds
   while it could neither speak nor hear. Both ends should notice a dead
   connection in seconds.
3. **"Audio connected" can be stale.** When the audio hook tears down, its
   cleanup cannot update state — the effect has already been cancelled — so the
   last status sticks and the screen asserts audio that is not there.
   `app/src/audio/useSessionAudio.ts`.
4. **Dismissed invites resurrect.** The dismissed list is local `useState`, so
   navigating away and back re-shows a banner the user dismissed. The spec calls
   the banner "dismissable... persistent until acted on", which implies the
   dismissal should outlive a remount. `app/src/ui/HomeView.tsx:33`.
5. **Recording has no maximum duration.** A session with someone present records
   until stopped. One unattended session ran 37 minutes straight to egress
   minutes. Worth a cap, or a warning.
6. **A failed capture is invisible to the user.** When egress fails to start,
   the session still shows "Recording" and counts up. That is exactly the
   misrepresentation the indicator exists to prevent, and it hid a completely
   broken capture path for hours. The failure reaches the server log and nothing
   else.
7. **Contact search gives no useful feedback.** `findByIdentifier` matches the
   whole string, case-insensitively — deliberately, since prefix search would
   let anyone enumerate strangers — but a typo is indistinguishable from no such
   user. `server/src/accounts.ts`.
8. **Requesting someone who already requested you silently accepts.**
   `requestContact` treats an inbound pending request as an acceptance rather
   than erroring, so the pair goes straight to `accepted` with no confirmation.
   Reasonable, but silent. `server/src/accounts.ts`.
9. **The keyboard's submit key is labelled "Go" and sits in the corner.** The
   code field uses a number pad, which has no return key, so iOS floats a
   standalone key in the bottom-right — far from the fields, over empty space,
   reading "Go" while the button below says "Sign in". Either match the label or
   reconsider the number pad. `app/src/ui/components.tsx`.
10. **Timers derive from wall clock.** Every rule uses a caller-supplied `now`.
    The server is now the authority, which removed the device-drift problem, but
    a clock change on the server would still skew live countdowns. A monotonic
    source would be sounder.

---

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

# Backlog

Work deliberately not being done, with enough context to pick it up cold.
Distinct from `EDGECASES.md`, which tracks defects and untested behaviour in
what *has* been built.

---

## A call does not survive backgrounding the app

**Status:** measured on a real device 2026-08-07. Not started. The largest gap
between this and an ordinary VoIP app.

### What happens

Background the app on an iPhone mid-session and the phone leaves the LiveKit
room within seconds. It does not rejoin on its own, and did not recover even
after returning to the foreground. Zoom and FaceTime keep a call running in the
background; this does not.

Measured with `server/dev-session.mjs` and `server/dev-guest.mjs` (both
gitignored) against a real iPhone, not a simulator.

### What is already configured

- `UIBackgroundModes: ["audio", "voip"]` in `app.json`.
- `registerGlobals()` installs LiveKit's automatic iOS audio-session management
  by default, which configures and activates the AVAudioSession natively as the
  audio engine changes state.
- `useSessionAudio` calls `AudioSession.startAudioSession()` before connecting.

So the obvious configuration is present, and it is not enough.

### What was ruled out

That iOS suspended the app for want of anything to play. The phone was
publishing its own microphone at the time — capturing requires an active audio
session, and the `audio` background mode covers recording as much as playback.
The counterpart being a silent simulator was therefore irrelevant.

### Ruled out: CallKit

The obvious guess, and wrong. Zoom and Clubhouse both keep audio running in the
background and neither appears in the system call list or Recents — so neither
is using CallKit for it. CallKit is for apps that want to *be* the phone:
incoming call UI, Do Not Disturb integration, Recents. It would have been an
expensive detour with a visible change in behaviour, and it would not have
addressed the cause.

The plain `audio` background mode is sufficient for this. Something about our
audio session is not satisfying it.

### Attempted: removing the duplicate audio session owner (2026-08-08)

`registerGlobals()` installs LiveKit's automatic management, which its own
documentation says configures and activates the session natively as the audio
engine changes state — and `useSessionAudio` was calling
`AudioSession.startAudioSession()` and `stopAudioSession()` by hand as well.
Two owners of one AVAudioSession, with `deactivateOnStop` defaulting to true.
The manual calls are gone.

**It helped, and it is not the cause.** Measured on a real device:

| | Before | After |
| --- | --- | --- |
| Survives backgrounding | seconds | roughly 30-60s |
| Websocket close | half-open, unnoticed | clean, `LEAVE` fires |
| Recovers on foreground | never — stayed stranded | fully, audio returns |

Worth keeping: one owner is correct regardless, and it fixed the stranding.
But the call still does not persist, which was the goal.

### What the timing suggests

An app with no valid background mode gets roughly thirty seconds of grace
before iOS suspends it. Surviving about that long and then dying is the
signature of *not* being recognised as playing audio — were the `audio`
background mode being honoured, it would run indefinitely rather than expiring
on schedule.

So the session is very likely not in a state that qualifies: wrong category,
or not active at the moment iOS checks.

### Next

**Instrument, do not guess.** Console.app on the Mac, filtered to the device,
during a background transition — it reports the AVAudioSession category and
active state, and why the process was suspended. Two attempts have now been
spent on plausible-sounding causes; the measurement is cheaper than a third.

Only if that is inconclusive: pass an explicit `IOSAudioSessionPolicy` with
`playAndRecord` to `setupIOSAudioManagement`, rather than trusting the default
to land there.

Every attempt needs a rebuild and a real device; a simulator establishes
nothing here.

### Downstream defects, worth fixing regardless

These surfaced while investigating and are real on their own:

1. **A closing connection can evict a user who has already reconnected.** The
   server treats every socket close as authoritative without checking whether
   that connection is still the user's current one. On foregrounding, the
   client reconnected and re-entered, then the stale socket's close fired
   `LEAVE` and removed them. This is what stranded the phone in a session it
   was not in.
2. **No heartbeat on the app's websocket.** A half-open socket goes unnoticed
   indefinitely. The server reported the phone present for a full thirty
   seconds while it could neither speak nor hear, and only noticed when the OS
   finally tore the socket down.
3. **"Audio connected" can be stale.** When the audio hook tears down, its
   cleanup cannot update state because the effect has already been cancelled,
   so the last status sticks. The screen asserted audio that was not there.

### The general lesson

Presence is derived from the app's websocket, and participation is what happens
in the LiveKit room. Tonight showed those two can disagree for a long time in
either direction. Whatever fixes the background case, presence probably ought
to follow room membership — that is exactly "speaking or hearing".

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

The first is probably right. Note that presence is now explicit — a dropped
socket no longer removes anyone — so a rehydrated session would also need to
decide what to do about participants whose clients never come back.

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
(`ConsoleMailer`). The bypass should be deleted rather than left switched off —
see gap #7 in `EDGECASES.md`.

### Multiple auth per user

Signing in as a user who is already signed in elsewhere, should sign the user out of other location.

### Multiple Users

Currently sessions allow for only two speakers. Let us plan to expand to this to multiple users.

To begin with, the session does not even currently display who one is speaking with. Let's begin by displaying this.

Then, the logic of claiming the floor must be generalized to multiple users.



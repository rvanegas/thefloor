# Backlog

Work deliberately not being done, with enough context to pick it up cold.
Distinct from `EDGECASES.md`, which tracks defects and untested behaviour in
what *has* been built.

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

### Downstream defects, worth fixing regardless

These surfaced while investigating and are real on their own:

1. **A closing connection can evict a user who has already reconnected.** The
   server treats every socket close as authoritative without checking whether
   that connection is still the user's current one. On foregrounding, the
   client reconnected and re-entered, then the stale socket's close fired
   `LEAVE` and removed them.
2. **No heartbeat on the app's websocket.** A half-open socket goes unnoticed
   indefinitely. The server reported the phone present for a full thirty
   seconds while it could neither speak nor hear.
3. **"Audio connected" can be stale.** When the audio hook tears down, its
   cleanup cannot update state because the effect has already been cancelled,
   so the last status sticks.

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



# Backlog

Work deliberately not being done, with enough context to pick it up cold.
Distinct from `EDGECASES.md`, which tracks defects and untested behaviour in
what *has* been built.

---

## Per-track recording with the floor applied at mix time

**Status:** designed 2026-08-07, not started. Next substantial piece of work.

### Why

The floor is enforced live by unsubscribing the other party from the silenced
speaker's track (see `setSilenced` in `server/src/media.ts`). That leaves the
silenced person still publishing — their audio pipeline is deliberately never
disturbed, which is the whole point of the approach — so a room-composite
recording, which subscribes to everyone, captures speech that nobody was
allowed to hear.

Being silenced has to mean not being on the record either: someone cut off
mid-sentence should not find their words in an exported recording.

Scoped deliberately (decision, 2026-08-07): the raw stems live in a bucket only
the server can read, so it is acceptable for them to contain silenced speech.
The omission has to happen before anything is handed to a user — at export.
That is what makes continuous capture viable instead of stopping and restarting
a stem at every floor transition.

**Until this lands, exported recordings cannot be trusted to exclude silenced
audio.**

### Design

1. **Capture per participant, not per room.** Replace
   `startRoomCompositeEgress` with one track egress per participant. Because
   subscription-based enforcement never unpublishes anyone, track SIDs are
   stable for the life of the session — so each stem can run continuously
   rather than being restarted at every floor transition.
2. **Record the floor timeline** alongside the recording: who was silenced,
   from when to when. A JSON column, as `segment_keys` already is. The session
   reducer already knows this; it simply is not persisted.
3. **Mix at export**, gating each stem to silence across its silenced windows.
   The exclusion is then provable — the audio is never mixed in — rather than
   depending on the media server honouring a subscription change.

Pause and resume keep segmenting as they do now; this is orthogonal.

### Consequences

- Export stops being concatenation and becomes a real mixing job: ffmpeg with
  per-stem volume envelopes. Export is unbuilt, so this is work that was coming
  regardless, but it is meaningfully more than joining files.
- Storage roughly doubles — two stems rather than one mix. Negligible at this
  scale.
- Per-speaker stems become available, which is generally useful.

### Origin

Proposed by the user as an alternative to unsubscribing the egress participant
from the silenced track. It is the better design: it does not depend on egress
honouring subscription updates, which is unverified and outside our control.

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

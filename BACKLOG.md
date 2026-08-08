# Backlog

Work deliberately not being done, with enough context to pick it up cold.
Distinct from `EDGECASES.md`, which tracks defects and untested behaviour in
what *has* been built.

---

## Per-speaker stems, with the floor applied when the recording is encoded

**Status:** capture and timeline landed 2026-08-07. The encoder remains.

### Why

The floor is enforced live by unsubscribing the listener from the silenced
speaker (`setSilenced` in `server/src/media.ts`), which deliberately leaves the
silenced person publishing. Capture is currently room-composite: LiveKit blends
both participants into one file before it reaches S3, so a recording contains
speech nobody was permitted to hear — and a mix cannot be un-mixed afterwards.

**Until this lands, exported recordings do not honour the floor.**

### What actually has to be true

Two conditions, and only these two (decision, 2026-08-07):

1. **Live** — a silenced speaker is not heard by the other party. Already done.
2. **Playback** — a silenced speaker is not heard in an exported recording.

What sits in S3 in between is not a constraint. The bucket is server-only,
stems are never exposed to a client, and the exclusion is a property of the
encode rather than of the capture. Earlier drafts of this note treated capture
as the privacy boundary and proposed stopping a stem for the duration of a
claim; that is unnecessary, and it would have cost audio at every segment
boundary while an egress reconnected.

### Remaining

Step 3 only. Steps 1 and 2 are done: capture is per participant, and the floor
timeline is persisted with every recording. Until the encoder applies it,
**exports do not honour the floor** — and there is now no mixed file at all, so
export cannot work by simply handing over an object.

### Design

1. ~~**One stem per participant, continuous.**~~ Done. Replace
   `startRoomCompositeEgress` with per-track egress. Subscription-based
   enforcement never unpublishes anyone, so track SIDs are stable and each stem
   runs unbroken for the whole recording — no boundary clipping, in particular
   none in the floor-holder's protected speech.
2. ~~**Persist the floor timeline**~~ Done — `floor_timeline`, offsets into the
   recorded audio. Originally specified as: persist with the recording: who was silenced, from
   when to when, as offsets from the recording's start. A JSON column, as
   `segment_keys` already is. The reducer knows this; it simply is not stored.
3. **Encode on export.** The server fetches the stems, applies the timeline as
   per-stem volume envelopes in ffmpeg, mixes, and returns one file. Users never
   see a stem.

User-triggered pause and resume keep segmenting as they do now; that is
orthogonal, and each segment carries its own offset.

### Consequences

- Export becomes a mixing job rather than concatenation. Export is unbuilt, so
  this is work that was coming anyway.
- Storage roughly doubles. Negligible at this scale.
- Per-speaker stems become available, which is generally useful.
- The correctness of the exclusion now rests on the encoder applying the
  timeline. That wants a test which asserts silence in the *output* across a
  silenced window — measuring the exported file, the way live audio was
  verified.

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

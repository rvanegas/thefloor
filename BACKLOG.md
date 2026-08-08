# Backlog

Work deliberately not being done, with enough context to pick it up cold.
Distinct from `EDGECASES.md`, which tracks defects and untested behaviour in
what *has* been built.

---

## Deliver an export to the user

**Status:** the server side is done (2026-08-07). The app's Export button is
still an alert.

`GET /recordings/:id/export` fetches the stems, applies the floor timeline, and
returns one mixed OGG. Participants only; a stranger is told the recording does
not exist rather than that they may not have it. Recordings captured before
per-speaker stems existed are refused with `legacy_recording`, because the
floor cannot be applied to a mix and handing one over could release remarks the
other party never heard.

What remains is getting the bytes to a phone. Two options:

1. **`expo-file-system` + `expo-sharing`** — download with the bearer token,
   hand to the system share sheet. Natural, but both need native code, so it
   costs a rebuild of the dev build on every device.
2. **A short-lived signed export URL** the client opens with `Linking` — no new
   native dependencies and no rebuild, at the cost of a signed-URL scheme on the
   server and a credential that briefly exists outside the app.

Neither is obviously right; option 1 is more conventional, option 2 is cheaper
to get running.

### Note for whoever builds it

The mix is encoded per request rather than stored, so a change to how the floor
is applied takes effect for past recordings too. That is deliberate — a cached
mix would keep leaking a silenced remark after the bug that let it through was
fixed. If encoding ever becomes too slow to do on demand, cache it keyed by
something that changes when the gating logic does.

`ffmpeg` must be on the server's PATH. That is a deployment requirement the
Lightsail box does not yet satisfy.

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

# Inviting a stranger now sends mail, and nothing bounds how much

Built 2026-08-15 — see decisions/archive/DECISIONS-2026-08-13-to-2026-08-15.md.
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

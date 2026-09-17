# Session tokens are in the journal in plaintext

**The writing stopped on 2026-09-17** — `server/src/log-url.ts` sanitises every
address before it is logged, and
decisions/2026-09-17-the-journal-stops-being-a-place-to-sign-in.md says what was
found and why it is a serializer rather than `redact`. **What is left is the
back catalogue**, which that change does nothing about, and which is a decision
rather than a piece of work.

Back to 2026-08-09. Split out of
`why-one-phone-could-not-hold-a-socket-is-diagnosed-not-observed.md` on
2026-09-15 when that entry was settled and deleted; it was found alongside that
investigation and is nothing to do with it.

**What is in there.** Every credential that rode in a URL between the box's
first boot and the fix: session tokens from `/ws`, guest secrets and link tokens
from `/gws`, and the link tokens, invitation pins and push addresses that four
routes carry in the path. The database stores only a `token_hash`
(`db.ts:601`), so the journal is the one place on the box where the plaintext
exists. Reading it needs root, the same bar as `server/.env` — which is why this
is a defect and not an emergency — but a journal is greppable, long-lived, and
routinely pasted into a terminal by somebody debugging something else. A live
token reached a transcript exactly that way on 2026-09-15.

**Nothing will age it out.** Measured 2026-09-17: no retention is configured,
and journald's defaults are size-based rather than age-based, so the 4 GiB cap
is roughly sixteen months away. See
backlog/nothing-expires-the-journal-and-something-should.md, which is that
question in full and is independent of this one.

**The choice, and it is genuinely unobvious.** Vacuuming the journal destroys
the reconnect history that
decisions/2026-09-15-a-cadence-that-was-inferred-and-the-line-that-will-not-need-inferring.md
and
decisions/2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md
both rest on — the evidence a diagnosis was right, which is not recoverable once
gone. The alternative keeps the journal and makes what is written in it
worthless: revoke the sessions instead.

**That alternative has no one-call form, which is the part to know before
choosing it.** `POST /auth/sign-out-others` is per-account and authenticates
with the caller's own bearer token, so it is something each person does and not
something an operator can run. `revokeAllForAccount` is per-account too. Signing
out the affected population means `bin/db --write` over the `tokens` table —
every row, or those with `created_at` before the fix deployed — which signs
everybody out and makes every phone re-authenticate. Cheap for the size this is
now, and a different proposition later, which is an argument for deciding it
soon rather than a reason to hurry.

Guest secrets are the loose end in either direction: they are not in `tokens`,
so a revocation pass over that table leaves them, and whatever is decided here
has to say what happens to them too.

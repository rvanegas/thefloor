# The second demo account has no credential left

**Status:** not started, and not urgent until that account has to be signed in
as or torn down. Found 2026-08-24; re-measured against production 2026-09-15,
which changed what this entry says. See decisions/ § *The demo account's tokens
keep dying*.

**Every token recorded in `~/.config/thefloor/demo-account.txt` is dead** —
`DEMO_TOKEN`, `DEMO_TOKEN_ALT`, `DEMO_TOKEN_2026_08_16`, `DEMO_TOKEN_2026_08_24`
and `CONTACT_TOKEN` all answer 401 against `/home`. The file is the part with no
credential left, and that is the whole of it: the box tells a different story.

**Sam (`appreview2@`) is signed in somewhere.** One live token, issued
2026-09-14, expiring 2026-12-13, last seen from build 162 — the two-device walk,
most likely. So the account is reachable from whichever device holds it, and
unreachable from this machine, which are not the same problem and were being
written down as one.

**The half a submission depends on is fine, and was confirmed on 2026-09-15**:
`POST /auth/request-code` for `REVIEW_IDENTIFIER` then `POST /auth/verify` with
`REVIEW_CODE` still returns a token. A stale token in the file has never blocked
a reviewer and cannot — the reviewer signs in with the published code. Sam still
has no code of its own, `REVIEW_CONTACT_IDENTIFIER` buying nothing but exclusion
from the build census (`server/src/index.ts`), so administrative access to that
account is still the bypass flip in DEMO-ACCOUNT.md: two restarts of a live box,
each dropping presence and any call in flight. Deliberately, not on the way past.

**What is actually open is the cause, and this entry used to claim it was
closed.** `DEMO_TOKEN_2026_08_24` was minted *after* `issueToken` stopped
revoking an account's other sessions, and it died anyway — so "the reason the
tokens kept dying is gone as of 2026-08-24" is unproven rather than true. The
revoke paths left in `accounts.ts` are sign-out, *Sign out other sessions*
(`revokeOthersForAccount`) and account deletion; the table keeps only hashes, so
which one ran is not recoverable after the fact. Worth answering before minting
another token and expecting it to last, since that is now three reissues that
did not.

The demo data itself was intact at the same reading: the contact row still
`accepted`, and all three channels present with both accounts in `participants`,
`Weekly Convo` among them — which is what the 1.5.1 review notes promise.

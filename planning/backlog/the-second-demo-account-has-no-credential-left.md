# The second demo account has no credential left

**Status:** not started, and not urgent until that account has to be signed in
as or torn down. Found 2026-08-24; see decisions/ § *The demo
account's tokens keep dying*.

Every token in `~/.config/thefloor/demo-account.txt` was found revoked. For
`appreview@` that costs nothing — a fresh one is a `request-code` and a
`verify` away, and that path was confirmed working the same day, which is the
half a submission depends on. For `appreview2@` (Sam Rivera) it is the whole
way in: `REVIEW_CODE` applies only to whichever address `REVIEW_IDENTIFIER`
names, and a token was that account's only credential.

The way back is the bypass flip in DEMO-ACCOUNT.md — point `REVIEW_IDENTIFIER`
at `appreview2@`, restart, sign in, keep the token, flip back — which costs two
restarts of a live box, and a restart drops presence and any call in flight. So
it wants doing deliberately and not on the way past. The reason the tokens kept
dying is gone as of 2026-08-24: `issueToken` no longer revokes an account's
other sessions.

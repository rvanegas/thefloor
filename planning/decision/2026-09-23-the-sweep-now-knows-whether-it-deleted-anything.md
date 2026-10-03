# The sweep now knows whether it deleted anything

`RecordingStore.delete` returned `void` and swallowed its own rejection. That
read as fire-and-forget and was documented as such, but `sweepDeleted` wrapped
the call in a `try`/`catch` and used it to decide whether to drop the row — and
a rejected promise is not a throw, so the `catch` never fired for the S3 store.
`emptied` was therefore always `true`, and every recording row was deleted
whether its objects had gone or not. The row is the only record of which keys
belong to a recording, so what was left was audio nothing could ever name: the
exact failure the ordering in that function exists to prevent, defeated by the
one line that was supposed to detect it.

Both comments described the behaviour the code was meant to have. Neither was
true. The branch that would have held the row back was unreachable, and no test
covered it, because with the old synchronous `MemoryRecordingStore` a refusal
*did* throw — so the tests exercised a path production never took. That is why
this survived: the fixture and the real store disagreed about what failure
looks like, and only the fixture was ever tested.

**`delete` now returns `Promise<void>` and rejects.** `sweepDeleted` is `async`
and awaits `Promise.allSettled` over the keys — `allSettled` rather than `all`
so one refused key does not abandon the others, since the keys that can go
should, and the row is held back regardless. `restore()` stays synchronous and
the hourly timer stays a timer; both `void` the call with a `.catch` that
reports through `onMediaError`, because an unhandled rejection on an hourly
timer would take the process down an hour after anybody did anything. Nothing
ever read the counts `sweepDeleted` returns, so not awaiting it costs nothing.

`MemoryRecordingStore` grew `refuseDeleting(...keys)`, which makes `delete`
reject as a denied policy does. Without it the held-back path cannot be reached
from a test at all. Both new tests were checked against a faithful
reconstruction of the old contract and fail there — the first reporting one row
swept where it expects none, which is precisely the production bug.

**What prompted it.** backlog/*the sweep may not be able to delete anything*
asked which of two things was true and said to establish it before changing
anything. A `DeleteObject` against a non-existent key, run on the box with the
server's own credential, answered it: `AccessDenied`, while `HeadObject` on a
live key succeeded. `thefloor-server` holds no `s3:DeleteObject`, exactly as
CREDENTIALS.md and the comment at `index.ts:100` both say it should. So every
delete the sweep has ever issued was refused, and silently.

The damage was already done and is measurable: 51 recording prefixes, 232
objects, 236.6MB — about 23% of the bucket — sit there with no row naming them.
14 of their 15 channels still have live channel rows, which is the signature of
this bug rather than of a run that failed before writing: someone deleted a
recording, the week elapsed, the row went, the audio stayed. Pre-rename `sess_`
objects and dev leftovers were excluded before counting.

**This fix does not make the sweep work**, and that is deliberate. It makes it
*correct*: it now declines to delete rows it cannot back up with a deletion,
which means until the policy is widened the sweep will hold every row for ever
and report a refusal each hour. That is the recoverable direction and the right
one to be in — the rows are already unreachable to users, and keeping one costs
a row rather than an object nobody can identify. Granting `s3:DeleteObject` is
a separate decision, because CREDENTIALS.md and `index.ts` both state
GetObject-only as a deliberate property, and it is not a thing to widen in
passing. It and the cleanup of the existing 236.6MB are in backlog/.

One thing found on the way and not fixed here: the 187 `EG_*.json` egress
manifests in the bucket are named by nothing in `server/src`, so `objectKeysOf`
never collects them and the sweep leaves them behind even when it works. Small
— 392 bytes each — but it means a cleanup should take the whole prefix rather
than only the keys a row names.

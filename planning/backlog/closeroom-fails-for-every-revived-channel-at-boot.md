# closeRoom fails for every revived channel at boot

A batch of `twirp error unknown: requested room does not exist` at `level: 50`,
once per restart — 103 in the week to 2026-08-14, dating back to 2026-08-09.

`restore()` revives channels from their state blobs and tries to tear down the
media room each one had, but rooms do not survive a LiveKit restart and an ended
channel's room is already gone. So the server asks the media plane to close
something that is not there, and logs an error at the severity reserved for
things that are wrong.

Nothing breaks: closing an absent room is the state that was wanted. The cost is
that a restart writes several stack traces that look like a fault and are not,
which is exactly the noise that makes a real fault at boot easy to miss — the
same complaint as the `assertSilence` flood that was fixed on 2026-08-14, and
the same shape of fix. A 404 from `deleteRoom` means *already closed* and should
be swallowed rather than raised. The predicate to do it with is already in the
file: `isNotFound` was added for the participant case and reads the same 404, so
the fix is one `catch` in `closeRoom`.

Noted 2026-08-14 while verifying the donations deploy, where it was briefly
mistaken for a regression caused by that deploy. It is not related to it.
Re-read against the tree on 2026-09-15 and still holds. `server/src/media.ts`.

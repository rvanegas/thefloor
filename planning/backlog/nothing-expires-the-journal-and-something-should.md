# Nothing expires the journal, and something should

Written 2026-09-17, alongside the serializer that stopped new credentials
reaching the journal —
decisions/2026-09-17-the-journal-stops-being-a-place-to-sign-in.md. That fix is
about what gets written from now on. This is about everything already there and
everything that will be, and the two are independent: a journal with no
credentials in it is still a journal that nobody has decided the lifetime of.

**Measured on the box, 2026-09-17.** `/etc/systemd/journald.conf` has exactly
one line that is not a comment, the `[Journal]` header, and there are no
drop-ins in `journald.conf.d/`. So every retention setting is at its shipped
default, and the shipped defaults are **size-based, not age-based**:
`MaxRetentionSec` is unset, which means no time limit at all. What binds is
`SystemMaxUse`, the lesser of 10% of the filesystem and a 4 GiB cap — `/var/log`
is on a 58 G root, so 10% would be 5.71 GiB and the 4 GiB cap is the real one.
Usage was 324.8 M, and the oldest entry in the journal is the kernel banner from
the box's first boot, `2026-08-09T08:11:18+00:00`. **Nothing has ever been
rotated out.**

**`MaxFileSec=1month` is the trap here, and it is why somebody asks whether this
is already handled.** It is the one month-shaped default in the file and it
looks like a retention policy. It is not: it rotates the *active* journal file
and deletes nothing. Rotation without deletion is precisely what has been
happening for five weeks.

At roughly 8 MB a day, the 4 GiB cap is about sixteen months out — some time in
late 2027 before anything from August 2026 falls off the back on its own. So
there is no clock running that resolves any of this, which is the thing to
design against.

**What to decide, and none of it is obvious.** How long an operational log is
useful for here, against how long it is a liability; whether that is one policy
or two, since the reconnect evidence that
decisions/2026-09-15-a-cadence-that-was-inferred-and-the-line-that-will-not-need-inferring.md
and
decisions/2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md
rest on is exactly the material a short retention destroys, and it is not
recoverable once gone; whether anything should be extracted and kept before a
policy starts deleting; and whether the box is the right place for any of it to
live. `MaxRetentionSec` and `SystemMaxUse` in a drop-in are the mechanism
whatever is decided, which is the easy half — an hour of work behind a question
nobody has answered.

**The back catalogue is a separate call again**, and the two interact in one
direction only: a retention policy short enough to delete August 2026 would
resolve the credential question by destroying the evidence, which is the
outcome nobody wants. Decide that one first —
backlog/session-tokens-are-in-the-journal-in-plaintext.md, which is now only
about that choice.

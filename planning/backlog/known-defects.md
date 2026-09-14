# Known defects

Real, reproducible, and left alone. Resolved entries have been dropped — the
commits record them.

1. **"Audio connected" can be stale.** When the audio hook tears down, its
   cleanup cannot update state — the effect has already been cancelled — so the
   last status sticks and the screen asserts audio that is not there.
   `app/src/audio/useSessionAudio.ts`.
2. **The keyboard's submit key is labelled "Go" and sits in the corner.** The
   code field uses a number pad, which has no return key, so iOS floats a
   standalone key in the bottom-right — far from the fields, over empty space,
   reading "Go" while the button below says "Sign in". Either match the label or
   reconsider the number pad. `app/src/ui/components.tsx`.
3. **Timers derive from wall clock.** Every rule uses a caller-supplied `now`.
    The server is now the authority, which removed the device-drift problem, but
    a clock change on the server would still skew live countdowns. A monotonic
    source would be sounder.
4. **`bin/db` cannot show a JSON column.** `recordings.stems` and
    `floor_timeline` are JSON, and `-column` mode truncates them to the terminal
    width, so the values that matter most are the ones you cannot read. Working
    around it means `instr()` or `json_extract` in every query when you wanted
    to look at the value. A `--json` flag, or `.mode line` for wide results,
    would fix it. Noted 2026-08-09 while checking whether a media stem reached a
    recording. `bin/db`.
5. **`bin/db`'s remote one-shot has no busy timeout.** The interactive and local
    paths set `.timeout 2000`; the one that runs a single query over SSH does
    not, so it fails immediately against a locked database instead of waiting
    the way the others do. `bin/db`.
6. **`closeRoom` fails for every revived channel at boot.** A batch of
    `twirp error unknown: requested room does not exist` at `level: 50`, once
    per restart — 103 in the week to 2026-08-14, dating back to 2026-08-09.

    `restore()` revives channels from their state blobs and tries to tear down
    the media room each one had, but rooms do not survive a LiveKit restart and
    an ended channel's room is already gone. So the server asks the media plane
    to close something that is not there, and logs an error at the severity
    reserved for things that are wrong.

    Nothing breaks: closing an absent room is the state that was wanted. The
    cost is that a restart writes several stack traces that look like a fault
    and are not, which is exactly the noise that makes a real fault at boot easy
    to miss — the same complaint as the `assertSilence` flood that was fixed on
    2026-08-14, and the same shape of fix. A 404 from `deleteRoom` means
    *already closed* and should be swallowed rather than raised.
    `server/src/media.ts`.

    Noted 2026-08-14 while verifying the donations deploy, where it was briefly
    mistaken for a regression caused by that deploy. It is not related to it.
7. **The sweep may not be able to delete anything, and would not say so.**
    `S3RecordingStore.delete` uses the server's own credential chain, and
    planning/CREDENTIALS.md says `thefloor-server` holds `ses:SendEmail` and
    `s3:GetObject` on the bucket, "nothing else" — so `DeleteObject` is denied.
    The rejection is swallowed deliberately (a sweep must not become an
    unhandled rejection), but nothing distinguishes swallowed-because-retryable
    from swallowed-because-forbidden: `sweepDeleted` counts the objects as
    emptied and deletes the row, which is the one order the code goes to
    lengths to avoid, leaving audio in the bucket that no row can identify.

    Unverified against production — the policy might have been widened without
    the document following, and the retention window means little has been due
    for sweeping. Establish which it is before changing anything: either the
    policy needs `s3:DeleteObject`, or `delete` needs to report a permission
    failure rather than absorb it. Noted 2026-08-16 while adding the mix to the
    keys the sweep removes, which is a third kind of object now depending on
    this working. `server/src/storage.ts`, `server/src/channels.ts`.

8. **`media.ts` builds a fresh `S3Client` on every `stopCapture`.** The
    playback stem is stored with a client constructed per call, from the same
    credentials `RecordingStore.put` now holds a long-lived client for. One
    write path would do, and the store is the one that should own it — the
    credentials bundle has to stay in `media.ts` regardless, because LiveKit is
    *given* the key with each egress request and cannot be handed a store.
    Noted 2026-08-16. `server/src/media.ts`.

9. **A channel action that never lands says nothing, and the screen believes it
    anyway.** `app.act` is fire-and-forget: `socket.send` queues a
    `channel.action` taken while the socket is down, but only for
    `QUEUE_TTL_MS` (10s) and 32 deep, and drops it silently past either — and a
    *refused* action is answered with a snapshot and no error, so there is
    nothing to catch even when the send succeeded. `ChannelSettingsView.persist`
    then records `saved.current.name` immediately after dispatching,
    unconditionally, so the screen's own record says the write happened whether
    or not it did, and `done()` leaves regardless. The comment at
    `app/src/api/socket.ts:88` names this shape as the worst a bug can take —
    the queue narrows the window rather than closing it. Compare
    `HomeSettingsView`, whose write is an awaited HTTP call: it reports the
    failure and declines to close. Softened by the channel screen rendering the
    name from the server snapshot, so a lost `SET_NAME` shows as the old name
    still being there — visible, but unexplained, and indistinguishable from
    having mistyped. The full fix is an acknowledgement for `channel.action`,
    which is a wire change and needs the two-step deploy; stopping the premature
    `saved.current` is smaller and independent. Noted 2026-08-17, from asking why
    only one of the two settings screens has a "Saving…" state.
    `app/src/ui/ChannelSettingsView.tsx`, `app/src/api/socket.ts`.

10. **A rewind while the watch party is paused leaves the picture where it
    was.** `follow()` corrects a paused transport only in the branch that has
    just paused a playing player, so a `WATCH_SEEK` arriving while everything is
    already at rest moves the readout and not the video: the footer says one
    time, the frame shows another, and it stays that way until somebody presses
    Play, at which point the correction runs and it catches up. The fix is to
    correct on a paused transport whatever the player was doing, and the
    ordering is the care it needs — correcting before pausing sends the player
    somewhere it is about to be stopped at. Noted 2026-08-29 while fixing the
    seek storm two lines away, decisions/ § *A rewind that ate
    itself*, and kept separate from it because a fix that is not what was
    reported is a fix nobody has watched.
    `server/src/watch-page.ts`.

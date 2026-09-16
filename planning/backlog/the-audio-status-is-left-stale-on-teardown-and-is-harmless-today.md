# The audio status is left stale on teardown, and is harmless today

The connection effect's cleanup does not reset `status`, so the last value —
usually `connected` — survives the room going away. Nothing shows it: the
`connected` case of `describeAudio` returns no sentence, and the card is gated
on `iAmPresent`, which is false by the time the room is gone. So this is a trap
rather than a defect. **A new case added to `describeAudio` that does return a
sentence inherits the staleness**, which is how this entry read until
2026-09-15, when the screen still said "Audio connected" over an audio system
that had been released.

Re-read against the tree on 2026-09-15 and still holds.
`app/src/audio/useSessionAudio.ts`, `app/src/ui/ChannelView.tsx`.

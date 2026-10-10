# The Record tab is a log, in rooms

Rodrigo's design, 2026-10-09, the same day *Recordings* and *Transcript* became
one tab: text rather than cards, with timestamps, the way Telegram reads; a
date that is always visible; and always a share icon, for the audio of a whole
*room* — which he defined as a live room from the first step in to the last
step out.

**A room is written, not inferred.** Nothing stored where a sitting began or
ended. `usage_spans` has per-participant spans that could reconstruct them, and
its own rule is that the application never reads it, so a `rooms` table is
written on the two transitions of `present` instead (`server/src/rooms.ts`).
The end is the moment `channelEmptied` already fires, members only, so a guest
left talking alone does not keep a room open — the same moment their link
lapses. A restart closes every open room and marks it, and the people
reconnecting within ten minutes resume it rather than starting a second.

**Nothing from before is shown, by his choice.** Asked whether to backfill from
the usage spans, treat each old recording as its own room, or show only new
rooms, he chose the last and went further: older history is not drawn at all,
and a sitting is drawn only if it was recorded or transcribed. So recordings
made before this shipped are not on the tab. They still exist, transcript search still finds
the ones transcribed, and a published one is still on its channel's page —
but renaming, deleting and publishing them has no way in from the app now.

**Considered and not built:**

- **A floating date over the log, Telegram's exact effect.** The date is a
  pinned bar under the channel header instead, `RoomBar`, whose text changes
  as the next room's rule scrolls under it. It needs no overlay on the scroll,
  which `Screen` is built never to have, and reads the same.
- **Keeping the gaps in a shared room.** The runs are joined back to back:
  silence the length of the stretch nobody recorded is not something anybody
  sending a conversation wants.
- **Hiding the share icon when a room has no audio.** It stays, faint, and
  says why when pressed — STYLE.md's rule six.
- **Recordings as start and end brackets around the talk they cover**, or as
  the old cards in the flow. One muted line where each began, opening in place
  to the card's actions, was the choice.

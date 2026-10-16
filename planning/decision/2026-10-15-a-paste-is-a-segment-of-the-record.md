# A paste is a segment of the record

Rodrigo, 2026-10-15: remove the *Clipboard* tab and fold the feature into
*Record*, so that **pasting a value enters the transcript as its own
segment**. Until then a channel had one clipboard, a slot each paste
overwrote and anybody here could clear, on a tab of its own between *People*
and *Invite*.

**Four questions, his answers.**

- **A paste breaks nothing.** The 2026-10-10 rule is that every change of what
  is kept is a clean break, so a recording is exactly one segment's audio. A
  paste is not a change of what is kept. Made while audio or text is running,
  it falls inside that segment, which carries on, and the log draws it among
  that segment's lines at its moment. Considered and not built: a clean break
  at every paste, which would have cut a recording in two each time.
- **Only from inside a room.** Pasting was `presentOrEmpty`, on the reasoning
  that leaving a link on an empty channel's clipboard was furnishing the room.
  The *Record* is laid out in rooms, and an empty channel has none, so
  `canPasteClip` asks `isHere`. Considered and not built: a paste outside every
  sitting standing as a room of its own, as a pre-rooms recording does.
- **History only.** No current-clip slot pinned above the log and no *Clear*.
  Every paste is an entry with its own *Copy*, and *Open* when the whole of it
  is one link.
- **Never deleted.** Not by its author, not by anybody: kept as a transcript
  line is.

**How it is built, in the parts not guessable from the code:**

- **A table of its own, not a row in `segments`.** `pastes` is written by
  `Pastes.follow` on the transition where `ChannelState.clip` takes a new id,
  so every route in — the app, a guest's page, an old build's tab — reaches
  the log by the one path, and the id is the clip's. `Rooms.forChannel` lists
  pastes among a room's segments as instants (`startedAt === endedAt`, with
  `paste`), and a room that kept nothing else is listed for them.
- **The author's name is kept as it was**, as a live line keeps its speaker's.
- **Drawn whole.** The tab showed the newest paste on one truncated line; a log
  does not truncate what somebody said. `MAX_CLIP_LENGTH`, 8,000 characters,
  is still the bound and is unchanged.
- **The text share of a segment includes its pastes**, where they were made.
- **The control is at the foot of *Record***, where the log grows and the
  screen follows the end, rather than pinned with the transport, which is about
  what is being kept rather than an entry in it.
- **A guest's page keeps its section**, as *Last pasted*, without *Clear*: a
  guest has no *Record* to read pastes in.

**Old builds keep working, and the server deploys first.** Builds up to 363
draw the *Clipboard* tab from `ChannelState.clip`, which is still set on every
paste, and their *Clear* still empties it — only it, never the log — which is
the shim in SHIMS.md, gate 364. Their pastes reach everybody's *Record*. The
one thing they lose is pasting into an empty channel, which their own core
offers and the reducer now refuses without a word. This build reads pastes
only from the rooms route's `paste`, so against a server without it pastes
would vanish from the screen entirely: **deploy the server before uploading
the build.**

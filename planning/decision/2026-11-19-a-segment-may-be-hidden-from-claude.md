# A segment may be hidden from Claude

Decided 2026-11-19, Rodrigo's, the *Record* half of
`choose-what-claude-reads.md`: **a segment may be hidden from *Ask Claude*,
for everybody until somebody shows it again.** *Hide from Claude* in its
menu, *Show to Claude* once it is, and a muted line under it, *Hidden from
Claude*, while it is. Every later press reads the *Record* without it and
without what was pasted into it, Claude's own replies among those, as they go
with its text when it is deleted.

**Why**: distraction first. What is inside the budget is all sent, so an
unrelated earlier stretch can steer the reply; redundancy and cost come after
it, and caching is the cheaper answer to cost
(`cache-the-prompt-ask-claude-sends.md`).

What was asked, and answered:

- **The unit is the segment**, the line that already carries every action
  in a menu. A segment derived for a room from before 2026-10-10 has no row
  and is not offered it; a paste standing alone is not either, its menu being
  the paste's.
- **The default is the *Record* as it was**, the newest first within the
  budget, with hidden segments left out. *None by default* was the other
  candidate, raised on 2026-11-18's call, and is still open in the task.
- **A mark that holds, not a choice per press**, on *Name voices*' terms
  (`hideFromClaude`): a member, present or the room empty, not in a channel
  only its owner runs. Visible to everybody, so nobody's words are left out
  without the room seeing it. Who hid it is not kept, as nobody is of who
  named a voice.
- **Claude is told nothing.** Rodrigo's call: no line in the segment's place
  and no sentence in the opening.
- **Nothing is brought in** from past the budget; the library's one-line form
  and `read_file` already reach older talk.

**The channel library keeps its document.** Hiding is about what a press is
sent, and Claude reads the library only when it chooses to, so a search may
still find a hidden segment's document. In `composeLibraryRecord` it is not
even a line naming its document.

**Where it lives.** `segments.hidden_from_claude` and `hidden_changed_at`,
the stamp `lastFiledAt` carries so every *Record* reads the rooms again;
`SegmentView.hiddenFromClaude` on the rooms; `PUT
/channels/:id/segments/:segmentId/hidden`; `withTheirPastes` in claude.ts
leaves the segment and its pastes out for both composers. The app offers the
row only where *Ask Claude* is drawn and draws the line wherever the mark is.
An optional field and a new route: an older build ignores the one and never
calls the other, so there is no shim.

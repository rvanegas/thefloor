# One Delete for a segment, with what goes checked

Erta asked, 2026-11-16, for a way to delete a segment whole; Rodrigo gave the
shape, and settled the rest on 2026-11-18 when a review against the code found
three of the task's premises did not hold. **A segment's menu has one
*Delete***, in place of *Delete audio* and *Delete text*, opening a
confirmation the app draws (`ConfirmModal`) with a box, ticked, for each of
the three things a segment can have: its **audio**, its **text** — live, or
its recording's batch transcript — and **its document in noesis**, where it
was filed in the channel library. Unticking one spares it. The server takes
the ticked set in one call, `DELETE /channels/:id/segments/:segmentId`,
checking everything asked for before doing anything, so a confirmation cannot
leave a segment half deleted.

**What was decided, and why it is not what the code did before:**

- **Ticked by default.** STYLE.md § *Checkbox* said a box starts clear; that
  is a setting's rule, where a box is a permission nobody has given yet. In a
  confirmation a box is an item about to go.
- **The document is its own thing.** Since 2026-11-08 deleting a segment's
  text deleted its document at once, and deleting a recording took its
  transcript's document a month later. Rodrigo: text, as in the *Record*, and
  document, as in noesis, are distinct. So `segments.document_deleted_at`
  marks the document alone; nothing else takes it, and a document deleted is
  never filed again, though naming a voice since would otherwise owe it.
  Builds up to 437 still delete it with the text or the recording, as their
  confirmations told whoever tapped (SHIMS.md gate 438).
- **A transcript goes with its audio**, as it always has: a batch transcript
  is its recording's. So ticking *Audio* ticks *Text* where the text is a
  transcript, unticking *Text* unticks *Audio*, and the boxes say so. A
  transcript is deleted without its audio only by whoever asked for it, as
  before; for anybody else it has no box.
- **A month's grace for every manual deletion.** Found already true on the
  server on 2026-11-18: recordings, channels, transcripts and live text are
  all swept thirty days after they are marked (`DELETED_RETENTION_MS`,
  `TRANSCRIPT_DELETED_RETENTION_MS`), and a document deleted at noesis waits
  thirty days in noesis's trash. Only words disagreed — *Delete audio*'s "a
  week from now", and the channel library's design saying a week — and they
  say a month now.
- **Pastes are not touched**: a paste is never deleted, and the dialog says
  what was pasted stays. Claude's replies going with the segment they answer
  is `claude-s-paste-belongs-to-the-segment-it-answers.md`; a paste outside a
  segment being deletable is `a-paste-outside-a-segment-can-be-deleted.md`.
- **`Alert.alert` is not for ordinary UI**, which reversed STYLE.md's rule
  that confirmations use it. `ConfirmModal` is the one built here; moving the
  rest is `alert-alert-is-not-for-ordinary-ui.md`.

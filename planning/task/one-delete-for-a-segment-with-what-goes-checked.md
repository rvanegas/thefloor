# One Delete for a segment, with what goes checked

Erta asked, 2026-11-16, for a way to delete a segment whole; Rodrigo gave the
shape. **Replace *Delete audio* and *Delete text*** — two red items in the
segment's menu (`components.tsx`, `RecordTab.tsx`) — **with one *Delete***,
which opens a confirmation with checkboxes, all checked by default:

- **Audio**, where the segment has a recording.
- **Text**, where it kept text — the *Record*'s, live or batch transcript.
- **The noesis document**, where the segment was filed in the channel library
  (`segments.filed_file`) — Rodrigo's addition, since filing is automatic and
  a member may not think of it.

Unchecking any of them before confirming spares it. The streamlining is that
the confirmation was owed anyway. The words need a Spanish string, chosen for
translation; read STYLE.md for the dialog and the checkboxes, and GLOSSARY
before naming it.

## Decided at the prompt, 2026-11-18

A review against the code found three premises that did not hold; Rodrigo
settled them and three more.

- **Checked by default is right here.** STYLE.md § *Checkbox*'s rule that a
  box starts clear governs settings, where a box is a permission nobody has
  given yet. A confirmation's boxes say what is about to go; they start
  ticked. STYLE.md says so as of this commit.
- **Text and document are distinct, and either may go without the other.**
  Today they are not: deleting a segment's text deletes its document at once
  (`forgetDocuments`, both `deleteSegmentText` and `transcriptDeleted`). That
  coupling goes. Deleting only the document needs a route that does not exist
  yet; the segment is not refiled afterwards, since `filed_at` stays set.
  Deleting only the text leaves the document at noesis, where every member can
  still open it — which is the member's choice, made with the box in front of
  them.
- **A month's grace, for all three**, the document included: deleted is
  marked, swept a month later. That is `every-manual-deletion-has-a-month-s-grace.md`,
  for every manual deletion in the app; this dialog's words say *a month*
  only once that has shipped, or ship with it.
- **A custom modal, not `Alert.alert`**, which cannot draw checkboxes and is
  not for ordinary UI at all (`alert-alert-is-not-for-ordinary-ui.md`).
- **Claude's pastes that answer a segment's text go with it**
  (`claude-s-paste-belongs-to-the-segment-it-answers.md`). Until that ships,
  pastes inside a segment are spared, as `deleteSegmentText` spares them now,
  and the dialog must not imply otherwise.

## The shape that follows

**One server route that takes the ticked set** — audio, text, document — and
does them together, rather than the client calling `deleteRecording`,
`deleteTranscript` or `deleteSegmentText` and a new document route in turn,
where a failure partway leaves a half-deleted segment and a dialog with no
honest thing to say. It carries the guards those routes share: a member who
holds the controls, present or the channel empty, the segment finished.

**The menu has two sources today**: *Delete text* for live text arrives from
`RecordTab.tsx` through `SegmentHead.menu.remove`, and `RecordingRow` adds
*Delete audio* and the transcript's own items (`components.tsx`). One *Delete*
means changing that interface, not only the labels. A segment with only one
of the three still gets the dialog, with one box, so that *Delete* always says
what it takes.

# One Delete for a segment, with what goes checked

Erta asked, 2026-11-16, for a way to delete a segment whole; Rodrigo gave the
shape. **Replace *Delete audio* and *Delete text*** — two red items in the
segment's menu (`components.tsx`, `RecordTab.tsx`) — **with one *Delete***,
which opens a confirmation with checkboxes, all checked by default:

- **Audio**, where the segment has a recording.
- **Text**, where it kept text.
- **The noesis document**, where the segment was filed in the channel library
  (`segments.filed_file`) — Rodrigo's addition, since filing is automatic and
  a member may not think of it.

Unchecking any of them before confirming spares it. The streamlining is that
the confirmation was owed anyway. Deletion keeps the week's grace the
privacy policy promises, the document included
(`a-channel-has-its-own-noesis-library.md` § *Deleting*). The words need a
Spanish string, chosen for translation; read STYLE.md for the dialog and the
checkboxes, and GLOSSARY before naming it.

# Choose what of the Record Claude reads

Rodrigo, 2026-11-17. *Ask Claude* reads the channel's *Record* by a fixed
rule: newest first, up to `RECORD_BUDGET_TOKENS` (about seven hours of
talk), or, where it consults the channel's library, the newest room and
`LIBRARY_RECORD_BUDGET_TOKENS` in full with older filed segments as a line
each (`composeLibraryRecord`, `server/src/claude.ts`). What is in that window
is all in it, so an unrelated earlier stretch can distract the reply. **Asked:
deciding by hand what is included and what is left out.**

Open, and the user's to answer:

- **The unit**: a segment, which is the line that already carries every
  action in its menu, or a room, or a stretch of lines.
- **Whose choice and how long it holds**: per press, or a mark on the segment
  that holds for everybody present until changed, which is visible and so
  cannot surprise somebody whose words were left out or put in.
- **Include as well as exclude**: reaching back past the budget to bring in
  an older segment, where the library's one-line form or `read_file` may
  already be the cheaper way.
- **What Claude is told**: that it is reading a selection, so it does not
  speak as if the left-out part never happened.

Read GLOSSARY *Ask Claude*, *Segment* and *Record*, and
`decision/2026-11-14-ask-claude-searches-a-library-it-is-given.md`, before
designing it; STYLE.md before drawing the control, which needs a Spanish
string too.

**Added 2026-11-18, on the call with Rochelle** (chat
`2026-11-18-claude-audio-feature-development-and-costs`): Rodrigo wondered
whether **none of the Record should be sent by default**, only when asked
for. A press costs about 50 cents, mostly because it carries the whole
conversation so far and that keeps growing; and now that past conversations
are in the channel's library, Claude can choose to read them there, and only
does when asked, where the *Record* is read whole on every press. Another
point on the same axis as the unit and the budget: settle it with them.

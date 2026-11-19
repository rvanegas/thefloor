# Choose what Claude reads

Rodrigo, 2026-11-17. *Ask Claude* reads the channel's *Record* by a fixed
rule: newest first, up to `RECORD_BUDGET_TOKENS` (about seven hours of
talk), or, where it consults the channel's library, the newest room and
`LIBRARY_RECORD_BUDGET_TOKENS` in full with older filed segments as a line
each (`composeLibraryRecord`, `server/src/claude.ts`). What is in that window
is all in it, so an unrelated earlier stretch can distract the reply. **Asked:
deciding by hand what is included and what is left out.**

**Why, in order** (Rodrigo, 2026-11-18): **distraction first**; then
**redundancy**, since a segment already filed in the channel's library is
there for Claude to read and need not be sent as well; then **cost**, whose
cheaper answer is `cache-the-prompt-ask-claude-sends.md`. Where the three
point different ways, distraction decides.

**Done first: `2026-11-18-a-paste-is-part-of-the-segment-it-was-made-in.md`**:
a paste is part of the segment being transcribed when it was made, so
leaving a segment out leaves out what was pasted into it, Claude's replies
included, and a filed segment's pastes go with its line.

Open, and the user's to answer:

- **The unit**: a segment, which is the line that already carries every
  action in its menu, or a room, or a stretch of lines.
- **Whose choice and how long it holds**: per press, or a mark on the segment
  that holds for everybody present until changed, which is visible and so
  cannot surprise somebody whose words were left out or put in. The same
  question for a library document, below, gets the same answer.
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

## The library's documents too

Rodrigo, 2026-11-18, on the same call, filed then as its own task and merged
here 2026-11-19. When *Ask Claude* consults a library, nobody in the channel
can see what it is finding or how it is looking, as claude.ai shows its MCP
calls. Seeing it is `claude-s-working-is-kept-with-its-reply.md`, step 2.
**Asked beyond it: to guide it** — "look at this one, don't look at that
one".

- **The natural place is the steps under a reply**: each hit a lookup returned
  is already a line there, so marking one *read this* or *leave this* for the
  next press is a control on a line that exists.
- **What Claude is told**: the marks as lines in the *Record*, by the server,
  in the same form `renderWorking` gives the steps, so it cannot mistake a
  member's instruction for its own working.

**Why one task**: if none of the *Record* is sent by default, the
conversation so far reaches Claude through the library like any other
document, and leaving out a segment and leaving out a document become the
same mark. Even if it is sent, the two share whose mark it is, how long it
holds, and what Claude is told about a selection, and should not answer
those twice.

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

**Done**: `2026-11-18-a-paste-is-part-of-the-segment-it-was-made-in.md`, the
step before; and **`2026-11-19-a-segment-may-be-hidden-from-claude.md`**, the
*Record* half — a segment hidden for everybody until shown, its pastes with
it, Claude told nothing. That decision says how the unit, whose mark, and
what Claude is told were answered. What is left:

## None of the Record by default

Added 2026-11-18, on the call with Rochelle (chat
`2026-11-18-claude-audio-feature-development-and-costs`): Rodrigo wondered
whether **none of the Record should be sent by default**, only when asked
for. A press costs about 50 cents, mostly because it carries the whole
conversation so far and that keeps growing; and now that past conversations
are in the channel's library, Claude can choose to read them there, and only
does when asked, where the *Record* is read whole on every press. Settle it
with them. Hiding by segment is the default's opposite number: it stays the
way to leave something out if the default stays, and becomes the way to put
something in if it goes.

## The library's documents too

Rodrigo, 2026-11-18, on the same call, filed then as its own task and merged
here 2026-11-19. When *Ask Claude* consults a library, nobody in the channel
can see what it is finding or how it is looking, as claude.ai shows its MCP
calls. Seeing it is `claude-s-working-is-kept-with-its-reply.md`, step 2,
**which this waits on**: the steps are kept and read by the next press, but
not on the wire or drawn. **Asked beyond it: to guide it** — "look at this
one, don't look at that one".

- **The natural place is the steps under a reply**: each hit a lookup returned
  is already a line there, so marking one *read this* or *leave this* for the
  next press is a control on a line that exists.
- **Whose mark and how long it holds**: as a segment's, everybody's until
  changed, on *Name voices*' terms.
- **What Claude is told**: unlike a hidden segment, it has to be told
  something, since a mark that says *read this* is an instruction. The marks
  as lines in the *Record*, by the server, in the same form `renderWorking`
  gives the steps, so it cannot mistake a member's instruction for its own
  working.

**Why one task**: if none of the *Record* is sent by default, the
conversation so far reaches Claude through the library like any other
document, and leaving out a segment and leaving out a document become the
same mark.

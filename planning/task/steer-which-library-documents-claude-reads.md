# Steer which library documents Claude reads

Rodrigo, 2026-11-18, on the call with Rochelle (chat
`2026-11-18-claude-audio-feature-development-and-costs`). When *Ask Claude*
consults a library, nobody in the channel can see what it is finding or how it
is looking, as claude.ai shows its MCP calls. Seeing it is
`claude-s-working-is-kept-with-its-reply.md`, step 2. **Asked beyond it: to
guide it** — "look at this one, don't look at that one".

- **The natural place is the steps under a reply**: each hit a lookup returned
  is already a line there, so marking one *read this* or *leave this* for the
  next press is a control on a line that exists.
- **Whose mark and how long it holds** is the same question
  `choose-what-of-the-record-claude-reads.md` asks of segments, and both
  should answer it the same way.
- **What Claude is told**: the marks as lines in the *Record*, by the server,
  in the same form `renderWorking` gives the steps, so it cannot mistake a
  member's instruction for its own working.

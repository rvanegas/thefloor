# A channel has its own noesis library

Asked for 2026-11-07. A channel may have a library of its own in noesis: its
transcripts go in by themselves, anybody in it can import source documents,
and every member of the channel can reach it **and nobody else can**. Today a
library is only ever a person's (GLOSSARY *Library*), and a room's text
reaches one only by somebody's *Send to noesis* into their own.

## The design, as agreed at the prompt

- **The Floor is the owner and the channel's handle is the library**:
  `thefloor/<handle>`, as a person's is `<username>/<library>`. The handle is
  a slug of the channel's name plus a random suffix (GLOSSARY *Handle*),
  minted only for a channel that has a library. **Built 2026-11-07**:
  `channels.handle`, `ChannelRegistry.handleFor`.
- **The Floor is the only authority on who may read it, and noesis asks.**
  noesis asks The Floor for the channel's members, by username, when a
  library is reached (or on a short cache), rather than The Floor pushing
  each change: pushing is the shape 2026-11-03 rejected for names, where a
  lost or replayed call leaves the two disagreeing. Usernames are noesis's
  already (`decision/2026-11-02-noesis-decides-every-username.md`), so the
  answer names people noesis knows, and leaving or *removal* takes access
  away at the next asking with nothing to send.
- **Members only. Guests have no access whatever**, seat or no seat.
- **In noesis, a member's list of libraries shows their own and those of
  every channel they belong to.**
- **The cost is split among the channel's Pro members.**
- **Every transcript goes in by itself**, with no switch to stop it, each
  *segment* as one document, as if somebody had sent it with *Send to noesis*.
- **With no Pro member the channel stops taking transcripts** and otherwise
  goes on as before: the library stays readable, and the channel works.

## Open

- **Renames.** The handle survives one, so `thefloor/book-club-k3x9` can end
  up naming a channel now called something else. Whether a library holds the
  name fixed, as a connected library holds a username, is to be decided once
  it is in use.
- **Which segment is which.** Two segments of one day are told apart only by
  their hours, and noesis drops them: The Floor sends the hours twice — the
  filename's `HHMM` and the text's hours line — and `from_the_floor`
  (`noesis/cmd_import.py`) keeps the date alone, files the document as
  `<date>-<title>.chat.md` under a title a model gives it, and discards each
  turn's time too. The fix is noesis's: carry the hours into the document.
- **Telling the members.** Their text goes in with no switch, so whether they
  are told — a notice like the *public notice* — is open.
- **The question's credential.** noesis asking The Floor means The Floor
  authenticating noesis, a credential this project holds rather than issues
  (CREDENTIALS.md).
- **noesis's side.** An owner that is not a person (`thefloor`, reserved in
  the register so no person can take it), access decided by asking The Floor
  rather than `who == user` (`noesis/service.py`, `library_root`), the list
  of libraries that includes a member's channels', and billing split among
  people rather than charged to the owner.
- **Ask Claude** consulting it, which is the obvious next use: the channel's
  own library offered alongside its members'.

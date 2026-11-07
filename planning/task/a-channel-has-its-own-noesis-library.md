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
- **The Floor tells noesis the channel's members by username**, and noesis
  lets in whoever is on that list. Usernames are noesis's already
  (`decision/2026-11-02-noesis-decides-every-username.md`), so the list names
  people noesis knows.
- **In noesis, a member's list of libraries shows their own and those of
  every channel they belong to.**
- **The cost is charged to the channel's Pro members.**

## Open

- **Renames.** The handle survives one, so `thefloor/book-club-k3x9` can end
  up naming a channel now called something else. Whether a library holds the
  name fixed, as a connected library holds a username, is to be decided once
  it is in use.
- **How the list reaches noesis.** Pushing each membership change is the
  shape 2026-11-03 rejected for names: a lost or replayed call leaves the two
  disagreeing about who may read. noesis asking The Floor, at access time or
  on a short cache, has The Floor stay the only authority on membership.
- **Who is "in the channel".** Members, surely; *guests* hold a seat and no
  membership, and a *community* has up to twenty. Leaving and *removal* have
  to take access away as surely as joining gives it.
- **Charging.** Several Pro members, or none; what happens to the library
  when the last one lapses.
- **What goes in automatically.** Each *segment*'s text, as *Send to noesis*
  files it, presumably, and whether anybody may switch that off.
- **noesis's side.** An owner that is not a person (`thefloor`, reserved in
  the register so no person can take it), access by a client-supplied list
  rather than `who == user` (`noesis/service.py`, `library_root`), and the
  free/Pro limits of an owner that has no account.
- **Ask Claude** consulting it, which is the obvious next use: the channel's
  own library offered alongside its members'.

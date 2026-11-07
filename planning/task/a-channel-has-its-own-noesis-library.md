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
- **The cost is split among the channel's Pro members** — The Floor's *Pro*,
  not a plan at noesis, which has no payment at all: an account there is
  *free*, with a small monthly allowance of model use, or *unlimited*
  (`noesis/accounts.py`). So **The Floor pays and splits**: `thefloor` is an
  unlimited owner at noesis, noesis meters what each channel's library spends
  and reports it, and The Floor divides it among whoever is Pro there. A Pro
  member needs no noesis account to pay their share, only to read the library
  in noesis itself.
- **Every transcript goes in by itself**, with no switch to stop it, each
  *segment* as one document, as if somebody had sent it with *Send to noesis*.
- **With no Pro member the channel stops taking transcripts** and otherwise
  goes on as before: the library stays readable, and the channel works.
- **Members are told on a settings card** that the channel's transcripts go
  into its library.
- **A rename leaves the handle alone, and the name is never held fixed.** The
  handle is an id, the way a repository's URL is; what a person reads is the
  channel's *current* name, which The Floor's answer to noesis carries, with
  the handle under it. Renaming the library with the channel is the shape
  2026-11-03 rejected — ids saved where nothing can rewrite them, like
  `ChannelState.libraries` and connector setups — and fixing the name costs
  every channel that has a library. Documents filed before a rename keep the
  name they were filed under, which was true when said.
- **Ask Claude consults it by default.** The Floor reaches it with its own
  client token, confined to that library, so a press needs nobody's noesis
  connection; it is on wherever the channel has a library, the channel's
  *Library* switch turning it off as for anybody's; and Claude is told it
  holds the channel's earlier conversations and the sources members imported
  — the *Record* it already reads being the recent part — rather than one
  person's writing, as `libraryRule` says of the others.

## How the two ends talk

- **noesis asks The Floor two questions**, for channels with a handle only:
  the members of a handle — by username, each marked Pro or not, with the
  channel's current name — and the handles a username is a member of, for
  the list of libraries.
- **noesis proves it is noesis with the pair The Floor already holds**,
  `NOESIS_CLIENT_ID` / `NOESIS_CLIENT_SECRET`, as HTTP Basic: the one The
  Floor presents to noesis's register, kept in the clear at noesis
  (`oauth.py`, `keeps_names`), so one shared secret answers both ways and no
  new credential is made. CREDENTIALS.md says so when it is built.

## noesis's side

- **An owner that is not a person**: `libraries/thefloor/<handle>`, the name
  `thefloor` reserved in the register so no person signs up as it, and a
  call for a client to make a library under it — `POST /libraries` makes one
  under the caller's own name and refuses a service.
- **Access by asking The Floor** rather than `who == user`
  (`noesis/service.py`, `library_root`), on every way in: files, runs,
  imports and MCP.
- **The list of libraries** carrying a member's channels', by their current
  names.
- **Spending metered per channel library** for The Floor to read and divide,
  and refused, where it would spend, for a channel with no Pro member.
- **Whose voice.** noesis reads its owner's lines as their own and the rest as
  context (`speaker_names`); a channel's library has every member's lines as
  its own voice, and Claude's or a guest's as context.
- **The hours of a segment kept.** Two segments of one day are told apart
  only by their hours, and noesis drops them: The Floor sends them twice — the
  filename's `HHMM` and the text's hours line — and `from_the_floor`
  (`noesis/cmd_import.py`) keeps the date alone, files the document under a
  title a model gives it, and discards each turn's time too. The hours belong
  in the document: on its date line, and on each turn.

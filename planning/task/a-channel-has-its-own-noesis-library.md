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
- **The cost is reported, not shown**: `ts library-spending` gives each
  library's month from noesis and each Pro member's share, and nothing in the
  app or the server shows it.
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

**Built, 2026-11-07, at both ends**, and off until `CHANNEL_LIBRARIES` is set.

- **noesis asks The Floor two questions**, for channels with a handle only:
  the members of a handle — by username, each marked Pro or not, with the
  channel's current name — and the handles a username is a member of, for
  the list of libraries. `GET /noesis/libraries/:handle` answers
  `{ handle, name, members: [{ user, pro, name }] }`, users lowercase as noesis
  keeps them, a member with no username left out, 404 for a handle naming
  nothing; `GET /noesis/users/:user/libraries` answers `{ libraries: [{ handle,
  name }] }`, by the name somebody holds now — never an old one through
  `username_aliases`, which noesis may since have given somebody else.
- **noesis proves it is noesis with the pair The Floor already holds**,
  `NOESIS_CLIENT_ID` / `NOESIS_CLIENT_SECRET`, as HTTP Basic: the one The
  Floor presents to noesis's register, kept in the clear at noesis
  (`oauth.py`, `keeps_names`), so one shared secret answers both ways and no
  new credential is made. CREDENTIALS.md says so.
- **The Floor files and consults with the same pair**: it makes the library
  and imports each segment (`server/src/channelLibraries.ts`, a sweep a
  minute, `segments.filed_at`), and asks `POST /applications/token` for an
  hour's MCP token confined to the one library at a press of *Ask Claude*.
- **What a member sees**: the *Channel library* card on *Channel Settings*
  (`GET`/`PUT /channels/:id/noesis-library`), with *Open in noesis* and the
  *Claude consults it* switch (`channels.consult_library`); *Open noesis* on
  *Floor Settings*' card.

## noesis's side

**Built 2026-11-07 on noesis's branch `channel-libraries`**, and argued in its
`decision/2026-11-07-an-application-keeps-libraries-for-its-groups.md`
(`noesis/members.py`):

- **An owner that is not a person.** The operator marks the client with the
  URL The Floor answers at (`scripts/client_libraries.py thefloor
  https://thefloor.rvanegas.co`), which makes `libraries/thefloor/` and so
  takes the name in the register. The Floor signs in with its client pair as
  HTTP Basic and is then the owner: `POST /libraries` makes a channel's.
- **Access by asking The Floor**, on every way in, an answer kept a minute;
  The Floor not answering admits nobody and lists nothing.
- **Listed beside the person's own**, by the channel's current name
  (`names` on `/libraries` and `library_names` on `/me`). The Floor keeps
  only a person's own in their toggles: `whoIs` drops every id that is not
  under their name.
- **Metered as the library**, `thefloor/<handle>`, uncapped, and read by The
  Floor from `GET /applications/spending` to divide; what would spend is
  refused (402) for a channel with no Pro member.
- **Every member's lines its own voice**: the display name The Floor gives,
  and their own names at noesis.
- **A segment's hours** imported on the line under the date, for every
  library. A segment imported before is not recognised again, its text having
  changed.

## A segment matched to its document, and a shorter Record

Asked and built 2026-11-07, at both ends. Once the library holds a channel's
transcripts, a press that consults it was carrying the same text twice — in
the *Record* in full and in the library — and paying for it on every model
turn of a lookup, while nothing let a member or Claude tell which document was
which segment: noesis titles a Floor chat by what was said (a model's, since a
channel's sittings share its name), the *Record* names a segment by its hours.

- **noesis says the title.** An import's `done` event carries `titles`, each
  chat or document it wrote by its title (noesis `server.py`, `_titles`), and
  The Floor keeps it on the segment, `segments.filed_title`, beside
  `filed_file`. A noesis that does not say leaves it null, and the line keeps
  its hours alone.
- **The *Record* tab shows it**, under the segment's hours, with *Open in
  noesis* — noesis's web client takes `&file=` beside `?library=` and opens
  that document (`app.js`). `GET /channels/:id/rooms` adds the URL.
  Matching by name was rejected: The Floor would have to copy noesis's slug
  rules, and the title is the only part of the name that says anything.
- **Claude is given the document's name**, as `read_file` takes it, on each
  filed segment of the *Record* it reads, so it can read one directly and knows
  which it already holds.
- **And less of the *Record***, only where the press consults the channel's
  library: the newest room and 40,000 tokens — about three hours, Rodrigo's
  number — in full, and past that each filed segment one line: hours, who
  spoke, document. Unfiled segments stay in full under the old 90,000. A
  press asked again without noesis gets the whole *Record*
  (`composeLibraryRecord`, `ClaudeResponder.consult`).

## Deleting

Agreed at the prompt: **what a channel library holds goes as recordings do, a
week after it was deleted**, and the privacy policy's *Deleting things* already
says so of everything. The card tells the members it can be recovered for those
seven days.

- **A deleted channel's library** is closed at once — noesis is told nobody
  belongs — and deleted whole at noesis by the hourly sweep a week later,
  before the row that names it (`channels.library_cleared_at`), as audio goes
  before its recording.
- **A deleted recording's document**, where its segment was filed from the
  recording's transcript (`segments.filed_file`), the same way, before the
  recording's row. A segment kept as text too was filed from its live lines,
  which deleting the recording leaves.
- **`ts library-orphans`** clears what the sweep could not, and any library at
  noesis that no channel names, and marks the rows.

## To ship it, in this order

Each verb Rodrigo's to say: land and deploy noesis — its `titles` and
`&file=` since 2026-11-07, which The Floor does without where noesis is older; mark the client on
`commons` (`scripts/client_libraries.py thefloor https://thefloor.rvanegas.co`);
land and deploy The Floor; then set `CHANNEL_LIBRARIES` and `ts env-push`,
which turns filing on.

# A channel chooses which of its owner's libraries

Raised the same day as `2026-11-01-each-account-connects-its-own-mdc-library.md`,
before any build carried its card: an mdc account keeps several libraries,
mdc's tools default to one only when there is one, and The Floor cannot pass a
tool argument — Claude makes the calls inside Anthropic's request. So a person
with two libraries would have had every lookup fail with *name a library*.

## What Rodrigo decided

- **The grant is for all of a person's libraries**, unchanged at mdc's sign-in.
- **Consent is per channel, a toggle per library**, on *Channel Settings*.
- **claude.ai does the comparable thing in conversation**: the person names
  which libraries to draw from in the prompt; mdc's `guide` lists theirs, and
  a search without one tells Claude to ask (mdc `9c2760c`).

## What was built

- **mdc enforces the selection**: a request's address may name the libraries
  it reads, `/mcp?libraries=<id>,<id>`, and mdc opens those and no others; a
  search spans them all and labels each result, a read names its library.
  `/me` lists a person's libraries.
- **`ChannelState.libraries`**, the switcher's chosen ids, sorted, beside
  `libraryOwner`; persisted. A press sends them in the MCP URL; none chosen
  consults nothing.
- **`SET_LIBRARY` carries an optional `libraries`.** A new build sends the
  set; an older build's one switch gets the owner's only library, or none of
  several — it cannot show what it would consent to. Somebody else's switch
  on over a library already on is refused by name (`conflict`).
- **Each connection keeps the list mdc gives**, read again whenever *Floor
  Settings* or a channel's card asks. A library deleted at mdc drops out of
  every channel, and a channel left with none goes off. **A library made at
  mdc is added nowhere** until toggled on.
- **The card**: your libraries as toggles — the first on makes the channel
  consult yours, the last off switches it off; somebody else's on is a
  readout of whose and which, with *Consult* to turn it off; not connected,
  the one grey switch and its sentence. *Floor Settings* lists the connected
  libraries.

## Not built

- **Several owners' libraries in one channel.** One owner at a time; another
  switches it off first.
- **Choosing at mdc's sign-in**, which was proposed and set aside for the
  above: consent belongs in the room it reaches.

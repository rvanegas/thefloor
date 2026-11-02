# Several people's libraries in one channel

`2026-11-01-a-channel-chooses-which-of-its-owner-s-libraries.md` set this
aside — *one owner at a time; another switches it off first* — and Rodrigo
took it up the same day, before any build carried the per-library toggles.
Nothing outside The Floor imposed the limit: the Messages API takes an array
of MCP servers, each with its own token, and each mdc grant already reaches
only its own person's libraries.

## What was built

- **`ChannelState.libraries` is a map, owner to their chosen ids**, sorted,
  never an empty list; `libraryOwner` is gone. `library` is on exactly while
  the map names somebody. `withLibraries` in `core/channel.ts` is the one
  place that sets an owner's entry, for the reducer and for the server's
  disconnect and prune sweeps.
- **`SET_LIBRARY` on sets the switcher's own entry**, beside anybody else's;
  none removes theirs. **Off names an `owner`** to stop theirs, or no owner
  to stop everybody's; either is anybody's who may edit the channel. The
  `conflict` refusal is gone.
- **A press hands Claude a server per owner present**, `mdc`, `mdc-2`, …,
  each with that owner's token and their `?libraries=`. One owner's prompt
  is the words it always had; several get `librariesRule`, which says whose
  each library is by display name and id — mdc labels every result with its
  library — and asks a reply to say whose writing it quotes.
- **Leaving, disconnecting and deleting the account each take one person's**
  and leave everybody else's.
- **The card** shows each other owner's as a readout with its own switch to
  stop it, and yours as toggles beneath, whether or not anybody else's is on.

## Deliberately not built

- **No shim for builds 392 and up.** Rodrigo's call: everybody on them
  updates at once. Such a build reads `libraries` as a list, so its *Channel
  Settings* fails while any library is on in that channel, and its switch is
  refused for naming no libraries. This server and the build carrying the new
  card go out together.
- **No migration of rows written under one owner.** A row whose `libraries`
  is the old flat list restores as off; its owner switches it on again.

## Not yet known

- **Whether the connector minds two servers listing the same tool names.**
  The documentation requires unique server names and shows two servers in
  one request, but says nothing of identical tool names across them, which
  two mdc servers always have. The first press with two owners on the box
  settles it; if it is refused, the fallback without libraries answers, and
  the log names mdc.

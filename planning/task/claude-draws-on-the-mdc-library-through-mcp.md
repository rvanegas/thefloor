# Claude draws on the mdc library through MCP

**Built, and not yet shipped.** What it is and why each part is as it is:
`decision/2026-10-27-claude-consults-its-owner-s-library-channel-by-channel.md`.
This file is what remains, and is deleted when it is done.

## To ship it, in this order

Each verb is Rodrigo's to say.

1. **Land** the branch.
2. **Deploy** the server, with `MDC_TOKEN` still unset. Nothing changes for
   anybody until the token is there, and `/privacy` has to say what a library
   press sends before one can happen.
3. **Mint the token** on `commons` — mdc's `scripts/add_token.py rodvandur`,
   note "The Floor" — and put `MDC_TOKEN` and `MDC_IDENTIFIERS` (Rodrigo's
   sign-in address) in `~/.config/thefloor/server.env`; `bin/env-push`, then
   `bin/restart-services`. The startup log's `library` line names the URL and
   owner, never the token.
4. **Upload** a build carrying the *Library* card. Until a phone has it, the
   switch can be set by nobody; a server that has the token and no client
   offering the card changes nothing.

## To check on the box, once it is on

- **What an unreachable mdc produces.** Built for both — a failed request,
  retried without the library; or a 200 whose lookups errored, answered
  around — and not verified, the live API being out of reach where this was
  built. Stop mdc deliberately, press once on Pro in a channel with the
  switch on, and read the server log for the warning naming mdc.
- **Whether lookups happen where they should.** On Pro, three presses in a
  channel whose Record touches something in the library and three in one that
  does not, both switched on; then `bin/usage transcripts`, the *library*
  section — `looked`, `avg_calls`, `avg_in`, `timed_out`. Lookups in the
  second channel mean the prompt's "only when relevant" is not holding, and
  the switch is the remedy rather than something to tune.
- **Latency.** Against the two-minute timeout; `timed_out` in the same
  section.

## Left for later, deliberately

- **Naming the library** (`MDC_LIBRARY`, passed on every tool call). Today
  mdc selects the token user's only library; the day `rodvandur` has a
  second, every library press fails with *name a library*. Optionally also
  scope the token to one library on mdc's side.
- **Keeping a conversation in the library**, or its digest
  (`a-digest-of-each-call-and-of-the-channel.md`) — by an export and
  `mdc import`, as mdc chose for claude.ai, and after everybody in it has
  agreed; not by a write per turn.

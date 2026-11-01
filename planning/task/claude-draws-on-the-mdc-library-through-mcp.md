# Claude draws on the mdc library through MCP

**Built, and not yet shipped.** What it is and why each part is as it is:
`decision/2026-10-27-claude-consults-its-owner-s-library-channel-by-channel.md`.
This file is what remains, and is deleted when it is done.

## To ship it, in this order

Each verb is Rodrigo's to say. Since 2026-11-01 each account connects its own
library (`decision/2026-11-01-each-account-connects-its-own-mdc-library.md`);
the server with `MDC_TOKEN` was deployed 2026-10-31 and the *Library* card is
in builds 392 and up, so this replaces a live setup.

1. **Deploy mdc** with its client registration (landed 2026-11-01 as
   `0c622a2`).
2. **Register The Floor** on `commons`:
   `docker compose run --rm -T mdc python scripts/add_client.py thefloor --name "The Floor" --redirect https://thefloor.rvanegas.co/mdc/callback`,
   its two lines straight into `~/.config/thefloor/server.env` without being
   printed; remove `MDC_TOKEN` and `MDC_IDENTIFIERS` there; `bin/env-push`.
3. **Land and deploy** this branch (`mdc-connect`), then
   `bin/restart-services` if the deploy did not restart with the new env. The
   startup log's `library` line names the URL, client and callback.
4. **Revoke the old token**: its `users.toml` line on `commons`, note "The
   Floor".
5. **Upload** a build carrying the *mdc library* card. Until then nobody can
   connect, and the switch is refused to everybody with the sentence pointing
   at Floor Settings — which a build without the card cannot follow.
6. **Connect** from that build as `rvanegas@gmail.com`, and switch the
   library on again where it was on.

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

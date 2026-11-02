# Each account connects its own mdc library

The *Library* switch (`2026-10-27-claude-consults-its-owner-s-library-channel-by-channel.md`)
consulted one library, Rodrigo's, through one bearer token on the server
(`MDC_TOKEN`), and only the addresses in `MDC_IDENTIFIERS` could turn it on.
Since this change **every account may connect its own**, on *Floor Settings*,
by signing in at mdc — and a channel's switch consults the library of whoever
turned it on. What remains to ship it is
`task/claude-draws-on-the-noesis-library-through-mcp.md`.

## Why, and what was decided elsewhere

Decided in rvanegas-site on 2026-11-01, weighing a unified identity for The
Floor, Roxana and mdc: **no shared identity across the projects.** mdc is the
identity for its libraries, with open sign-up by emailed code, and another
application reaches a person's library only through an OAuth grant from mdc
(PROJECTS.md, *Shared rules*). claude.ai's connector already worked that way;
The Floor became the second client. A Floor account and an mdc account are
two accounts, linked only by the person signing in at mdc from *Floor
Settings*; neither project knows the other's addresses are the same.

## What was built

- **The Floor is a confidential OAuth client of mdc**, registered by mdc's
  operator (`scripts/add_client.py`, mdc `0c622a2`), its one redirect
  `https://thefloor.rvanegas.co/mdc/callback`. `MDC_CLIENT_ID` and
  `MDC_CLIENT_SECRET` replace `MDC_TOKEN` and `MDC_IDENTIFIERS`, which are
  read only to say they are ignored.
- **`server/src/mdc.ts`**: the authorization code flow with PKCE, begun by
  `POST /me/mdc/connect` and finished at `GET /mdc/callback`, whose state
  names the account since the browser carries no session; `GET /me/mdc` for
  the card; `POST /me/mdc/disconnect`. mdc's `/me` (any client's token, since
  mdc `0c622a2`) says whose library it is, which the card shows.
- **The refresh token is sealed** with a key derived from the client secret,
  so a copy of the database reaches nobody's library, at the price that
  rotating the secret disconnects everybody. mdc rotates refresh tokens, so
  one account's refreshes are serialised; a refused refresh drops the
  connection, an unreachable mdc keeps it.
- **`ChannelState.libraryOwner`**, set by the reducer to whoever switched the
  library on and cleared when it goes off; persisted with the channel. A press
  consults that account's library only while they are a participant —
  leaving takes the consent with them without anybody having to act.
- **On is the owner's consent; off is anybody's** who may edit the channel,
  which withdraws and exposes nothing. `mayChangeLibrary` became per channel
  for that: true for everybody while it is on.
- **Disconnecting, and deleting the account, switch it off everywhere** and
  revoke the grant at mdc, best effort.
- **The card** on *Floor Settings* opens mdc's sign-in in the system browser
  rather than an in-app one, so no native module and no new build were needed
  for the plumbing; the callback sends a phone back with `thefloor://mdc`, and
  the card reads the status again whenever the app returns to the front, the
  one signal the web app's tab also gives.

## Deliberately not built

- **No migration of channels switched on under `MDC_TOKEN`.** They carry no
  owner, consult nothing, and read as on until somebody switches them off or
  on again — two taps for the one person who had any.
- **Naming which of a person's libraries to use.** mdc still picks the
  caller's only one; somebody with two libraries gets *name a library* on
  every press, as the 2026-10-27 entry foresaw.
- **An in-app browser** (`expo-web-browser`): a native module, so a build;
  the system browser and the scheme do the same job.

## The wire

Unchanged for builds 392 and up, which draw the switch: `libraryAvailable`
and `mayChangeLibrary` mean what they said, and the refusal they show for
somebody without a library is the server's sentence. Only the card is new,
and it needs a build.

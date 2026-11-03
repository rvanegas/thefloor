# noesis registers every username and address pair

Agreed 2026-11-02, with sign-in left as it is. The Floor keeps its own emailed
code (`/auth/request-code`, `/auth/verify`) and its own screen; what it gives
up is the say over **names**. noesis holds one register of username ⇄ address
pairs for people across both applications, and **when The Floor registers
somebody, noesis is the source of truth.** The point is that a Floor account
and the noesis account behind its library are visibly the same person: same
address, same `@name`. Follows `decision/2026-11-01-each-account-connects-its-own-mdc-library.md`,
whose "no shared identity" rvanegas-site `a413864` reversed the same day for
Roxana.

## What noesis does

- **A pair is a reservation until its owner first signs up at noesis.** It
  behaves as though that person has no account — no library, no `/me` — but
  the address and the name are both taken: nobody else may hold either, and
  when the owner does sign up at noesis directly, the account comes into being
  under the reserved name instead of one derived from the address.
- **One endpoint for confidential clients, with the client's own credentials**
  rather than anybody's grant: given an address, return its username — the
  account's, the reservation's, or a new one derived and reserved now. A
  second asks for a particular name for an address, and refuses one held by
  another address. The Floor is the first client; Roxana signs in through
  noesis and needs neither.
- **Its own name derivation avoids reserved names** as it avoids taken ones.

## What The Floor does

- **Sign-up asks noesis for the name** and stores what comes back, where today
  `core/derivedNames.ts` makes one. The display name stays The Floor's alone.
  **noesis unreachable means a new account cannot be made**; signing in to an
  existing one never touches noesis. That is the price of noesis being the
  source of truth, accepted deliberately, rather than a provisional name
  reconciled later.
- **Changing the username on the Contact screen asks noesis first.**
- **Connect refuses a noesis account whose address is not the Floor
  account's**, at `/noesis/callback`, where `/me` already gives the address.
  With the register in place that is the only way the two can disagree.
- `core/username.ts` and noesis agree on one rule — the common ground is
  lowercase letters, digits and `_`, four to thirty, compared without case;
  noesis stops issuing `-`, and its derived names respect the floor of four.

## Renames work on both sides

Decided 2026-11-02: a person renames themselves at either end and both follow,
whether the pair is a reservation or a real noesis account.

- **noesis renames the pair**, whichever end asked. For a reservation that is
  the register alone. For an account it is what `rename_user.py` does today —
  accounts.db, the OAuth grants (which keep working under the new name), the
  libraries' directory and so every library id `<user>/<library>` — made a
  self-service operation instead of an operator's script, and refused while a
  run holds one of the person's libraries.
- **A rename at The Floor** (the Contact screen) asks noesis, and writes the
  Floor username only once noesis has accepted it.
- **A rename at noesis has to reach The Floor**, which today it cannot: an
  account that never connected has no grant to read `/me` with. So noesis
  tells its confidential clients — a signed call to each, naming address, old
  name and new — and The Floor renames the account it holds under that
  address; a connected account's `/me` on refresh is the second check.
- **What The Floor saved under the old name follows.** The library ids in
  `noesis_connections.libraries` and in each channel's chosen libraries hold
  `<old>/<library>`; `rename_user.py` currently lists them for somebody to
  choose again, and this replaces that with a rewrite on The Floor's side.
- **The old Floor username keeps answering as an invite link** —
  `/i/<old>/<pin>` reaches the renamed person — since a rename otherwise
  breaks every link they handed out. Whether the old name stays reserved
  against anybody else, and for how long, is the same question at noesis.

## Open

- **Reconciliation of what exists**, before either end enforces anything. A
  script first, counting: Floor accounts whose address has a noesis account
  under another name; Floor usernames held at noesis by another address;
  noesis names The Floor's rule refuses. Where noesis wins, a Floor username
  changes — and **a username is an invite link** (`/i/<username>/<pin>`,
  `decision/2026-09-25-an-invite-link-is-a-standing-door.md`), so every link
  that person handed out stops working unless the old name redirects.
- **Accounts that sign in by phone**, if `task/sms-authentication.md` ships,
  have no address to pair.
- **The wire.** Sign-up and rename refusals are server sentences the app
  already shows, so this may need no build; check before promising that.

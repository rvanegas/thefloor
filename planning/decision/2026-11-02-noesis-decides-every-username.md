# noesis decides every username

Agreed at the prompt on 2026-11-02, with sign-in left as it is: The Floor keeps
its own emailed code and its own screen, and gives up the say over **names**.
noesis keeps one register of username ⇄ address pairs for people across the
applications it serves, and **when The Floor registers somebody, noesis is the
source of truth.** A Floor account and the noesis account behind its library
are then visibly the same person — the same address, the same `@name` compared
without case. Follows `2026-11-01-each-account-connects-its-own-mdc-library.md`,
whose "no shared identity" rvanegas-site `a413864` reversed that day for
Roxana. Built on noesis's branch `names-register` and this one.

## What noesis does (`noesis/names.py`)

- **A pair is an account's or a reservation's.** Somebody The Floor signed up
  who never signed in at noesis has a reservation: name and address both
  taken, nothing else existing — no account, no library, no `/me`. Their first
  sign-in there makes the account under the reserved name.
- **`/names` answers a client the operator marked** (`scripts/client_names.py`,
  with the hook it is told at), by its id and secret as HTTP Basic, on
  nobody's behalf: `POST` an address's name, reserving one from the suggestions
  or the address if it has none; `PUT` a name for an address, reserving or
  renaming; `PUT /names/address` moves a reservation, and refuses a noesis
  account's address, which is how its owner signs in there.
- **Names chosen from now on** are four to thirty lowercase letters, digits
  and `_` — what usernames here are, folded — numbered as The Floor numbers.
  Older names with `-` stand until renamed.
- **A rename works from either end**: the web client's *Your names* (`PUT
  /me/user`), the register, the operator's `rename_user.py`. For an account it
  moves the grants and the libraries' directory and so every library id, and
  is refused while a run holds one of them. Every other client that keeps
  names is owed it, POSTed to its hook signed with its secret, and the server
  retries until answered — an account that never connected has no grant to
  notice a rename with, so being told is the only way.

## What The Floor does (`server/src/names.ts`)

- **A signup is named by noesis**, the display name's stem suggested, once the
  code has proved the address. **noesis unreachable means the account is not
  made** (503, the code spent): a provisional name would be one noesis never
  agreed to. Signing in to an existing account never asks.
- **A rename on the Contact screen is made at noesis first**, refused here
  before asking if somebody here holds it, and written here in the case typed.
  **A username can no longer be given up** — noesis has a name for every pair.
- **`/noesis/renamed`** takes noesis's signed renames: the account under the
  address — or holding the old name — takes the new one; a repeat is a no-op,
  and a name somebody here holds is refused (409), which noesis retries.
- **Library ids follow a rename** from either direction: the connection's
  list and every channel's choice (`renameLibraryUser`).
- **An old name still reaches its owner** as an invite or member link
  (`username_aliases`, consulted by `byUsername` only when nobody holds the
  name now; the pin is checked as ever) — for any rename, not only these.
- **Connect refuses a noesis account under another address**, and revokes the
  grant it was given.
- **An address change moves the reservation**, and is refused for an account
  whose noesis account exists, with noesis's sentence.

Refusals are server sentences the app already draws, so no build is needed.

## Turning it on, in this order

1. Deploy noesis; `client_names.py thefloor --hook
   https://thefloor.rvanegas.co/noesis/renamed` on its box.
2. Deploy The Floor. With the client's credentials set, `/noesis/renamed` is
   live; `NOESIS_NAMES` is unset, so nothing yet asks noesis.
3. `bin/export-names > floor-names.tsv`, then noesis's
   `scripts/reserve_names.py < floor-names.tsv` — a plan — and `--apply`:
   reserved where free, and where noesis disagrees The Floor is renamed
   through the hook, noesis winning. Again until every line is `same`; then
   delete the file, which holds every address.
4. `NOESIS_NAMES=on` in `server/.env`, `bin/env-push`, restart.

Off, The Floor derives names as it did, and a rename at noesis is still heard.

## Deliberately not built

- **Releasing a reservation when a Floor account is deleted.** The name stays
  held for the address, which gets it back by signing up again at either end.
- **Changing a noesis account's address.** noesis has no such operation, so an
  account here whose noesis account exists keeps its address.
- **Accounts signed in by something other than an address** (should
  `task/sms-authentication.md` ship) have no pair, and derive names as before.
- **How long an old name answers.** Until somebody else takes it, which noesis
  allows at once; the pin is what keeps an old link from reaching them.

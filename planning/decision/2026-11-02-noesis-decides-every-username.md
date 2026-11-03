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

## Fixed once connected, rather than kept in step

Decided 2026-11-03, after a first version kept renames in step: a rename at
either end reached the other by a signed call, retried until answered, and
library ids were rewritten wherever they were saved. Every way that could
fail — a lost answer splitting the pair, a replayed call undoing a later
rename, a retry nobody saw, a connector URL nobody here can rewrite — was a
reason to make the change impossible instead. So **while a noesis library is
connected, neither the username nor the address changes here**, whether or
not the register is on, and **noesis never changes an account's name or
address** on an application's behalf. Only a reservation changes. Moving
sign-in out of both applications into one module is what would make the
problem go away; until then, being unable to change is the simple rule.

## What noesis does (`noesis/names.py`)

- **A pair is an account's or a reservation's.** Somebody The Floor signed up
  who never signed in at noesis has a reservation: name and address both
  taken, nothing else existing. Their first sign-in there makes the account
  under the reserved name.
- **`/names` answers a client the operator marked** (`scripts/client_names.py`),
  by its id and secret as HTTP Basic, on nobody's behalf: `POST` an address's
  name, reserving one from the suggestions or the address if it has none;
  `PUT` a name for an address, reserving or renaming a reservation;
  `PUT /names/address` moves a reservation. Either is refused for a noesis
  account's.
- **Names chosen from now on** are four to thirty lowercase letters, digits
  and `_` — what usernames here are, folded — numbered as The Floor numbers.
  Older names with `-` stand.
- **The operator's `rename_user.py`** still renames an account, by hand, and
  tells no application: The Floor follows with `bin/rename-users`.

## What The Floor does (`server/src/names.ts`)

- **A signup is named by noesis**, the display name's stem suggested, once the
  code has proved the address. **noesis unreachable means the account is not
  made** (503, the code spent). Signing in to an existing account never asks.
- **A rename on the Contact screen** is refused while a library is connected;
  otherwise it is made at noesis first, refused here before asking if somebody
  here holds it, and written here in the case typed. A username can no longer
  be given up.
- **An address change** is refused while a library is connected — before the
  code is sent, and again at confirming — and otherwise moves the reservation.
- **Connect refuses a noesis account under another address**, and revokes the
  grant it was given.
- **An old name still reaches its owner** as an invite or member link
  (`username_aliases`, consulted only when nobody holds the name now; the pin
  is checked as ever).

Refusals are server sentences the app already draws, so no build is needed.

## How it was turned on, 2026-11-03

1. noesis deployed; `client_names.py thefloor` on its box.
2. The Floor deployed with `NOESIS_NAMES` unset: nothing asked noesis yet,
   though the connected-library refusals applied at once.
3. `bin/export-names`, then noesis's `scripts/reserve_names.py` — a plan, then
   `--apply --renames` — then `bin/rename-users`, a preview and `--write`:
   44 accounts, 5 already matching and 38 reserved. noesis was to win where
   the two disagreed, and did once (`@Golf` became `@arysbatista`, its display
   name kept); the other disagreement went The Floor's way, by renaming the
   noesis account `ambonnel` to `nannick` with `rename_user.py`.
4. `NOESIS_NAMES=on`, `bin/env-push`, restart.

**`NOESIS_NAMES` was then retired**, the same day: it existed to hold noesis
back until the names here were reconciled, and once they were, switching it
off could only hand out names noesis does not know — which is the drift step
3 removed. noesis now decides wherever The Floor's noesis client is
configured; without it, as on a development server, names are derived here.
A noesis outage therefore stops signups rather than creating names to
reconcile later. A box still carrying the setting is told it is ignored.

## Deliberately not built

- **Keeping a rename in step across the two**, as above.
- **Releasing a reservation when a Floor account is deleted.** The name stays
  held for the address, which gets it back by signing up again at either end.
- **Accounts signed in by something other than an address** (should
  `task/sms-authentication.md` ship) have no pair, and derive names as before.
- **How long an old name answers.** Until somebody else takes it; the pin is
  what keeps an old link from reaching them, except the pinless
  `/i/<username>` of 2026-09-25 to 2026-10-15.

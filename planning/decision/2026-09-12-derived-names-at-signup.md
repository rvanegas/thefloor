# A new account is named, and has a username, before anybody types one

2026-09-12.

## What it was

`Accounts.establish` stored `name || id`: a signup that skipped the display
name field was called by its sign-in address, in full, forever. That string is
the one name here that is nobody's — punctuation and a provider, the private
half of an identity, drawn above a claim on the floor to everybody in the room.
And a username was a thing you went and chose, which most people never did, so
most accounts had no *invite link* either: the link is `/i/<username>/<pin>` and
there is no link without the first half.

## What it is

Two derivations, chained, in `core/derivedNames.ts`, applied in `establish` at
the moment an account is created and nowhere else.

The address gives a display name: the local part only, `+tag` and domain
dropped, dots, underscores and dashes read as the spaces they are standing in
for, each word capitalised — `anna.k@example.com` is *Anna K*. Never blank; an
address with nothing before the `@` falls back to the address, which is what
this replaced.

The display name gives a username: folded to lowercase, accents folded rather
than dropped, everything outside letters and digits an underscore, runs
collapsed, edges trimmed — *Anna Kowalski* is `@anna_kowalski`. Lowercase where
the name above it is capitalised, because that is how a handle is written and
case is not part of the identity.

## Why the chain, rather than two derivations from the address

A username derived from the address would be a second rendering of the same
string, and the two would disagree the moment either name was corrected.
Derived from the display name it reads as the same person's handle whether that
name was typed or came from here — which is also why a name that was typed is
used as the stem rather than ignored in favour of the address.

## Uniqueness is the index's answer, not a query's

`deriveUsername` writes candidates and lets the unique index refuse them:
`anna_kowalski`, then `anna_kowalski2`, and so on. A `SELECT` first would be a
race — another signup can take the name between the read and the write — and
there is nothing to gain from predicting what the index will say.

Ten tries, then the account is left with no username. That is not a failure
mode worth engineering against: an account with no username is the ordinary
state of every account created before today, the Contact screen is where one is
chosen, and the eleventh Alice would be offered `alice47`, a handle whose owner's
first act is to replace it. **It must never cost a signup**, which is the whole
of the error handling: only `isUniqueViolation` is swallowed.

A stem below the username floor of four borrows the numbering to reach it —
`Bob` gets `bob1`, `Mei` gets `mei1` — rather than being padded with an
underscore, which is a character nobody chooses at the end of their own name.

## What is deliberately not done

**A rename does not re-derive the username.** By the time somebody corrects
their name, an invite link built out of the old handle may be in somebody
else's hands, and a handle that moves under its owner is worse than one that no
longer matches the name above it. The username is editable on the Contact
screen; that is the way it changes.

**Nothing is backfilled.** Accounts that predate this keep whatever they have,
including the address-as-name, and an account whose owner cleared the username
field does not get one handed back at the next sign-in. Backfilling would
rename people without asking, and a derived name is a suggestion.

**No segmentation and no LLM.** `jsmith@example.com` becomes *Jsmith*, not
*J Smith*, and `annakowalski` stays one word: the only word boundaries used are
the ones the address actually spells. Guessing at the rest is a network call, a
cost per signup and an unpredictable answer, in exchange for improving a string
its owner can retype in one field. Capitalisation is the same trade — *Mcdonald*
and *De Vries* are wrong and are wrong visibly, which is the kind of wrong
somebody fixes in a second.

## Consequences

- Every profile of an account created from now on carries a `username`, so
  tests asserting a whole profile shape gained the field, and the two that
  needed *an account with no username* now clear it explicitly — which is
  itself worth knowing: that state is reachable only on purpose.
- The `username` rung of the *introduction* ladder is born ticked for new
  accounts. It stays, because accounts predating this still need it, and a
  ticked rung is honest. **Reversed the following day**: the cohort that
  predates this and can still see the ladder is empty in practice and closed
  for good, so the rung — and the *say who you are* rung above it — went. See
  `2026-09-13-the-checklist-is-two-rungs.md`.
- No wire change and no migration. The column, its unique index and every route
  are as they were; what changed is what is written into a new row.

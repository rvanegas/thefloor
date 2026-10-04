# The accept route says whether a username exists

`POST /contacts/invite/accept` refuses an unknown username differently from
every answer it gives a held one, so a signed-in account can learn whether a
username is held.

Recorded 2026-09-25 with
`decision/2026-09-25-an-invite-link-is-a-standing-door.md`, which made the
page stop leaking and left this. Corrected 2026-10-03, when a review found the
budget did not bound it.

## How much it gives away

**The budget does not bound it, contrary to what this said until 2026-10-03.**
The route looks the username up and refuses an unknown one before
`acceptInviteLink` runs, and `link_accepts` is spent only inside that. So:

- **An unknown username costs nothing**, any number of times.
- **A held one, under budget, is accepted** — the pair become contacts, the
  owner is told, and the answer carries their display name. Loud, and the
  standing door working as designed rather than a leak.
- **Once the day's twenty are spent**, a held username answers `too_many` and
  an unknown one `unknown`, free and without limit until the window lapses.
  That is the oracle: twenty real acceptances buy a day of silent lookups.

**The page is clean.** `GET /i/:username` reads nothing, so a real username and
an invented one render identically.

**What it yields is still thin**: that a username is held, which
`core/username.ts`'s rule about names being *looked up* does not quite reach.

## Why it is not guarded

**A per-route fix exists and was set aside on 2026-10-03** — checking the budget
before the lookup, so that an exhausted account is told `too_many` whatever it
names. It would work. The direction chosen instead is
`task/watch-every-route-for-excess-instead-of-guarding-each-one.md`: one walk of
usernames is a run of `unknown`s from one account, which a monitor over every
route sees without this route having to know it leaks.

**Making the refusals agree is still worse for the person who mistyped.**
Answering an unknown username like a success tells them it worked; answering it
like the budget tells them to come back tomorrow.

## What would change the arithmetic

- **A username becoming worth enumerating**, the same trigger as
  `a-standing-door-has-no-lock.md`. Then the guard above is wanted whatever the
  monitor says, since a monitor only notices after.
- **The monitor not being built.** Then this is unwatched as well as unguarded,
  and the per-route fix is the cheap one.

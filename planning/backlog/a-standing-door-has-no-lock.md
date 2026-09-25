# A standing door has no lock

**Nothing refuses a contact, and nothing can.** An invite link is
`/i/<username>` and is permanent — `decisions/2026-09-25-an-invite-link-is-a-standing-door.md`
— so anybody who has the link, or who learns the username it is made of, can
become that account's contact and stay one. `removeContact` is the only
remedy: it is after the fact, and it is repeatable by the other person the
moment it is used.

**Deferred on purpose on 2026-09-25, at the prompt, and recorded because it is
a genuine flaw rather than an accepted cost.** The judgement was that it is a
feature in its own right rather than part of the change that exposed it, and
that the population does not yet make it urgent.

## Why it is not urgent yet, and what changes that

The door is only worth walking through if there is something behind it. On a
base this size, somebody who wanted to reach a user could as easily reach them
anywhere else, and every account here arrived through somebody it already
knows — `bin/growth` walks that forest and planning/GROWTH.md has the numbers.

**Revisit when growth picks up**, which was the stated trigger. The specific
things to watch, none of which is a count of accounts on its own:

- a username appearing somewhere public — a bio, a profile elsewhere, a podcast
  page, `planning/MARKETING.md`'s own plan for links in signatures is the point
  at which handles stop being handed over and start being *found*
- an account accumulating contacts it did not expect, which today nothing
  measures and nothing reports
- the first person who asks for it, which is the honest trigger and the one
  that will arrive without warning

## What the shape of it probably is

Not designed, and this is a sketch rather than a plan:

- **A refusal that survives removal.** The thing missing is not *remove* but
  *stay removed* — an edge that refuses to be remade. `contacts` has the pair
  and a state; a third state, or a separate table, would be where that lives.
- **It has to cover the link and the address both.** Blocking that a fresh
  email invitation walks around is not blocking. `requestContact`,
  `acceptInviteLink` and `resolveInvitesFor` are the three writers.
- **And the pair channel.** Becoming contacts makes a channel; unmaking it
  leaves one, and what happens to a channel with a conversation in it is the
  question that makes this bigger than a flag.

The cheap half, worth having even before the rest: **a way to stop handing out
the link at all** — an account that could retract its own door would have a
remedy that does not depend on a feature nobody has built.

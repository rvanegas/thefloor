# The roster is the members tab

2026-09-14. The channel screen's first tab is called *Members*. It was called
*Roster* from the day there were tabs, and the word is now gone from every
surface a user can reach.

## Why the old name had to go

*Roster* was the only tab named after a container rather than after the people
or the object it holds. *Notepad*, *Player*, *Recordings* and *Watch* each name
their contents; *Invite* names the act. *Roster* named the list itself, which
is the one thing a reader already knows they are looking at.

Worse, it was a word the application said in exactly one place. Nothing else a
user reads — no invitation, no notification, no settings line, no guest screen
— uses it. The guest-facing half of the app has always said *member*: a guest's
screen labels everybody else as either a member or a guest, and since
2026-09-02 a signed-in reader is told *channel member* on the contact screen
too. A tab teaching a ninth word for people, used nowhere the app answers in,
was the vocabulary working against itself.

## The objection, which is real and was overruled

**The tab draws more than members.** Under the participant cards it renders
whoever is *knocking* and every *guest* holding a seat. *Member* is defined in
GLOSSARY.md as a user with an account who belongs to a channel — the
guest-facing word for *participant* — so the new name is strictly narrower than
the contents, and *Roster* was not.

It was taken anyway, on two grounds. A guest is a visitor to a membership
rather than a second kind of it — a seat has no roster, no recordings and no
history — so the heading over a list of people saying whose room it is describes
the room correctly even when a visitor is standing in it. And the alternative
was to keep a word the app never otherwise says in order to protect a precision
no reader was asking for: *Roster* was neutral about who the room belongs to,
which is not the same as being accurate about it.

**The cost is a word now doing two jobs**, and the glossary says so in both
entries rather than pretending it does not. *Member* the term still picks out
exactly the set `isParticipant` guards; *Members* the tab is signage. Every
guard that must refuse a guest was already written as `isParticipant` and none
of them moved, so nothing in the rules depends on the looser reading. **If a
guard is ever written against the tab's name rather than against
`isParticipant`, this is the entry that explains why it is wrong.**

## What it cost to do

Almost nothing, which is itself the finding. `'roster'` was a `ChannelTab`
union member and never left the process: not a wire field, not a storage key,
not a deep link. The server's `roster` identifiers in `media.ts` and
`channels.ts` are a different sense of the word entirely — a map of LiveKit
audio tracks — and were deliberately left alone.

`channelRoster.test.tsx` is now `channelMembers.test.tsx`, a test file being
named after the tab it exercises; the two live comments pointing at it moved
with it, and the two decision entries that name it did not, being history.

So there is no shim and no SHIMS.md entry. A client and a server of any two
builds still agree, because neither ever told the other which tab was showing.

## What was deliberately not renamed

- **The common noun.** Four hundred-odd comments and decision entries say *the
  roster* for the list of people, and `planning/decisions/` is dated history
  that is not rewritten. The proper noun moved; the English word did not.
- **`segmented.test.tsx`'s fixture**, which models a tab bar generically and
  still carries *Invite links*, renamed 2026-09-13. It is arbitrary data for a
  component that does not know what a channel is.
- **`planning/NEAR.md`**, a dated model note whose *Roster display* lines
  belong to a vocabulary — *away*, *stand by* — that was never built.

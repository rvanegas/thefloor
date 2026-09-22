# 2026-09-22 — A page nobody was told about

A member of a public channel is told, once, that it has one. The card sits
above the *channel tabs* until they press *Got it*; `public_notices` in db.ts
is the row, `owesPublicNotice` in publication.ts decides who is owed one, and
the snapshot carries the answer per reader.

**It gates nothing.** The page is up either way, the feed answers either way,
and whether a channel is public remains any member's decision.

## What was wrong

Publication shipped with one bar and it is the right one: any member may make
the page, because making it publishes nothing. Every recording on it is a
separate, unanimous decision by the people whose voices are in it, and that is
what protects somebody from being broadcast.

What it does not protect is anybody's *expectations*, and there the feature
had a hole that was invisible from inside it. The decision to be public was
observable in exactly one place — the *Publishing* card on the channel
settings screen — and reached the other members through nothing at all. No
notification, no card, no line anywhere they would pass. A member who was
there when it happened would have to open a screen most people never open; a
member added the following month arrived into a settled fact with no moment at
which it was ever put in front of them.

Which was raised at the prompt as the third of three: *new members consent to
public channel if they join after channel is made public*.

## Why it is a notice and not a consent

The word in the request was consent, and the thing built is not one. That is a
deliberate departure and the reason is worth keeping.

**A consent has to be able to refuse.** The version that answers to the name
is: every member's standing agreement, withdrawn by any one of them, the page
coming down when somebody says no. That is coherent — it is the shape
`recording_consents` already has — and it was rejected because of what it
hands one person. A channel of six where one member is unreachable, has
stopped using the app, or simply never taps is a channel whose page can never
go back up; and one member alone could take down a feed with subscribers on
it. Recording-level unanimity has the same property and is worth it there,
because what is at stake is one conversation and somebody's own voice in it.
Here what is at stake is the channel's whole public face, and the person
objecting has not been recorded saying anything.

**And the thing a consent would protect is already protected.** Nothing of a
new member's goes onto the page unless they agree to that recording
themselves, per recording, with everybody else in it agreeing too, and any one
of them able to take it back. No member is named on the page, ever. So a
member who joins a public channel and publishes nothing is exposed by it in no
way at all. What they lacked was not a veto. It was being told.

**A card offering a choice that changes nothing is worse than no card**, which
is why this one has a single button and no pair. STYLE.md's rule — a pair of
buttons is an answer in force — would have made a veto look available, and the
tap that failed to deliver it is how somebody learns the interface was lying.

## The shape, and the four things decided in it

**Whoever turned the switch on is not told again.** They answered a
confirmation carrying the same words a minute earlier, so `setPublic` writes
their row as it flips the column. A card explaining to somebody what they have
just deliberately done is how a notice becomes wallpaper.

**Everybody else is owed it, not only members who joined afterwards.** The
request named new members, and restricting it to them would have needed a join
timestamp that this system does not keep — membership lives in the reducer's
`participants`, with no date on it. It would also have been worse: a member
who was in the channel when somebody else turned the switch on was told
exactly as little. The absence of a row is the debt, which covers both without
knowing when anybody arrived.

**Going private clears every row.** A channel that comes back is a new fact
about where these conversations can be read — months later, possibly with a
different roster — and an acknowledgement from the previous time would silence
the card for everybody who was there then.

**The row is on the account, not the install.** The *getting-started* card
dismisses per device, correctly: it records that a screen has been read. This
records that a person has been told, so it follows them to their other phone,
and an account deleted and remade is owed it again. `deleteAccount` clears the
rows, for the opposite reason to the consents beside them — nothing stands on
these, and they go only because they name somebody.

## What is deliberately not built

**No screen says who has read it.** The field is computed per reader and
nothing aggregates it. A roster of who had acknowledged the page would be read
as a roster of who had agreed to it, and nobody has been asked to agree —
which is the same confusion this entry has been at pains to avoid everywhere
else.

**No notification.** It is a fact about a channel, not an event that wants
somebody's attention now, and it will be seen the next time they open the
channel — which is the moment it is relevant. A push saying a channel has been
made public would arrive as an alarm about something nobody needs to act on.

**Nothing is gated on it.** No refusal anywhere consults this table. It was
tempting to hold the *page* until every member had at least seen the card, and
that is a veto wearing a notice's clothes: the unreachable member takes the
page down by not opening the app.

## The other two of the three, which were dropped

The same conversation asked for a slug URL (`/c/<slug>` derived from the
channel name), and for the name to be frozen while a channel is public, with
private → rename → public as the way round it and unanimity to come back.

**Dropped at the prompt, and the reason is that they were one item.** The name
freeze exists only because a slug makes the name an address; the private-and-
back dance exists only to route around the freeze; the unanimity was needed
only to make that dance safe. Without the slug, none of the three has a
premise — and renaming a public channel stays untouched, which is what
`2026-09-22-only-a-named-channel-can-be-public.md` already concluded.

What the slug would have bought is readability when a URL is spoken or
printed. Nobody types these: they are tapped from the *directory page*, copied,
or reached through a podcast client's own search. What it would have cost is
that a channel's address becomes a name, and names move and get reused — so
the id has to stay canonical in the feed's `<link>`, its `rel="self"` and every
`<enclosure>` regardless, those being the three strings that leave our control
the moment a client stores them. A readable alias is additive and can be added
whenever a channel turns up that wants one.

## Tests

`server/__tests__/publication.test.ts` § *telling the members there is a page*,
and `app/src/ui/__tests__/publicNotice.test.tsx`.

The server's assert who is owed it and who is not, that acknowledging is
idempotent, that a channel coming back asks everybody again, and — the one
that is about the design rather than the mechanism — that the page and the
feed answer perfectly well while a member has been told nothing. The app's
assert the words, because the words are the only thing standing between this
and somebody believing they have been handed a veto.

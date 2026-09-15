# The two dabs are not symmetrical

*2026-09-15.* The task — `tasks/red-badge-on-contacts-tab.md`, now deleted —
asked for two marks on Home's switch in two sentences: a red badge on *Contacts*
if there are requests to answer, or one on *Support* if there are newly answered
questions. They read as one feature with two inputs. They are two different
mechanisms, and everything below is that difference.

## Contacts remembers nothing, and must not

`HomeView.contacts` is already on the snapshot and every row carries a `status`.
A request to answer is `status === 'incoming'`, so the mark is a pure view of
live state: it arrives with the request over the socket and leaves the moment the
request is accepted or declined. There is nothing to mark as seen, and therefore
nothing that can be left showing a mark for something already dealt with.

**It is deliberately narrower than the list it sits above.** `ContactsView`'s
*Requests* section is `status !== 'accepted'` — everything outstanding, in both
directions — which is right for a section whose job is to say where things stand.
Drawing the mark from that count was the obvious move and is wrong: an outgoing
request is one only the other person can answer, so the mark could not be cleared
by tapping through and would sit there until somebody else acted. The one state
this interface must never be in is asking for attention it has nothing to do
with. So `answerableRequests` is exported from `ContactsView` — the way
`nearbyChannels` is exported for Home's bars — and the tier does not get to
answer "what is there to do" a second time.

## Support has to remember, because an answer stays answered

`HelpView` fetches on open and holds nothing, which is right for a screen whose
contents are written by hand at a moment no client can be told about. Home
therefore knew nothing at all, so the snapshot gained
`HomeView.helpAnsweredAt` — the newest answer the server holds, or null — from a
new `Help.lastAnsweredAt`. Optional, for the reason `tried` is: an old server
sends no key and the client reads absence as nothing to say.

That alone cannot raise a mark, because an answered question is answered for
ever. So this half has a watermark on the device,
`thefloor.help.seenAnsweredAt`, written when the screen loads. **A watermark
rather than a set of seen ids**, and that is what keeps it honest against
`HelpView`'s own long argument that it has no unread count: one number can say
*something came back since you last looked* and cannot say which question, so
nothing inside that screen gains a mark.

The watermark is taken off the rows that were on screen rather than off the
clock. `Date.now()` would mark as read an answer written between the fetch and
the write, and that answer would then be invisible for ever — the one failure a
watermark has that a set does not. Off the rows, the worst case is a mark that
survives one reading, which the next one clears.

**It cannot be instant, and the task did not need it to be.** `bin/help publish`
writes the row through `bin/db --write`; this process is never told, and says so
in its own header — "Publishing an answer here changes a row and reaches no
phone." So the mark appears on the next home snapshot. That is the same contract
`bin/help` already states, one screen earlier, and pushing it live would mean the
CLI going through the server, which is a different piece of work.

## Why it is a dab and not a dot

A dot beside a label is a status light: a thing reporting, which you read and
move on from. The mark wanted here says *attend to this, though it can wait a
beat* — so it is larger than every mark in the interface, 16 × 11 at
`radius.pill`, and it is laid over the trailing end of the label rather than
parked beside it. A shape slightly in the way of a word is a thing asking.
Clipping the upper corner of the last glyph or two is as far as that goes: the
word is still read at a glance, so it asks without insisting.

It is positioned against the label's own box rather than the segment's, so it
follows the word's width and needs nothing measured. `Segmented`'s `badge` takes
the **words a screen reader is given**, not a boolean: the mark obscures part of
a word, and one that does that while announcing nothing costs a screen reader the
tab and gives it nothing back. Presence draws it, so the two cannot come apart.

Never a count, on both tabs: see above for why neither number is one a tab can
state honestly.

## The palette gained a hue, which is the part that cost something

Red was the obvious colour and `danger` was the obvious token, and `danger` is
wrong. Measured, `danger` is H 4 S 77 V 94 while the two accents a dab sits
beside are `floor` at S 64 V 100 and `nearby` at S 45 V 91 — **saturation is what
makes a red read as an alarm here, not hue.** A contact request and an answer
come back are both good news arriving slightly inconveniently, and a mark in
`danger`'s red reports a fault in an app that has none.

So `waiting` takes the accents' mean, S 55 V 95, at H 352 rather than red's 4 —
`silenced` holds 20, and rose is the one direction out of red that was
unclaimed. `#F26D7F` dark, `#D1495B` light, the light value being S 65 V 82 on
the same arithmetic against the same two neighbours at that palette's lower
register.

**This is the palette's seventh hue and the first added since the interface was
designed**, so STYLE.md's load-bearing rule 1 had to be amended to admit it
rather than quietly broken. It is not a third token on red's hex the way
`recording` and `danger` are — those are one colour with two meanings, and this
is a colour nothing else holds. The amended rule carries the bar: a new hue needs
a meaning the palette cannot already say, and it is written down there when one
is spent.

## What was not built

**No count, no push, and no marks inside `HelpView`.** Also no second placement:
`thefloor.tabsAtFoot` is a dead key in `AppProvider` and the switch has exactly
one home, so the dab has one geometry to be right in.

# Home grows a Support tab

2026-09-12.

*Help* and *Chip in* — with the *Leaderboard* and the audio bench that sit
beside them — are now the tier's third tab rather than the tail of whichever
list is showing. `/support` in a browser.

## The container was right and the place in it was wrong

These rows were promoted out of `ChannelsView` on 2026-09-01, when Home stopped
being the channel list and became a tier holding two peers. The argument then
was about what they belong to: a request for money and a way to ask a question
are about the application rather than about either list, so they belong to the
frame that holds both. That was correct and is unchanged.

What it did not settle was *where in the frame*. They went to the foot of the
scroll, and the comment they carried defended it: everything above them is what
somebody opened the app to do, and a request for money that sat above that
would be reading the room wrong. That argument says where a thing goes when it
has nowhere of its own. It stops applying the moment it does.

The cost of the foot was small and permanent. A row about the application
waited out every channel or contact somebody had — and it was drawn twice, once
under each list, because being about neither meant it had to be under both. On
an account with forty channels it is not reachable at all without scrolling
past forty things it has nothing to do with.

**A tab does not make any of it louder**, which was the whole worry. It is one
tap from either list, which is what the foot of a scroll is not, and it pushes
nothing down. The order says the rest: Contacts, Channels, Support — last,
after the two indexes onto the people you can reach.

## Both senses of the word, still two sections

The tab is labelled *Support*, which on it means support this project. *Help*
means get support. They stay two sections with Help above, on the reasoning
that put them in separate groups at the foot: one heading over both senses is
how somebody taps *Chip in* looking for an answer. The tab's label being the
money sense is why Help is the section above it rather than a row inside it.

Help is the only unconditional row, which is also what stops the tab ever
coming up empty — the donate link is regional, and the standings and the bench
are granted by hand.

## `List` gained a member and kept its name

`app/src/ui/detail.ts`. It is `'channels' | 'contacts' | 'support'` now, and
the third is not a list. The name stayed because what the type chooses between
is which body the tier is showing, and that is the same question whether the
body enumerates people or not. Renaming it would have touched every call site
to say something the type already says.

`webRoute.ts` takes the third frame with it: fifteen paths where there were
ten, and every one still round-trips. **`/support/support` is one of them and
is not a collision** — the tab, and the screen explaining where the money goes
that opens over it. Renaming either half so the path read better would be
letting the address bar pick the vocabulary.

## What was considered and not done

**A tab bar at the foot.** Still no. The segmented control's own reasoning
holds at three: a permanent strip of a small screen spent saying what a line
under the title says as well.

**An icon on each segment**, as the channel screen's six tabs got hours
earlier. Not here: the other two have none, and a set where one tab is drawn
differently reads as a set where one tab is special.

**Leaving Help under the lists as well.** That is the move that makes a tab
pointless, and there is a test for it now.

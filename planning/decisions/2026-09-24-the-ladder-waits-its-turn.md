# The ladder waits its turn, and shows one rung when it comes

Two changes to the introduction checklist, both of them about the same thing:
what a card at the top of Home is allowed to ask for, and when.

Follows `2026-09-23-what-is-waiting-for-you-is-said-in-words.md`, which added
the waiting bar and left both of these as observations.

## It is not drawn while something is waiting

The ladder's first rung is **get somebody here**. That is the wrong sentence to
put to an account that arrived *because* somebody got them here and has not
answered them yet — the application's opening move is to send a stranger
recruiting while the person who recruited them sits unanswered in a bar
directly above. The previous entry named this and did not act on it.

Answering costs one tap, ticks nothing on the ladder, and is over in a moment.
So nothing is lost by drawing the ladder afterwards, and the screen a new
account meets is one thing to do rather than two competing.

**Decided in `ui/HomeView.tsx`, not in `state/introduction.ts`**, which is the
departure worth naming: that module decides everything else about this card,
and `Introduction.tsx` says of itself that nothing there decides anything. What
is waiting is the *tier's* question — it is computed a few lines above for the
waiting bar, out of two selectors belonging to the two lists — and pushing it
into the policy would mean either threading the answer in or teaching that
module to read a contact's status, making a third reader of a fact two already
share. The card's contents are still entirely the policy's; this decides only
whether the tier draws it, which the tier already did.

`useWaiting` is the one read, shared by the bar that draws the sentence and the
tier that suppresses the ladder behind it — `useAnswerWaiting`'s reasoning
exactly. Two readings of one fact are two things that can disagree, and the way
that failure looks here is a bar saying somebody is waiting above a checklist
that only hides when they are.

## A done rung goes behind *See more* with the rest

One rung in full and the rest disclosed has been the rule since 2026-09-13.
Done rungs were exempt — one line apiece, on the argument that they are the
half of the card that says somebody is getting somewhere.

**The exemption grows with progress, which is the flaw.** The ladder is seven
rungs. An account four rungs in was reading four lines of congratulation above
the single thing it was being asked to do, which is precisely the wall the
one-rung rule exists to prevent; the rule was being obeyed for the rows that
did not matter and suspended for the ones that accumulated.

So the card shows the next rung and nothing else. The ticks are one tap away,
and a done rung is still drawn as a line rather than a block once it is
showing — there is nothing left to instruct and nothing left to press.

**With one exception: no next rung means draw them all.** A ladder with nothing
outstanding would otherwise be a heading over a lone *See more*. The disclosure
exists to protect one ask from the rows around it; with no ask there is nothing
to protect, and hiding the lot behind a control would be the rule outliving its
reason. Unreachable in the app — retirement fires on a conversation plus all
four tried — and reachable in a test fixture, which is where it was found.

## The third ask, which turned out to be already built

The session was also asked whether the one-to-one channel with a first contact
ought to be accepted implicitly, to save a second step. **It already is, and
has been.** `POST /contacts/:id/accept` calls `channels.ensurePairChannel`,
which writes the channel with both people in `participants` from the first
moment — no invitation, nothing to answer. The requester is passed first
deliberately, so an unnamed channel described by reading out its participants
names whoever reached out first.

So the second step in the walk that started all this is **not** an invitation
to accept. It is a channel that appears in *Your channels* with no
announcement of any kind: no mark, no bar, no line. The waiting bar does not
cover it either, since that reads `home.invites` and a pair channel is
`rejoinable`.

Nothing was built for this. What it would take is either a line for a channel
you have never opened, or landing somebody in the pair channel at the moment
they accept — and which of those is right is a question about whether an
acceptance should move somebody, not about plumbing. Left open deliberately
rather than guessed at.

## What it cost elsewhere

Three tests in `introduction.test.tsx` asserted the old display: two that a
finished rung shows its title unasked, and one that expected no *See more*
where there is now one. Each was re-expressed rather than loosened — the
property *a done rung is a line and asks nothing more of it* is still tested,
now after opening the disclosure.

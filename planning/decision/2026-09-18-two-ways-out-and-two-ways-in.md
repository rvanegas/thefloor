# Two ways out and two ways in, and a counter that holds nobody, 2026-09-18

There are now two ways to leave a channel and two ways back into the one you
are standing in, and nothing said which anybody used. The Home glyph in the
channel header and the right swipe off that screen are the same journey; the
pinned live line on Home and the left swipe are the other. The swipes arrived
on 2026-09-18 — see *A screen arrives from the side it was asked for* and *The
back swipe goes the way every other phone goes* — and the question they left
behind is whether either is found at all.

`core/navigation.ts` names the four, `POST /nav` counts them, `nav_counts`
holds the counts, and `bin/usage nav` reads them. **It counts from the build it
ships in and there is nothing older to exclude**: the table is created empty,
so every row in it came from a client new enough to write one, and the `build`
column keeps builds apart so that people who have not updated yet cannot be
read as people who ignored the gesture.

## What was actually being decided

Not the mechanism, which is a table and a route. **/privacy said there was no
record of what you tapped**, in those words, and that sentence is the reason
the shape is what it is.

**So the table holds no identity, and that is a deliberate loss.** Every other
table in the meter names an account, because every other question is about
somebody. With an account here the report would be better in the one way it is
now weakest: a person who swipes forty times a day counts forty and somebody
who taps once counts one, so this is a share of *acts* and not of *people*, and
a handful of heavy users can move it. It cannot say how many people have found
the swipe, and nothing here will ever say that. The bias is stated in the
report's own heading, where somebody reading the figure will meet it.

**And it is counts rather than rows.** A row per tap would carry a time to the
millisecond, which on a quiet day is very nearly an identity whatever the
columns are called. One row per kind per build per client per day, incremented,
gives nothing to take apart afterwards.

**The page still had to change**, because *what you tapped* was no longer true
of anybody's taps in aggregate. The clause is gone and a paragraph replaced it
saying exactly what is counted and that nobody is attached to it. That was the
cost of collecting this, and paying it in the open is the point: the alternative
was a promise that had quietly stopped holding.

**Not swept, and not cleared by `forget`** — the two rules every other table
here obeys. There is nobody in these rows to have a thirty-day history or a
right to be forgotten, and the question is asked over the life of a build
rather than over a month. `nav.test.ts` asserts both, and asserts the column
list, so a well-meant `account_id` a year from now fails a test rather than
falsifying a published sentence.

## The three places it is measured, and the one place it is not

**The swipes are counted in `App.tsx` and not in `Panes`.** The responder sees
every drag that reached `swipeOf`, including the ones the branch then drops for
having nowhere to go; only a swipe that actually moved the screen is comparable
with a tap that actually moved the screen.

**The live line is counted in `HomeView` and not around `onReturnToChannel`.**
The introduction checklist calls that same handler to open a channel by an
entirely different journey, and counting those would make the pinned line look
used by people who never found it.

**The Home glyph is counted at its own press and not at `onClose`.** That
handler is also the way off the error wall and the empty state, both labelled
*Back to home*, and those are somebody getting out of a dead end rather than
choosing between two ways to leave a conversation.

**What is not counted is tapping an ordinary channel card.** It reaches the
same screen and is not one of the four: it is a different journey, from a list
rather than from the room you are already in, and folding it in would answer a
question nobody asked with a number that looked like the answer to this one.

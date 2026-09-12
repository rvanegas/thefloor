# The channel screen is six tabs

2026-09-12. Supersedes
`2026-09-11-the-channel-screen-has-two-tabs.md`, which is a day old and was
right about the mechanism and half-finished about the split.

Yesterday's change made *Invite links* a tab and left everything else on the
other one. What that left behind is what this fixes: the *Roster* tab was still
the whole of the old scroll, and the comment marking its seam said so out loud —

> The seam. Everything above is the conversation — who is here, who may speak,
> whether you can be heard, and whether you are in it at all. Everything below
> is what the channel is carrying, which outlives the moment: a clipboard, a
> video, a track, the recordings it keeps.

A `GroupHeading` component existed for that one sentence, and was the only
two-level hierarchy in the application's chrome. It was the admission: five
sections that are not about the people in the room, stacked under the one that
is, on the longest screen there is. Somebody who wanted the recordings scrolled
past the floor, the microphone, the departure, the clipboard, the film and the
player to reach them.

**So the seam is the switch.** Four of the five come off the roster as tabs of
their own, and the heading goes with them:

| Tab | What is on it |
| --- | --- |
| **Roster** | Who is here, the floor, your microphone, the ways in and out |
| **Notes** | The channel's description and its clipboard |
| **Player** | The shared track, and the recording controls |
| **Recordings** | What was recorded here, and the search over their transcripts |
| **Watch** | The watch party |
| **Invite links** | A contact, and a guest link |

Asked for by Rodrigo in that shape, minus the two that were already there.

**The order above is the one this decision shipped and is no longer current.**
Later the same day *Invite links* moved up to third and *Watch* to last, the
tabs grew glyphs, and where they are drawn became a setting; see
2026-09-12-where-the-channel-tabs-go.md. What is on each tab is unchanged.

## What moved, and the two that are worth arguing about

**The description moved onto *Notes*.** It was above the switch, outside it,
on the reasoning that it is what the channel *is* and so is as true of who gets
in as of who is here. That reasoning survives; what killed it is the arithmetic
of six tabs — a line above the switch is a line every screenful of every tab
pays for, on the screen with least room to spare. It belongs with the clipboard
because the two are the same kind of thing at two speeds: text the channel
holds, one written once and rarely changed, the other replaced whenever
anybody pastes. Neither claims audio; neither is refused by the floor.

It is read-only there, and in a card. Changing it is a settings act — it is
what everybody in the channel lives with — and Settings is in the pinned
header, on every tab. The card is because bare prose between a section label
and a card below reads as text that has come loose; above the switch, where it
was the first thing on the screen, a box around it would have been a box around
the only thing there was.

**Recording controls are on *Player*, not on *Recordings*.** The two look like
they belong together and do not. *Recording* is a control on the room right now
— it is the transport, it is refused by the floor and by presence, and it is
exclusive with the watch party for the same reason shared audio is. *Recordings*
is a list of things that already exist, which anybody may play or share whether
they are in the room or not. The first is what the channel is doing; the second
is what it kept. Grouping by "both have the word recording in them" would put a
live transport on a tab of files.

The header's recording indicator is unaffected and is why this is safe: it is
pinned, so the one fact somebody needs at every moment — that they are being
captured — is on screen whichever tab they are looking at.

**The party-muted line stays on *Roster*.** The control that causes it is on
*Watch*, and the line is a claim about the roster directly above it: those
people cannot be heard right now. That separation was already there when both
were on one scroll; the tabs make it explicit.

## *Watch* is the only tab that comes and goes

Behind *Labs*, like the card was — and, like the card, still drawn to somebody
sitting in a channel where a party is already running, whose own player is
being driven by it and whose recording controls are refusing them because of
it. Hiding it there would leave an unexplained refusal and no way to stop what
is causing it. `watchOffered` is both halves.

Nothing else may join it. A tab bar that gains and loses entries as the room
changes is the footer's finger-under-the-thumb problem one control up: the
thing you were reaching for is somewhere else by the time you land. What
governs this one is a Labs setting and a party that is either running or not —
neither of them something that flickers.

When it does go — a party stops in a channel belonging to somebody without
Labs, who is very likely the person looking at that tab, the Stop button being
on it — the screen falls back to *Roster* rather than going blank. The tab is
gone because the thing it was about is over.

## `Segmented` wraps, rather than scrolling

Six words will not go across a phone: each segment is `flex: 1`, so a sixth
leaves them about fifty points apiece, which is not a word. `segmentRows` in
`ui/components.tsx` breaks anything over four into **two balanced rows** —
three and three, not four and two, because a short row of wide segments beside
a full row of narrow ones reads as an afterthought stuck on the end. Five, the
shape without Labs, is three and two.

**Not a strip that drags sideways.** A tab you have to find by dragging is a
tab most people never learn is there, and it breaks the rule the footer on this
same screen is built on: position is what a set of fixed controls is for, and
one that moves under a finger already on its way is the wrong one pressed. Two
rows keep every tab visible and every tab still.

A control that fits on one row renders exactly as before — one row inside a
column container — so Home's channels/contacts switch is untouched.

## What it cost the tests

`showNotes`, `showPlayer`, `showRecordings` and `showWatch` join `showInvites`
and `showRoster` in `ui/testing/harness.tsx`, and `showTab` is exported for a
caller that wants one by name. They throw when the tab is missing, which is
what keeps a test from going on to assert quietly against the roster — and it
is what makes `showWatch` double as the Labs assertion.

Twenty-one tests in `channel.test.tsx` and thirty-nine across `channelRoster`
and `channelSharing` needed the tap. A handful of watch tests turn out to have
been passing vacuously — they assert a *negative* about a card, and were
asserting it against a screen that had no such card at all; the tab is what
made that visible. The screen-order test became a per-tab order test and gained
the tab order itself, read off `Segmented`'s own `options` rather than
restated.

`segmented.test.tsx` is new, and covers the wrapping directly: one row for
anything that fits, balanced rows for anything that does not, nothing dropped
or reordered, and every option still drawn and pressable in whichever row it
lands.

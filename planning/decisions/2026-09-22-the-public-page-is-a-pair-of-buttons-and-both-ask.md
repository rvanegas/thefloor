# 2026-09-22 — The public page is a pair of buttons, and both ask

The switch on Channel Settings that decides whether a channel has a public page
was a `Checkbox`. It is an On/Off pair of `Button`s now, and neither half acts
on the press: both raise an `Alert.alert` and only the confirming button sends
anything.

**The checkbox was the wrong component, and STYLE.md § *Checkbox* already said
so in a sentence written before any of this**: *a box is a question nobody has
answered yet, a pair is an answer in force.* Whether this channel has a page is
an answer in force. It is the same distinction that put the marketing
permission on Floor Settings into an On/Off pair while the same permission at
sign-up stayed a box, and the Recording card one row above on this very screen
is that pair. The rule was there; the control had drifted from it.

**What made the drift visible was giving the box a `disabled`.** That landed
hours earlier in `ac76604`, so that an unnamed channel could be refused the
switch with a sentence pointing up at the name field. A box needing a disabled
state is the tell: a question that is refused is not a question being asked. So
the `disabled` prop is gone from `Checkbox` again, and the component is back to
what it was — its three remaining users are all somebody saying yes on purpose,
which is the whole of what it is for.

**Going private now confirms too, and that is the change with something at
stake in it.** It used to happen on a single tap, on the reasoning that taking
a page down is the safe direction and the way back from a mistake. That
reasoning is false here. The page is not the only thing that stops answering —
the feed does, so anybody who subscribed in a podcast app stops receiving the
channel, and no alert afterwards reaches them. Copies already downloaded are
not reached either, in the other direction. So the body says what stops
answering, and says what does *not* happen: nobody's agreement to publish is
taken back, so turning it on again puts the same recordings at the same
address. Only the taking-down half is `style: 'destructive'`.

The general form is in STYLE.md § *Words on controls*: **ask whether the safe
direction is actually safe before leaving it unguarded.** Most pairs guard one
direction because the other is the way back. This one has no cheap way back
from the subscriber's side.

**Pressing the button already in force does nothing** — no alert and no
request. A pair says which one is in force by drawing it `primary`, which is
how every other pair in the app is read, so the press has nothing left to tell
anybody; raising a confirmation for a state somebody is already in would be a
dialog asking whether to do nothing.

**On is still refused until the channel has a name**, which is the rule
`ac76604` was for and is untouched: `setPublic` refuses an unnamed channel with
`conflict`, `SET_NAME` refuses to empty the name of a public one, and the
button is grey with a sentence pointing at the field one card above. Off is
never gated — a channel that lost its name somehow must still be able to take
its page down.

**The test finds these two buttons by position, not by label**, and that is
deliberate rather than laziness: their labels are *On* and *Off*, the same two
words as the Recording pair above them, and the house shape for a yes-or-no is
not something to give up to make a finder easier. `findAll` answers in render
order, so `publicPage()` in `channelSettings.test.tsx` starts at the card's
heading and takes the first two buttons after it. The harness gained a
`setChannelPublic` mock at the same time; there was none, because until now no
test had ever got past the confirmation.

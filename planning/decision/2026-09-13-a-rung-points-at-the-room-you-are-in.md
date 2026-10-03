# A rung points at the room you are in

2026-09-13. The four *try* rungs of the onboarding checklist — *claim the
floor*, *say you are nearby*, *bring in a guest*, *play something together* —
went to the Channels list, whatever the reader was doing. They still do for
somebody who is not present anywhere; for somebody standing in a channel they
now open that channel, on the tab the rung is about.

## The rule they looked like they were breaking

`ui/Introduction.tsx` § `actionFor` has said since the invited card went that
this card reaches as far as a list and no further: starting a channel or
sending an invite is a decision with a screen of its own, and the button's job
is to put that screen in front of somebody rather than to press it for them.
The card's one control that ever opened a channel outright was the invited
card's *Step in*, and it went with the card.

That rule is about **acting on somebody's behalf**, and it is untouched.
Nothing here claims a floor, mints a guest link or plays anything; the button
opens the screen the control is on and stops, exactly as *Open Contacts* does.

What the four rungs were doing was different and was simply wrong: naming a
list as the way to a room the reader was **already standing in**. The Channels
list is a way to find a channel. Somebody in one does not need to find it, and
the tap put them one screen further from the control the row had just named
than they were before they read it.

## Why it is four rungs and not five

*Step in with somebody* keeps its list, and that is the interesting case. It is
also a rung done in a channel, and a reader standing in one has done half of
it — but the half that is left is **somebody else being in the room**, and no
tab of the channel screen is about that. The list is where a channel with the
right person in it gets started. Opening the room they are already alone in
would be a control that moves nothing, which is worse than a list that at least
goes somewhere.

*Get somebody here* and the install rung are not about a channel at all.

## Which tab, and why the roster is not named

- *Bring in a guest* → **Invite**, where the guest link is.
- *Play something together* → **Player**, where the audio is added.
- *Claim the floor* and *say you are nearby* → the **roster**, because Claim
  and Nearby are in the bar along the bottom rather than on a tab of their own.

The labels are the destination in the app's own words, which is the pattern
*Open Contacts* and *Open Channels* set: the tab bar says *Invite* and
*Player*, so the button says the word the reader will be looking at a moment
later. The two roster rungs say *Open the channel* — naming a tab nobody has to
choose would be claiming the control is somewhere it is not.

## The tab is a request, not a setting

`ChannelView` grew an optional `tab` prop, carried there by
`Detail.channel.tab` — it reaches no address, like every id beside it. The
screen seeds its own state from it and follows it when it changes, which is the
half a phone does not need: there the tap mounts the screen. In a split the
channel can already be open beside the card, and without the second half the
tap would move nothing.

From that moment the screen owns which tab is showing. A tap on the bar stands,
and a rerender does not put it back. The cost, said out loud: asking for the
same tab twice with the screen up in between is a no-op, because nothing
changed — the same honest cost the card already pays for a tap on a list that
is already showing.

## What it required of Home

Nothing new was read. The tier already holds the live channel for the live bar
— `liveChannelHere`, the channel this *device* is standing in — and hands the
id down. Two readings of presence on one screen is one too many, and the bar
and the card now agree by construction.

**Presence, not conversation.** The card is drawn nothing-at-all while a
conversation is happening, so the reader this changes anything for is somebody
alone in a channel: exactly the person a rung saying *tap Claim in the bar
along the bottom* is talking to.

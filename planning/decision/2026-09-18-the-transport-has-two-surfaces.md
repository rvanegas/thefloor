# 2026-09-18 — The transport has two surfaces, and a film has somewhere to play

Two corrections to this morning's rework, both from using it.

## The app's controls are back

The morning's entry took the Play and ±15s row out on the reasoning that a
visible control that does nothing is worse than none, and that the bar —
being inside the embed, and impossible to remove without removing the picture
— is therefore the one that has to work. The first half of that stands. The
conclusion drawn from it did not.

**What was wrong with two sets of controls was never that there were two.** It
was that one of them did not work: the app's row was governed by the *floor*
while YouTube's bar sat above it ungoverned and visible, so which of them
answered a finger depended on a claim somebody might make mid-scene. Fix that
— and the floor leaving the transport this morning did — and the objection
goes with it. Both rows now produce the same three actions, so they are one
transport with two surfaces rather than two transports.

**And the bar alone leaves most of a party with nothing.** The bar is on the
picture, and a *screen* is one device per person: everyone else in the channel
is looking at a card with a progress readout and no way to pause. That was
listed this morning as a cost accepted rather than overlooked, which was the
right thing to write down and the wrong thing to accept — it is most of a
party most of the time.

The general form is worth keeping, because the first version of this argument
was persuasive and wrong: **"remove the redundant one" assumes the two are
redundant.** Two controls that reach the same actions from different places
are not duplicates when one of them is only present on some devices.

## A film now has somewhere to play by default

*Watch on* had a third state — neither segment chosen — for a party sitting
loaded with the film on nothing. It was honest about the model and poor as an
interface: **starting a watch party showed you no film until you noticed a
switch you had not touched.**

**The default is *this device* stepped in and *other device* stepped out**, so
one of the two answers is always chosen and the switch is how you *move* a
picture rather than how you turn one on. The answer stays a fact rather than a
claim: in the room the film really does land here before the switch says so,
and outside it nothing lands, which is what *other device* says.

The stepped-out half is not a detail. Somebody reading a channel they have
stepped out of has not asked to watch anything, and a film starting on its own
in front of them — with its sound — is the thing a default must not do. It is
also why the switch's value collapsed to one question: *is the film here*.
Being the fallback rather than a fact it has to establish, *other device*
covers a picture handed to the laptop and a channel read from outside the room
in the same sentence, and the switch no longer consults `screensElsewhere` at
all — that fact now only guards the default.

**Taken once per film rather than held as an invariant, and only while stepped
in**, which is the part that needed care. Handing the picture to the laptop
clears this device's own role a moment before the server says where the film
went, so a standing rule
would read that gap as *nobody is showing it* and take the film straight back.
A default is something that happens when a film arrives; where it plays after
that is the switch's business.

It is also not marked as taken while stepped out, so stepping in later is what
the default waits for rather than something it has already missed — and
stepping out again leaves an existing screen where it is.

**And only when no device of mine is already showing it**, which is what keeps
two of somebody's own instances from fighting. The server takes the film off
every other instance the moment one declares, so a phone and a laptop both
open on the channel would otherwise evict each other for ever. Even in the
race where both read *nobody is showing it* in the same instant it settles in
one round, because the evicted instance is told and stops asking.

## The labels

*Same device* and *separate device* became **This device** and **Other
device**. Same *as what* is a question the switch never answers — it invites
the reader to look for the other thing being compared, and there isn't one.
*This* points at the thing in your hand and *other* at everything else, which
is the actual division and needs no antecedent. They stay a matched pair and
stay relative to the device you are holding, which is what the 2026-09-17
entry was for.

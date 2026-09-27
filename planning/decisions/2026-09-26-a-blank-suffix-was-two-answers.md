# A blank suffix was two answers

The roster's *watching* suffix said which members had the party's film up and
said nothing at all about everybody else. Two changes: the blank now says *not
watching* where that is a fact this app knows, and the declaration it is drawn
from is retracted by a device that took the screen role while it was already in
the background — which it was not, so the blank was sometimes the wrong word
rather than a missing one.

## The bug came first, because the label is worth nothing without it

`AppProvider`'s screen effect withdraws `screens.showing` while the app is away
and restates it on return, on the reasoning in
2026-09-20-the-roster-says-who-is-watching.md: iOS suspends a backgrounded
WebView, the film has genuinely stopped, and the person a host is looking for is
exactly the one whose phone is in their pocket.

It was an `AppState` listener and nothing else, so it only ever heard a
*change*. A device that became the screen while the app was **already** away had
no transition to be retracted by: the claim went out from `showScreenFor` or
`onScreenAsked`, nothing followed it, and the room read *watching* at a pocket
for the length of the film.

**That is the ordinary path rather than a corner**, which is what makes it worth
a decision entry. Two people are on a call, one has the app backgrounded, the
other pastes a link. The backgrounded phone is still running — it is stepped in,
so the call's audio session keeps it alive, and the snapshot arrives. The
default-screen effect in `ChannelView` takes the screen role off that snapshot
and asks nothing about where the app is. So the failure needs nobody to do
anything unusual; it is what backgrounding during a watch party does.

Fixed by reconciling when the role is taken as well as on every transition.
**Only the retraction is asserted**, and the asymmetry is deliberate: a role
taken while the app is in front has already been declared by whichever path took
it, and restating it would put a second identical message on the wire for every
handover. The one case that does send a pair — declare, then withdraw — is the
backgrounded one, and two messages to say one thing is worth having a single
reconciler rather than an `AppState` read at each of the two call sites that
declare.

## Then the label, which is a third answer and not a second

*Watching* beside the people with the film up and nothing beside everybody else
meant the question the line exists to answer — *did the room come with me* —
was legible for the yeses and silent for the noes. And the silence was already
spoken for: a roster with no film in it, and a roster from a server that does
not report screens, draw the same blank. Somebody checking on a member had a
blank and no way to read it.

So `watching` on the card is three-valued. `true` is *watching*, `false` is
*not watching*, `null` is nothing to say, and the card draws what it is handed.
`watchSaysFor` in `ChannelView` is the whole of the decision.

**Two absences cannot be denied honestly and get `null`.** A guest is never on
`ChannelView.watching` — their socket is a scope of its own and carries no
declaration — so a guest absent from the list may be watching; it costs nothing
to leave out, `view.participants` being the member directory and a guest in the
room being drawn by `GuestCard`. And a server older than the field sends no list
at all, where a denial would tell a whole room it was not watching a film it was
sitting in front of.

**An empty list is not one of those.** `[]` and `undefined` drew the same blank
while the blank meant nothing and are opposite statements now: a server that
looked and found nobody, against a server that has never heard of screens. The
one line that collapsed them — `view.watching ?? []` — was the shim behaving
correctly right up to the moment the negative existed.

**The denial is only about somebody in the room.** A member who is *nearby* or
*stepped out* is not watching in any sense the room is asking about and their
card already says where they are; a denial there would spend the least urgent
suffix on the person it says least about. *Watching* itself is deliberately not
gated that way and must not become so — a *second device* is a screen without a
voice, so a stepped-out member may hold the picture and has been reported since
2026-09-20.

## What was not done

**The backgrounded phone still takes the screen role.** The role is untouched by
any of this, which is what keeps the retraction cheap: the picture stays
mounted, `watchingHere` and the microphone rule are not involved, and the film
resumes off the channel's clock the moment the app is in front again. Only the
report to the server moves.

**Nothing tells the backgrounded person a film has started.** No notification is
sent when a party begins, so somebody whose app is away during a watch party
hears the room go quiet — the run is enforced-muted — and is told nothing about
why. That is a real gap and it is not this entry's; it wants deciding on its own
terms rather than as a side effect of a roster label.

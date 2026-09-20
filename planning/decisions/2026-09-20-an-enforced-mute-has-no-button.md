# An enforced mute has no button

**What was wrong, in one line.** *Unmute the room* stood on the watch card
whatever the state of the run, including the runs where pressing it did
nothing at all.

The enforcement itself has been right since it was built. A party that begins
while somebody is watching on the device they are in the room on is muted and
stays muted until it is paused, because that device cannot serve the film in
stereo and hold a microphone open at once — `WatchState.enforced`, sampled at
the edge of a run by `watchPlay`, and `canUnmuteRoom` is the guard the reducer
refuses `SET_WATCH_MUTE` with.

What was missing is that the interface had never heard of it. `canUnmuteRoom`
had exactly one caller in the whole repository — its own doc comment, which
claimed the Watch tab read it "to grey the button with a sentence under it",
and the Watch tab did not. So the button was live, a press sent an action, the
reducer dropped it on the floor, and the only feedback was the room staying
muted. A greyed control and a refused action cannot disagree is the rule the
three packages are split for, and this was the one place they did.

## Gone rather than greyed, which is the part that is a judgement

The obvious repair is the one that comment describes: `disabled` plus a
sentence, which is what every other refusal on this card does. That is wrong
here, and the difference is worth writing down because it is now a style rule.

Every other refusal on the watch card is about the *reader*. You are not in
the room; somebody else has the floor; a recording is running. Each of those
has an action that lifts it, the sentence names the action, and the button
lighting up is how you learn it worked. A grey button is a promise about
something you can reach.

An enforced mute is not about the reader at all. It is a fact about the run,
answered once when Play was pressed, and no one on that screen can change the
answer before the film is paused — which on a feature film is two hours of a
grey button offering something that is not on offer. So the control is removed
and the sentence that was already there takes on the reason: *The room is
muted … Somebody is watching on the device they are in the room on, so it
stays muted until the video is paused.*

That is § *The cards a footer made redundant*'s third case — the button goes,
the sentence stays, and what is left is a readout — arriving at the scale of
one control rather than one card. STYLE.md § *Words on controls* carries it as
a rule, with the question to ask: a refusal a rule can enumerate against you
is grey with a sentence; a refusal that is a condition of the state everybody
is in is gone with a sentence.

## Why it does not flicker

Because the underlying fact is sampled rather than derived. Somebody in
another country closing the laptop they were watching on changes nothing until
the film is paused and started again — which is what stops the button
appearing and vanishing under a finger, and is the same property that made
enforcement safe to build in the first place. Only the *Unmute* half can ever
disappear: a party that is not muted cannot be enforced, so the *Mute the
room* button is always on the card.

## What it is not

It is not a change to who may mute, to when enforcement applies, or to the
mute itself. Nothing in `core/` moved. The server behaves exactly as it did;
the app has stopped offering an action the server was always going to refuse.

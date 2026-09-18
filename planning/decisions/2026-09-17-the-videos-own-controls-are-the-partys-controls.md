# 2026-09-17 — The video's own controls are the party's controls

The film has played inside the app since this morning, and the first thing
anybody watching it did was press YouTube's own play button. It worked for
about a quarter of a second and then undid itself: the embed obeyed, the
follower read a player that disagreed with the channel, and the correction put
it back. A control that answers and then changes its mind reads as a broken
video, not as a channel with one remote.

## Hiding them was the first answer and is not available

`controls: 0` is an official player parameter and would have taken the bar
away. Two things ruled it out.

**It is fixed when the embed is built.** Who may drive a party is
`canControlWatch` — the *floor*, which moves mid-party by design; somebody
steps in to say something and everybody else loses the transport for as long
as the claim lasts. Following that with a player parameter means rebuilding
the embed, which means reloading the film on every screen but the claimant's,
every time anybody speaks. The alternative — fixing the value at the party's
start — is a control that is hidden for people who may use it and shown to
people who may not.

**And it would not have stopped the reversal anyway.** A tap on the picture
toggles playback whether or not the bar is drawn, and no parameter turns that
off. Hiding the bar hides the invitation, not the act.

## So the press drives the channel instead

A play, a pause or a scrub on the embed now becomes `WATCH_PLAY`,
`WATCH_PAUSE` or `WATCH_SEEK` — the same three actions the buttons under the
film produce — and comes back to every screen as an ordinary snapshot. It is a
second way to press the transport and not a second transport: there is no new
action, no new field on `WatchState`, and nothing the server had to learn.

**The rule is `intentFrom` in `core/watch.ts`**, beside `followInstructions`
and for the same reason: two surfaces implement it and a rule that exists
twice is two rules.

**The hard part is not detection, it is the false positive.** A player that
disagrees with the channel is either somebody's thumb or somebody's follower a
heartbeat behind a change that has already happened elsewhere — and the two
are the *same reading*. Taken generously, a pause would go round the room for
ever: A pauses, B's follower pauses B's player, B reports a player that has
just changed against a channel it does not match, B tells the channel to
pause, and so on round.

What separates them is **which of the two moved**, so the previous tick's
player and channel are kept together — `PlayerHistory` — and an intent needs
the player to have changed while the channel did not. Everything else is
excluded by name: `buffering` and `unstarted` and `ended` are not presses;
a scrub is measured against the previous *reading* rather than the channel, so
accumulated drift cannot look like one; the follower's own seek is inside its
settle window; and **a backgrounded app is not a press**, which matters most
of all — iOS stops the video when the phone goes into a pocket, and reporting
that as a pause would stop the film for the whole room.

A press is also given `INTENT_SETTLE_MS` to come back before the follower says
anything at all. Without that window the correction simply arrives one network
hop later than it used to, which is the same defect.

`watchPlay` is not idempotent — it re-stamps `startedAt` and re-samples
`enforced` — so a repeated intent is not harmless, and the window is what
stops a press being sent twice while the snapshot is in the air.

## For whoever may not drive, the frame is inert

`pointer-events` off, and nothing else: nothing is drawn over the player,
nothing about the embed changes, and it stays visible and unobscured, which is
the same thing this project has told App Review all along. A frame that does
not answer is the greyed button under the film, said by the video. It toggles
in a command to the page, so the floor can move mid-party without anything
reloading.

A refused video is interactive whatever the floor says: all that is left in
the frame then is YouTube's own explanation and the button that opens the
video where it will play, and making that unpressable would be taking away an
escape rather than a control.

## What was asked for and not built: the mute

Sharing the player's *mute* was raised in the same breath and is a different
thing in two ways. It is not broken — nothing here corrects a volume, so
muting the video sticks — and **the channel's mute is microphones**: wiring a
video's mute button to `SET_WATCH_MUTE` would silence the room's voices
because somebody turned the film down. Sharing the video's own volume instead
would mean the channel carrying one, which `core/watch.ts` explicitly decided
against on 2026-08-23: *how loud your own screen is is your device's
business*. Left alone pending somebody wanting it as a feature rather than as
a fix.

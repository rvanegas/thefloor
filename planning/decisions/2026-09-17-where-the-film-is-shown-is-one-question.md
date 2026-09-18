# 2026-09-17 — Where the film is shown is one question, not two buttons

*Watch here* and *Watch on another device* were two buttons, and they were
wrong in a way that only shows when you own two devices.

**The labels inverted as you crossed the room.** The laptop's *Watch here* and
the phone's *Watch here* are opposite instructions written in identical words.
Whichever device you were holding, the same phrase meant something else — and
since both buttons are relative to the device reading them, there was no way
to tell from either screen what the *other* one was doing.

**And only one of them was ever a state.** *Watching here* went primary when
this device was the screen; *Watch on another device* had no selected form at
all, because nothing on the delegating device knew whether the delegation had
landed. Tap it, hand the film to the laptop, and the phone went back to
showing two unselected buttons — the choice you had just made left no mark on
the thing you made it with.

## One question with two answers

    Watch on
    [ Same device | Separate device ]

*Same* and *separate* are still relative to the device in your hand, which is
unavoidable and fine: what they are not is a mismatched pair. The question is
asked once, above the track, and the answer is shown as chosen.

**The label is above the track rather than beside it.** Two segments and a
lead-in do not fit across a phone, and a *Separate device* that wraps or
truncates is worse than a line of its own.

**Neither answer is shown until somebody has answered.** A party can sit
loaded with the film on nothing, and a switch that opened on *same device*
would be a control reporting a state the channel is not in.

## The mirror needed a fact that did not exist

The selection is the same fact on every device, said in each device's own
terms: the laptop showing the film says *same*, the phone that handed it over
says *separate*. The first half was free — `screenFor` is this device's own
state. The second was not: nothing on the phone knew that another of its own
instances was screening this channel.

`screens`, the picker's list, could not answer it. That list is **asked for
and deliberately frozen** — a list that reorders under a finger is worse than
one a second old — so making it live would have broken the picker to fix the
switch.

So a second, narrower thing: `screening`, a pushed message carrying **which
channels this account's other instances are showing**, sent whenever any of
them starts or stops, and once to each session as it connects so a device
coming up is not the only one that does not know. Channel ids rather than
devices, because the question the switch asks is *is it on somewhere else of
mine* and which one is the picker's business. Never the receiving connection
itself, which is what makes the answer read as *separate* on every device at
once.

A screen that has gone away has stopped showing anything, so the close handler
pushes too — otherwise a laptop that was shut goes on being the answer until
something unrelated happens to refresh it.

## `Segmented` learned what it is

The control was built for tab strips and announces itself `tablist`. A
labelled two-value setting is not a tab bar, and somebody who cannot see the
track has nothing but the announcement to tell them apart — so `role="choice"`
switches it to `radiogroup`/`radio` with `checked` instead of `selected`.

It has a second effect that is not cosmetic: `findButton` in the view harness
excludes anything inside a `tablist`, so that an *Invite* tab and an *Invite*
button can share a screen. A choice claiming that role would vanish from the
tests of the card it lives on. `findChoice` is the matching finder, and
`findButton` and `findTab` see neither.

## A bug the switch made visible

Handing the film to another device never cleared *this* device's screen role,
so a phone that had been watching here went on playing the film — its own
picture, its own sound — after giving it to the laptop. Two buttons could
describe that state; a switch reading *separate device* while this device is
plainly still showing one cannot.

Cleared on the hand-over rather than when *separate device* is pressed,
because a press may find nowhere to go: an account with no other device
signed in gets the banner and keeps its film, where an eager clear would take
the film away and offer nothing in its place.

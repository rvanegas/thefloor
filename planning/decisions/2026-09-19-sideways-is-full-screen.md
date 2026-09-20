# Sideways is full screen

**The bug was that leaving full screen left the phone sideways.** The expanded
picture locked the device landscape for as long as it was up and released the
lock on the way out — `unlockAsync`, since the rest of the app rotates freely —
and an unlocked phone goes back to the way it is being held. So anybody who
pressed *Exit full screen* while still holding the phone sideways got the
channel screen sideways, and nothing on it to say otherwise with. The release
was correct and the design around it was not: two pieces of state, the flag and
the hardware, each able to be true while the other was false.

**So the flag is gone and the hardware is the control.** Full screen is derived
from the shape of the window now — `useIsLandscape()` in `watch/orientation.ts`,
width against height — and `ChannelView` mounts `FullScreen` when that is
landscape on the *Watch* tab with a party screening here and nothing covering
the channel. Nobody sets it, so there is no path by which it can disagree with
the glass. Turning the phone sideways expands the picture; turning it upright
collapses it.

Three controls went with it, and none is replaced:

1. **The *Full screen* button on the watch card.** It said what the phone
   already knew.
2. **The *Exit full screen* button** over the picture, which is the one the bug
   was reached through.
3. **The swipe down** over the picture. It was the way out that never depended
   on the chrome being drawn — the argument that made fading the chrome safe,
   in *The chrome fades after all*, the same day — and leaving is a rotation
   now, so it had nothing left to mean. What makes fading safe today is
   stronger than the swipe was: a person who never finds a control turns the
   phone upright, which is what they would do with any other film on any other
   phone.

**One control is added, and it is about the hardware rather than the picture.**
*Back to portrait* locks the interface upright and the picture collapses as a
consequence of the turn. It is there for the cases the accelerometer cannot
serve: somebody lying down, or holding the phone flat on a table, where a
physical turn does nothing. It says what it does to the phone rather than what
it does to the picture, because that is the half that happens first.

## The five seconds, which is the part worth arguing with

The lock has to be released or the phone is stuck upright, and **there is no
event to release it on.** `expo-screen-orientation` reports the *interface*
orientation; while the interface is locked, that reading is the lock rather
than the hardware, so nothing fires when the person actually turns the device
back. There is no physical-orientation reading available at all — the app
carries no `expo-sensors`, and the platform offers none through this module.

The three candidates were: release immediately, which is identical to never
locking (a phone still held sideways rotates straight back and the control
appears to do nothing); hold the lock until the channel screen unmounts, which
means a person who exits and then wants the film big again cannot get it by
turning the phone; and a timer. The timer wins on being wrong cheaply — being
wrong costs one more press, and neither of the others is recoverable in place.

`PORTRAIT_HOLD_MS` is five seconds: long enough to lower the phone, set it
down, or bring it upright, short enough that somebody who changed their mind is
not stuck wondering what they did. **The timer lives at module level rather
than in a component**, because the rotation is what unmounts `FullScreen` — a
release in a cleanup would fire on the frame the lock was applied, which is the
trap the old `useLandscapeWhile` was arranged against, arriving from the other
side.

## What did not change

The transport and the channel's own footer still lie over the picture on a
scrim and still fade together after three seconds, a touch anywhere bringing
them back; the film is still fitted rather than cropped; the whole-window claim
is still what keeps a sideways phone from putting Home back beside the film.
The three automatic collapses are unchanged in effect and are now terms in the
same expression as everything else: the party stopping, the picture moving to
another device, and YouTube refusing the film.

**Only the *Watch* tab turns into a film.** Landscape anywhere else is an
ordinary sideways screen, which is what `orientation: "default"` is for, and
which the app has always given on every screen but this one.

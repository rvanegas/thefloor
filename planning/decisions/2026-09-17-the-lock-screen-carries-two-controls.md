# 2026-09-17 — The lock screen carries two controls

Built 2026-09-17, from `tasks/lock-screen.md` — *explore options in case screen
locks during a call* — which was a question rather than a specification until
the answer narrowed it to this: while you are present in a channel, the lock
screen offers **Mute/Unmute** and **open**, and nothing else.

## What the lock did before

Five behaviours, and only one of them was a hole.

The audio kept flowing: `UIBackgroundModes: ["audio"]` plus an already-open
`CALL` session survives locking, confirmed on hardware 2026-08-08. You could
not *start* speaking: `useSessionAudio.ts` defers a promotion to `CALL` while
backgrounded because iOS measurably refuses one, so a claim arriving at a
locked phone rendered into nothing until it was picked up. Nothing appeared
anywhere on iOS — Android alone showed the foreground-service notification.
Attention lapsed, and a phone alone in a room was retired after fifteen
minutes, by design. And nothing prevented the lock in the first place; there is
no `expo-keep-awake` in this app and there should not be.

## Why mute was the thing worth building

**The design dodges the constraint, and that is the reason it is buildable.**
The 2026-09-05 refusal is about *starting* capture in the background. A
self-mute never goes near it: `micNeeded` is true for a muted member, so
`wantFor` still asks for `call` and the session stays `CALL`, while `intentFor`
returns `muted`, whose whole meaning is *leave the device exactly as it is*.
The category never moves. Unmuting from a locked screen re-opens a device that
was never given up.

*Taking the floor* from a locked screen is the thing that would need Apple's
PushToTalk entitlement, and it is deliberately not built here. See below.

## Why a Live Activity and not a notification

A persistent local notification with a `UNNotificationAction` was the cheap
version: pure JavaScript, no Xcode target, no plugin, and the *open* half was
already built — `onNotificationTap` has routed a tapped notification's
`channelId` to the channel screen since long before this.

**It cannot express the design.** `UNNotificationAction` has no disabled state.
Showing "you cannot unmute right now" through a notification means swapping to
a category without the button, so the control *disappears* and the card changes
shape under somebody's thumb. The instruction was a grey disabled button, in
place. ActivityKit is SwiftUI and `.disabled(true)` does exactly that.

The second reason would have decided it anyway: a Live Activity needs no
notification permission. The notification version would have been missing for
precisely the people who declined notifications, which is not a coincidence
about who wants a control that is not a notification.

**PushToTalk was considered and is not this.** Its verb is *transmit*, not
*mute*; it is half-duplex by default; and it needs an entitlement Apple grants
by request. It remains the right answer for taking the floor while locked, and
that is a separate piece of work with a separate cost.

## Three states, shown as two

`GLOSSARY.md` § *Mute (four things, one word)* separates them: the footer icon
means **you are not being heard**, which has three causes — you self-muted, the
device has no input, somebody else's claim is silencing you. The card takes the
same derivation rather than the reducer's `selfMuted`, so a Mac mini shows
muted and is offered no Unmute.

**Being silenced does not grey the button**, and that looks like an omission
until you read `canSetSelfMute`: it refuses only the floor-holder muting
themselves. A silenced person may still set their own mute, and what they set
is what they are left with when the claim ends. The footer keeps the control
live there and colours it instead; the card has no colour to spend, so it stays
live and says nothing.

**And a disabled control here carries no sentence saying why.** STYLE.md's rule
is that one without a reason is a bug, with an exception for a row where being
refused is the ordinary condition. This is the second instance of that
exception and it is written into STYLE.md rather than taken silently: there is
no room for a sentence on a lock screen, and *open the app and look* is the
affordance that stands in for one. That was the explicit instruction.

## The shape it took, and the one subtle part

Three places, and the split is forced rather than chosen.

`modules/live-activity` is the Expo module JavaScript talks to. It contains no
ActivityKit and names no activity type.

`targets/lock-screen/` is hand-written Swift that `plugins/with-live-activity.js`
copies into the generated `ios/` and gives **two target memberships**:
`FloorActivityAttributes.swift` and `ToggleMuteIntent.swift` compile into both
the app and the widget extension.

**That is the subtle part and it is why the module holds no ActivityKit.** An
`ActivityAttributes` has to be the same Swift type in both binaries or the
system matches nothing — and a pod is a third module, so a third copy would be
a third type, and the widget would draw nothing while the app reported success.
Anything naming the attributes therefore lives in one of the two targets that
share the file; `LockScreenController` is in the app target for exactly that
reason, and the module passes a plain record to it. An app target may import a
pod and not the reverse, which is the only direction this could have gone.

`LOCKSCREEN_WIDGET_EXTENSION` compiles the intent's body out of the copy that
cannot see the pod. `canImport` was the obvious guard and answers the wrong
question — search paths rather than linkage.

**A `LiveActivityIntent` is performed in the app's own process**, which is the
whole reason a lock screen button can reach a live LiveKit room. Nothing has to
handle a cold launch: the app is alive whenever the card is up, because it is
holding the audio session, and holding the audio session is what being in a
channel is.

## What the plugin cost, which was all of it

The Swift was not the hard part. Two failures in `xcode@3`'s API took three
full builds between them, and both are the silent kind.

**`addSourceFile` adds nothing once a reference exists.** It calls `addFile`,
which opens `if (this.hasFile(file.path)) return null` — so after `addPbxGroup`
has created a reference for a file, every later `addSourceFile` for it returns
false and does not throw. The app target came out simply missing three files,
and the first sign was `cannot find 'LockScreenController' in scope` from an
`AppDelegate` sitting next to it.

**Defeating that by spelling the path differently produces a path that does not
exist.** `LockScreenWidget/Foo.swift` gets past `hasFile`, and is then resolved
relative to a group that already carries that directory:
`LockScreenWidget/LockScreenWidget/Foo.swift`. The error names the composed
path and not where either half came from.

What both want is a `PBXBuildFile` against the reference already there, which
is what a second target membership *is* in this format. `addToSources` in the
plugin does that and carries the account.

**And a pipe will tell you the build passed when it did not.** `xcodebuild …
| tail` reports `tail`'s exit code, which is always zero; the first of these
three builds was read as a success on that basis and had five failures in it.
Redirect to a file and check `$?`.

## What was left open

**Whether the card may name the channel.** `modules/call-service` omits the
name from the Android notification on the explicit ground that *iOS shows
nothing equivalent*, and that premise is now false. Either both surfaces may
name the channel or neither should. The card names it, because a card headed by
nothing is worse than one headed by who is in the room; Android was **not**
changed to match, because that is a disclosure decision rather than a
consistency one and it belongs to whoever is holding the product. The comment
in `call-service` records that its reason has expired.

**Android has no card.** Its foreground-service notification is already on the
lock screen and adding a mute action plus a channel-view tap intent is an edit
to `CallService.kt` rather than a new mechanism — cheap, and not done here.

**Nothing is verified on a device.** The project builds for the simulator; a
Live Activity cannot be judged from one. The walk is: step in, lock, confirm
the card, mute from it, confirm the room hears the change, claim the floor from
another device and confirm the button greys, tap the card and confirm it opens
at the channel.

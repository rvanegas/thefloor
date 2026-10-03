# 2026-09-18 — The lock screen card does not outlive the room

The card shipped on 2026-09-17 saying, in GLOSSARY.md's words, that it is *up
for exactly as long as this device is standing in a channel*. It was not. The
task that reported it — *Don't show live activity when not present* — said in
full: *If no longer present in a room, with an active call, there should be no
live activity. I'm seeing otherwise.* There were two ways to get there, and the
hook that drives the card was innocent of both: it takes the card down the
moment `here` goes null, and always did.

**The first is that an ActivityKit activity outlives the process that started
it.** That is the whole of it. A card is only ever up while somebody is
stepped in, which on iOS means the app is alive in the background holding an
audio session rather than suspended — so the process ends by a force-quit, a
crash, or jetsam, and in every one of those the socket dies, the server runs
DISCONNECT_GRACE_MS down and `DISCONNECT_EXPIRED` removes the account from the
room. The card stays where it is, for as long as ActivityKit keeps it, with a
Mute button for a microphone nothing is holding. Worse, a *fresh* process knew
nothing about it: `LockScreenController.activity` was nil, so `hide()` ended
nothing and the next `show()` would have requested a second card beside the
first.

So the controller now does two things at `register()`, which is the
`didFinishLaunching` line the config plugin inserts. It **adopts** whatever
`Activity<FloorActivityAttributes>.activities` still holds — keeping one,
ending the rest, and recording its `channelId` — so that the hook's first
answer settles it within a snapshot or two: `hide()` if the account is not
present, which is the reported bug, and `show()` if it is, which updates the
card in place rather than flickering it off and on. And it observes
`UIApplication.willTerminateNotification`, which **is** delivered to an app
running in the background and is not delivered to a suspended one — which is
why it is worth having here and would be pointless in an app that did not hold
an audio session. A swipe out of the app switcher lands there. Adoption is the
backstop for the deaths that arrive without a word.

**The second is that the last snapshot stops being evidence.** Presence is the
server's answer, and since 2026-09-08 it is falsified by not being in the media
room. A phone that loses the network keeps a `ChannelView` saying it is in the
room, because nothing is arriving to say otherwise, while the server runs the
same grace down and removes it. The app knows this in general — the channel
screen says *Reconnecting…* and Home shows the offline notice — and the card
alone went on asserting presence.

`useLockScreen` therefore takes a fourth argument, `inTouch`, which `App.tsx`
answers as `app.status === 'open' || audio.status === 'connected'`. Either
route proves the device is still in the room: the control socket is what
snapshots arrive on, so while it is open the view answers for itself; the media
room is what presence is now *read from*, so a phone still in it is present
whatever the socket is doing. When neither holds, the card is kept for
DISCONNECT_GRACE_MS and then taken down.

**Held rather than dropped at once, and the number is deliberately the
server's.** Losing touch is ordinarily a blip — a tunnel, a handover, a deploy
rounding up to a client retry — and a card that flickered off and on at the
lock screen for each of those would be worse than one that is a minute stale.
Until the grace expires this device really is still in the room, by the
server's own reckoning; after it, it really is not. Copying the constant rather
than picking a number is what keeps the two from drifting apart.

**What was considered and not built:** a `staleDate` on the activity's content,
so the extension could draw a card whose process has stopped answering. It is
`ActivityContent(state:staleDate:)`, iOS 16.2, against this file's 16.1 floor —
the same trade `end(using:)` already makes — and it would need a second
appearance in the widget. It also answers a different question: a stale card is
still a card, and the task asked for none. Worth revisiting only if a crash
that never leads to a relaunch turns out to be common, which nothing suggests.

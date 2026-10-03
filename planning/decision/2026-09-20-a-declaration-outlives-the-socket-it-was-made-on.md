# A declaration outlives the socket it was made on

`Realtime` now remembers the channel it last declared a screen for and says it
again in `onopen`, beside the `watch.home`, `watch.channel` and re-entry
restores that were already there. `Connection.screening` on the server is
unchanged and still dies with its socket; what changed is that something is
left alive to state it again.

Found from two phones an hour apart. The roster's *watching* suffix, added the
same day, read *Present* at somebody who was watching the film full screen and
said so out loud. She was right, her device was right, and the server was
right about what it had been told — which was nothing, since the last thing
that told it had been a socket that was no longer there.

## Why the device had no occasion to say it twice

`screening` being connection state is correct and is not the mistake: a screen
that has gone away has stopped showing anything, and that is the lifetime the
fact wants. The mistake is that nothing on this side held the other half.

The role lives in `AppProvider`'s `screenFor`, which a reconnect does not
touch. The picture stays mounted across the drop, the film resumes off the
channel's clock, and every one of the three senders of `screens.showing` —
`showScreenFor`, `onScreenAsked`, and the background/foreground pair — is a
one-shot reaction to an event rather than a reconcile. So after a blip, a
deploy or a long spell in the background, the device believed it was the
screen, was visibly the screen, and had nothing left to provoke it into saying
so. Nobody in the room could see it, and neither could she: the only symptom
is on other people's screens.

**The nastier half is the retraction pair racing its own reconnect.**
`AppProvider` withdraws the declaration when the app goes away and re-states
it on return — and coming back from the background is exactly when this socket
is not open yet. `send` keeps only `channel.action`, so that re-statement was
dropped on the floor, and `onopen` had nothing to say it from. The mechanism
written to keep the roster honest failed in precisely the case it exists for,
which is why the fix belongs in the socket rather than in another listener.

## What was considered and not done

**Pushing it into the reconnect from `AppProvider`** — a `useEffect` on the
connection status that re-declares. It would work and it is the wrong shape:
the app would be reconstructing, from outside, a thing the socket already
knows and already restores three other pieces of. The list of what a new
connection owes the old one belongs in one place, and that place has been
`onopen` since the class was written.

**Making the server hold it across sockets**, keyed by device rather than by
connection. That is a worse answer to a real question: a screen whose socket
has gone is a screen nobody can see, and a declaration that outlived the
process would have the picker offering a phone that had been closed for a day.
The lifetime is right; only the restatement was missing.

## Order, which is load-bearing

The declaration goes out **after** the re-entry, not before. `screens.showing`
pushes every roster in that channel, and a snapshot saying somebody has the
film up while saying they are not in the room is a person the room cannot
place. Presence first, then what they are doing in it.

Not gated on the re-entry, though, and that is deliberate: a television is a
screen that was never stepped in, and a rule written against `enteredChannel`
would take the film off the laptop it was handed to. The stale case — stepped
out by the server past the grace window — corrects itself a snapshot later,
`ChannelView` clearing `screenFor` for a device that is not in the room.

## What it does not fix

Nothing about a guest, who never sends the declaration at all — see
`ChannelView.watching`. And no wire change, so no shim: both ends already
speak this message, and an old client simply goes on not restating it.

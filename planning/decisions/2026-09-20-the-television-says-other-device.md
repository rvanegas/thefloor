# The television says *Other device*, and the film goes to the room

Two changes to the press added in
`decisions/2026-09-20-declining-to-be-the-second-device.md`, the same morning,
plus the half of `decisions/2026-09-20-a-film-sent-to-a-device-opens-the-channel-on-it.md`
that the arrival did not finish.

## The word

**Not on this device** → **Other device**. The button is the *Watch on* switch
thrown from the far end, and that switch has exactly two answers: *This device*
and *Other device*. Saying one of them in the negative is a third phrasing of a
question the app already asks in two segments, and it names what the press is
*not* rather than where the picture goes. From a television the film's
destination is the account's other device, which is the switch's own answer —
so it is now simply that answer, said from here.

## The film goes to the device standing in the channel

The press used to borrow the picker's machinery: ask for the account's live
instances, take the single other one without offering a choice, draw a list if
there were two. **That was a choice being made where the answer was already
known.** The picture belongs on the device the person is holding, which is the
one they stepped into the channel on; a list of signed-in instances says which
are connected and nothing whatever about that. With two other devices signed in
it drew a picker on a television somebody had just walked away from, and with a
stale list of one it named a device id that might belong to nothing.

So the television asks by description. `screens.use` takes a **null device**,
meaning *the instance standing in this channel*, and the server resolves it —
being the only thing that can see all of somebody's sockets at once. No
`screens.list`, no `choosing`, no picker on the way back.

**The fact is new on the server and it is per connection.** A channel's
`present` names accounts, so it cannot answer *which device*; `Connection.standing`
is that missing half, written by the same actions that decide displacement.
`ENTER` sets it and clears it on every other device of the account, one voice
meaning one place; a step out, an expiry, a nearby declaration from inside the
room and a departure clear it. It dies with the socket, which is the right
lifetime — a device that has gone is not holding a room — and a reconnection
re-sends `ENTER`, which fills it in again.

Nobody standing gets the same refusal a missing device id gets, with its own
sentence: the account can be present while the socket that entered has gone,
which is what a grace period is.

**This is a wire change, so the server deploys before the build ships.** The
message is client→server and additive, so an old client is unaffected; a new
client against an old server is the case the order exists for — that server
would read a null device against `other.device === device` and could match an
instance that claimed no id at all.

## A film sent here takes the device, whatever it was showing

`App.tsx` answers the ask by opening the channel on the *Watch* tab. What that
does not reach is `ChannelView`'s own early returns — the profile, the settings
screen, a transcript — which are component state above the television in the
render. A device sitting in one of them was handed a film and went on drawing
it, which is the ask arriving and nothing happening.

The ask is an assignment rather than an offer: somebody at another of this
account's devices has decided the picture belongs on this glass, and there is
no tap coming on this one. So the second device replaces them. Cleared on
becoming the second device rather than on the ask, `screenAsked` being spent by
`App.tsx` before this screen mounts.

The notification pitch stays away from a device that is showing a film, for the
same reason and by the same accident: the pitch and the arrival both answer an
empty pane, they are set in the same commit, and the pitch is written second —
so a television covered the picture it had just been sent.

**What is deliberately not here**: nothing cancels an edit. A channel screen
that follows `channelId` to another channel keeps whatever it had open, which
is a separate question and one with an unsaved settings field in it.

## What is still not covered

The sequence across two real instances, which remains the outstanding half of
the watch-party walk — every app case here is one instance with the other's
effects written in by hand. The server half now has four.

# A film sent to a device opens the channel on it

The second device shipped this morning as a television — the picture, the
transport, *Full screen*, *Not on this device* and the three rungs, in place of
the channel screen — and then a watch party spread across a phone and a browser
showed no film anywhere. The webapp drew the whole channel with the transport
running, the *Watch on* switch on it reading *other device*, and no picture on
either one.

Three holes on the path a film takes to a second device, and they compound:
between them there was no sequence in which a television appeared unless the
target device already happened to have that channel open with a party loaded.

**Being asked to show a film subscribed to nothing.** `Picture` reads the film
off `channelViews[screenFor]` and nowhere else, and that map is filled only by
snapshots for channels the socket has asked to watch. `onScreenAsked` set the
role and told the server this device was busy — the repair of 2026-09-17 — but
never sent `watch.channel`. So a device handed a film it did not already have
open took the role, was counted as busy by the picker, and had nothing
whatsoever to draw. The comment on that handler has claimed since 2026-09-17
that "the channel opens on this device and starts playing"; the opening half
was never written, and the sentence read as a description rather than the
promise it was.

**Opening that channel by hand then gave the role straight back, and twice
over.** Both effects that release it are answered by the channel snapshot — one
reads `partyLoaded`, the other `inRoom` — and both are false for two quite
different reasons: the thing is over, and the first snapshot has not arrived.
Opening a channel sends `watch.channel` and the view lands a round trip later,
so that screen mounts in the second state every single time, and a person who
walked over to the television found it blank on the frame they arrived. It is
the rule `Picture` already states about a null `slot` — a thing that has gone
away and a thing that has not landed yet are not the same absence — missing in
the layer above it, in two places rather than one.

Both are guarded on `channelHere` now, which is the snapshot existing at all,
and both keep their original job: a party that really ends, and a person who
really steps out, still release the role. The second of the two was found by
the test written for the first, which is the only reason it is here: a pass
that guarded one effect and left its neighbour looks exactly like a fix from
the outside, and the neighbour is the worse of the two — it is the rule that
no film plays for somebody who is not in the room, and *we have not been told
yet* is not that person.

## The arrival is a state, not a reading of the role

Fixing those two leaves the film arriving as the floating corner rectangle,
over whatever the device was showing — most often the channel list. That is
exactly the state the television was cleaned up to stop being, and it is not
reachable by the exit the same morning closed: leaving the television releases
the role, but a television that was never opened never mounted `ChannelView`
and so has no exit to take.

So the film arriving opens the channel, on the *Watch* tab. The tab matters
only for the moment the role is given up while the channel is still open —
`atTheFilm` is `tab === 'watch' || secondDevice`, so any other tab would mean
the picture vanishing into a tab strip at the instant somebody declined it.

**`screenAsked`, a one-shot beside `screenFor`, rather than an effect on the
role itself.** The role is set by two quite different events. The server's ask
is somebody at another device deliberately sending the film here, and there is
no tap to come on this one, so it has to open itself. A local *This device* is
the device the person is already holding — and if they have pressed Home since,
the corner picture is the designed answer and dragging them back into the
channel would not be. A rule written against `screenFor` cannot tell those
apart; a field set only by the ask can. It is spent when taken rather than
latched, because a film sent here, sent away and sent back names the same
channel both times, and a latched string would make the second arrival no
change at all.

`realtime.watchChannel` rather than the app's, which also sweeps the channel's
notifications: being handed a film is not somebody reading the room, and a
television must not mark a ping answered for a person who is looking at their
phone. Nothing unwatches afterwards, deliberately — a snapshot outliving the
screen that wanted it is what `channelViews` already does everywhere else, and
`leaveChannelView` stays the one thing that drops one.

Five cases in `state/__tests__/screenRole.test.tsx` and two in
`ui/__tests__/channelSharing.test.tsx` § the second device. What none of them
reach is the sequence itself across two real instances, which is still the
outstanding half of the watch-party walk — every second-device test to date
sets `screenFor` directly, which is precisely why both of these survived the
thirteen cases written this morning.

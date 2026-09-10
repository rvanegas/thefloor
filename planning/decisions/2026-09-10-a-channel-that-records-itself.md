# 2026-09-10-a-channel-that-records-itself

TASKS.md § *Automatic Recording*: a channel is configurable to record
automatically, the runs can still be paused, stopped and resumed, and the
setting decides only whether the room begins with one.

## What was built

`autoRecord`, a boolean on `ChannelState`, set by `SET_AUTO_RECORD` and guarded
by `canEditChannel` — the same guard the name and the description have, and for
the same reason: it is shared furniture, and whoever changes it has to be in the
room. Off on every channel that has never been told otherwise.

`autoRecordStarter(state)` in `core/channel.ts` is the whole of the rule and is
pure: it answers with the person who would begin a run, or null. Every condition
beyond the setting itself is `canStartRecording`'s, delegated rather than
restated, so **an automatic start is possible in exactly the states the Record
button is** — two people in the room, or one and something playing; not during a
watch party; not while a run is already going.

The server asks it on every commit, in `ChannelRegistry.autoRecord`, and does
the one thing core cannot: mints the run id and applies `START_RECORDING`.

## The latch, which is the whole difficulty

*The setting determines only whether to begin* is easy to read and hard to
implement, because the natural rule — *record whenever you could* — makes Stop a
button with no visible effect. The state returns to idle, the condition is still
true, and a second run starts on the next commit.

So the room gets **one** automatic recording. `autoRecorded` is a set of channel
ids whose current occupancy has had its turn; it is spent by any run at all, the
automatic one or one somebody pressed Record for, and given back when the room
empties — the same event `settleEmpty` ends a run on. The consequences are worth
stating because they are choices rather than side effects:

- Turning the setting on mid-conversation **does** start a run, if that room has
  not recorded yet. It is the answer somebody expects from a toggle they just
  moved.
- Turning it on after somebody stopped a recording does **not**. Whoever stopped
  it stopped it, and a setting is not an argument with them.
- One person leaving and coming back is not a new room. The latch is keyed on
  the room emptying, not on arrivals, which is the version of this that would
  have restarted a stopped recording every time somebody's train went into a
  tunnel.

It is server-held rather than part of `ChannelState`, and that is not laziness
about the wire: it describes this occupancy rather than the channel, and a
restart empties every room by construction — a latch that survived one would be
a latch nobody set. The setting itself is durable, in `durableOf`, because it is
a thing somebody chose about the channel.

## Whose recording it is

The first present member, not the arrival that made recording possible.

The run is attributed — `runInitiator` keys the egress spans by it — so somebody
has to own it, and the choice is between the person who was already holding the
room and the person who just walked in. The person waiting in the channel is the
one whose channel is behaving as they arranged, so it is theirs. Guests are
never it, on the plainer ground that a guest cannot press Record either.

## What was deliberately not built

**No fourth button on the channel screen's Recording card.** That card is where
a run is driven; the setting is how the channel is set up, and it lives in
Channel settings with the name and the description. What the card gained is a
sentence, in two forms, because *idle* means two different things once the
setting is on: a room that is not yet recordable is waiting for its recording,
and a room that is recordable and still idle has already had one — which is
precisely the moment somebody wonders why nothing is happening.

**No exception for the watch party, and it is worth knowing about.**
`canStartWatch` refuses while a recording is going, and always has — a recording
made during a party is missing the thing everybody is reacting to. A channel
that records itself is therefore a channel whose party has to be preceded by a
Stop, which is one tap and a visible reason on the card. The alternative was an
automatic start that yields to a party somebody might be about to begin, which
is a rule nobody can see.

**No consent flow, and no change to the announcement.** A running recording is
already announced continuously to everybody in the room, guests included; a
recording that starts by itself is announced the same way by the same code. If
that announcement is not enough, it was not enough before this either.

**No shim.** Nothing is renamed and no existing field changes meaning, so there
is nothing for SHIMS.md to retire. The ordinary deploy order still applies and
in the usual direction: the server learns `SET_AUTO_RECORD` before a build that
sends it ships, or the toggle flips on screen and is corrected by the next
snapshot. A snapshot from a server that predates `autoRecord` says nothing, and
the app reads that as off.

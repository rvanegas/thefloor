# A room of one is a room — 2026-09-14

`canStartRecording` refused a run to anybody by themselves. It no longer does.
What it asks about the room now is `capturable` — *would this capture anything*
— rather than *is anybody else here*.

This reverses
`2026-09-07-a-phone-alone-is-the-only-thing-worth-retiring.md` §
*Recording is no longer a reason to open a microphone*, which is the entry to
read first if this one looks like an oversight being undone. It was not an
oversight; it was right when it was written, and the ground moved under it
within a day.

## What the old rule was

```ts
isPresent(state, userId) &&
(roomOccupants(state).some((id) => id !== userId) ||
  state.playback.status !== 'idle')
```

The second clause is `subscribeable` spelled out by hand, minus the watch
party. So the guard asked *is there anything here for me to listen to* and used
the answer to decide whether there was anything to record — which are not the
same question, and the difference between them is the person asking.

## Why it went, which is two arguments and neither survived

**The mechanical one.** Permitting a solo run made `isRecordingActive` a reason
to open a microphone all by itself, which put a *recording* clause inside two
predicates about *audio* and let a solo phone hold a channel open. True on
2026-09-07. Obsolete on 2026-09-08, when *Stepping in, and stepping in nearby*
made stepping into a room the whole of the claim on the audio system:
`core/micNeeded.ts` now opens the microphone on the way in, before anybody has
arrived and whether or not anybody ever does. A run asks for nothing that
standing in the room has not already taken. **The argument was retired by other
work the next day and the guard it justified was never revisited** — which is
the thing worth noticing here, rather than the rule itself.

**The product one.** *Recording here is a record of what happened in a room,
and nothing happens in a room of one; a note to yourself is a different
feature.* The same commit then admitted a room of one with a track playing,
which is a room of one. So the rule already did not mean what it said. What it
refused was the common case — somebody alone with something to say — while
admitting the odd one.

**And it was reachable.** The playback clause gates the *start* only. Load a
track, press Play, press Record, clear the track: `CLEAR_TRACK` touches nothing
but `playback`, and only `settleEmpty` ends a run, so a solo recording ran on
indefinitely in a room the guard would have refused. Verified against the
reducer before any of this was changed. A rule a four-tap sequence walks around
is not protecting anything, and the walk-around left no trace saying a rule had
been passed.

## What replaced it

`capturable(state)` in `core/channel.ts`, beside `subscribeable`, with
`microphoneOpen` under it:

- **anybody in the room with an open microphone** — in the room, not withheld
  by the floor or a party mute, not self-muted, and not a guest without a
  speech grant, that last clause being `microphoneNeeded`'s for its reason; or
- **a track playing**, which publishes under an *identity* of its own and lands
  in a *stem* of its own.

It counts the asker. That is the whole difference from `subscribeable` and the
reason the two are named rather than shared.

**It is the inverse of the server's `quiet`**, in `considerRetiring` — the
predicate that retires a room nobody is making a sound in. The pairing is the
argument: a room too quiet to keep open is too quiet to start recording.

**Two consequences, one of them stricter.** A paused track no longer counts
(the clause was `!== 'idle'`, now `=== 'playing'`); a paused track publishes
silence. And **a roomful of people who have all muted themselves can no longer
start a run**, where a second occupant used to be sufficient on its own. That
is the one place this is narrower than what it replaced, and it is deliberate:
it is the only configuration where the old clause said yes and nothing whatever
would have reached the file. Every other change is a widening.

## Record automatically widened with it, and that was chosen

`autoRecordStarter` defers to `canStartRecording` entirely, so it followed for
free: stepping into an auto-recording channel alone and unmuted now starts a
run there and then, where it used to wait for a second arrival.

**The coupling could have been broken and was not.** The invariant the old
comment states — *an automatic start and the Record button must be possible in
exactly the same states* — is one-directional in its reasoning: the harm named
is a channel recording in a state nobody could have started by hand. An extra
clause on the automatic side would have kept that safe. It was put to the
person at the prompt as a choice on 2026-09-14 and the coupled version was
chosen.

**So note the cost here, because nothing else will.** An *egress* now opens for
a lone speaker in every channel with the setting on, billed per speaker per
minute. The latch is per occupancy, so this recurs on each solo visit once the
room has emptied and filled again.

## What was left alone, and is the known bound

**A solo run ends after fifteen minutes with the screen off.**
`expireInattentive` keeps a present person only while `subscribeable` — and a
room of one is not subscribeable — so a phone that stops reporting attention is
stepped out, and `settleEmpty` ends the run behind it. Recording alone
therefore works indefinitely with the channel on screen and is capped at a
quarter of an hour in a pocket.

This was not changed, and the restraint is the point. Adding *or a run is
active* to that predicate would remove the last bound on an unmuted pocketed
phone: Rule A (`considerRetiring`) does not fire on somebody publishing, so the
attention clock is the only thing that ends it. The cap is a feature until
somebody has a reason it is not — at which point the reason belongs here, and
the thing to weigh against it is an egress nobody is listening to.

**`settleEmpty` was not touched either.** A run still ends only when the room
empties, never when it drops to one — which was already true and already
tested, and is what made *recording alone* a thing the system did before it was
a thing it allowed.

## What this does not do

It does not build voice messages. `planning/tasks/add-voice-messages.md` is
still the sixty-second, differently-presented thing, and *a note to yourself is
a different feature* remains true of the interface — what has gone is the claim
that the underlying run must be forbidden to make one possible.

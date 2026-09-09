# 2026-09-08 — The warning that would not go out

**`failing` is now derived from the room rather than accumulated from its
events**, and a lost stream on top of a lost socket reads as *reconnecting*
rather than *not receiving you*. Two small changes, one observed defect each.

## What was seen

A roster card reading **Present · not receiving you**, in red, under an account
that was back in the room and audible. It stayed for minutes and went only when
that person stepped out and back in.

The sequence was a force quit, and the box's journal has the whole of it —
these are the audio log lines shipped from the watching phone, in UTC:

| | |
| --- | --- |
| `04:32:29.885` | `connection lost acct_…` — quality `Lost`, the line appears |
| `04:32:39.881` | `sub - acct_…` — the old participant's track goes |
| `04:32:39.942` | `subscribe published acct_…` |
| `04:32:40.249` | `sub + acct_…` — **subscribed again, ten seconds after the drop** |
| `04:33` | the screenshot, still red |

Over the six hours around it: **three `connection lost` for that account
against one `connection restored`.** Two were never answered.

## What it was not

**Not a ghost presence, and nothing was owed a step out.** The account was back
within ten seconds, so *Present* was the correct thing for the roster to say
throughout. This is not the failure of
`2026-09-08-present-is-the-media-connection.md` returning by another route — the
socket path, the grace and the reconcile all behaved. Only the red line was
wrong, and it was wrong about a condition that had already ended.

Worth stating because the first two hypotheses were both about presence — a
grace period being rendered, and then a permanent presence — and both were
wrong. The log settled it in one read where the reasoning had not.

## The cause

`failing` was a set that only two events could empty: `ConnectionQualityChanged`
arriving again with a quality other than `Lost`, and `ParticipantDisconnected`.
**A phone rejoining under the same identity sends neither.** LiveKit replaces
the participant, so nothing further is reported about the one that went, and the
one that arrives was never in the set.

The comment above that handler had the reasoning already, and it is why the
`ParticipantDisconnected` mitigation was there at all:

> a participant who leaves stops reporting quality rather than reporting good
> quality, so anything derived from the last event alone would leave a name lit
> for ever

That is exactly what happened. The mitigation covered the participant who
leaves and not the participant who is *replaced* — and the room had said
something useful in the meantime, which was ignored.

## What was built

**Positive evidence clears the name.** `TrackSubscribed` and
`ParticipantConnected` remove an identity from the set: you cannot be subscribed
to somebody who is not reaching you, and somebody who has just joined is not a
connection that is lost. In the observed case the evidence was on hand four
tenths of a second after the replacement joined.

**And the set is intersected with the room on every relevant event.**
`pruneFailing` drops any identity `room.remoteParticipants` no longer holds.
This is the half that matters more: it makes the set **derived from the room**
rather than accumulated from events the room may or may not send, so nothing can
stay lit for somebody who is not there, whatever did or did not fire. The first
half answers the sequence that was seen; this one answers the sequences that
have not been.

Both log — `connection cleared` and `connection pruned` — for the reason every
line in that log exists: this is a warning about somebody else, and a walk that
finds it stuck needs to see which mechanism let go of it.

**`app/src/audio/__tests__/failing.test.tsx` is the regression**, and it was
checked in the only way worth checking: three of its four cases fail against the
code as it was, and the fourth — a genuine warning left alone while somebody
else arrives — passes both before and after, which is what keeps the fix from
being a deletion of the feature.

## The label, which is a separate defect

When `failing` and `disconnectedAt` **both** hold, the card now reads
*Present · reconnecting…*.

`failing` leading was right and stays right on its own: it is the media plane's
own judgement and lands while somebody is still mid-sentence, where the server
noticing a quiet socket cannot beat the heartbeat. But when both planes agree,
they are corroborating each other rather than describing different things, and
the phone has gone. *Not receiving you* then asserts the one thing that is not
true of it — that they are here and your voice is missing them. *Reconnecting*
is both what it is and what the grace period is about to resolve.

This would not have prevented what was seen: the socket had recovered, so
`disconnectedAt` was empty and only the stale `failing` was left. It is a
correction the screenshot led to rather than one it demonstrates.

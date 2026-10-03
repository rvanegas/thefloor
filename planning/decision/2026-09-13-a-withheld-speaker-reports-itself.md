# A withheld speaker reports itself

2026-09-13. The speaking outline froze the moment somebody claimed the floor:
whoever was lit stayed lit, and nobody else could ever light. It now keeps
telling the truth for the length of a claim, including about the people the
claim has silenced — which took a second source of the fact, because the media
plane cannot supply it. TASKS.md § *Speaking Indicator During Claim*.

## The thing that was actually wrong

The indicator is drawn from `SessionAudio.speaking`, which is LiveKit's active
speaker set held on the trailing edge. A claim is enforced by **unsubscribing
every listener from everybody but the holder** — never by muting the speakers,
which is a decision of its own and unchanged here.

LiveKit scopes speaker updates to subscriptions:

```go
// pkg/rtc/participant_signal.go
if p.IsSubscribedTo(participantID) || participantID == p.ID() {
    scopedSpeakers = append(scopedSpeakers, s)
}
```

So the instant the subscriptions go, every other device in the room stops being
told anything at all about the silenced. The set they were last seen in has no
expiry, and `ActiveSpeakersChanged` says who is speaking *now* rather than
firing continuously — so nothing was left that could remove them, and nothing
could add anybody either. The freeze was not a bug in the hold; it was the
absence of any further information.

**The one exception is the whole of the fix.** That same condition ends with
`|| participantID == p.ID()`: the SFU always reports a participant to
themselves. It is why `useSilencedNudge` can buzz somebody talking into a claim
— confirmed on a device at build 72 — and it means the withheld speaker's own
device is the single witness in the room. So it says: `channel.speaking` over
the socket, held per channel by the registry, carried back on the snapshot as
`ChannelView.speakingWhileWithheld`, unioned into the indicator.

## Why not the data channel, which is where this obviously goes

LiveKit tokens are minted `canPublishData: false`, deliberately — *participants
must not be able to republish their way out of a mute*. A data channel is a
peer-to-peer path the server cannot read, which in an app whose entire
guarantee is *the server decides who is heard* is a hole rather than a
transport. Opening it to carry a dot would be paying the architecture's central
price for its smallest feature.

The socket is the opposite in every respect: the server already fans channel
state out on it, it can refuse a report that is not true of the room, and the
app already renders what it is told. `attentive` is the same shape — a client
reporting an ephemeral fact only it knows, carried to the room on the snapshot
— and it is what this was modelled on.

## What is asserted, and what that costs

The report is self-asserted and no server can corroborate it. What the registry
checks is everything *around* it: the channel exists, the reporter is in the
room, and something is actually withholding them. Past that it is taken on
trust, and the worst available lie is a dot on your own card during a claim you
are sitting silent in. Given the alternative was an indicator that is wrong for
everybody for the length of every claim, that is a good trade.

**A stop is honoured unconditionally**, unlike a start. A report that crosses a
release, or arrives from somebody who has since stepped out, must still be able
to clear the flag; only the assertion is gated.

## Four ways it ends, three of which need no message

- **The floor is released, the party unmutes, they step out, they are
  retired.** `speakingWithheldIn` prunes against the channel as it is now, and
  the screen asks `isWithheld` again on its own snapshot. Nothing has to be
  sent, and the outline goes out on the snapshot that reports the release
  rather than on a message chasing it.
- **They stop talking.** The edge, which is the one report there is.
- **Their process dies mid-word.** The socket closing clears every channel it
  was watching. Unconditional, unlike the presence report beside it: another of
  that account's devices is not this microphone.

That leaves no case that expires on a timer, which is why there is no lease and
no heartbeat. What is sent is the **smoothed** signal — the same held value the
sender's own indicator draws — so a sentence's pauses cost nothing and a claim
somebody talks through costs two messages.

## An unsubscription is audio going away

Independently of the above, and the half that makes the indicator honest rather
than merely fuller: `TrackUnsubscribed` now feeds `onAudioGone`, as `TrackMuted`
and the two unpublish events already did. Without it the frozen set would
survive underneath the new source, and the two would be speaking for the same
person at once.

The SFU does send a forced *not speaking* as it drops a subscription
(`onSubscribeStatusChanged`), so this is largely a correction arriving twice —
by our rule and by its courtesy. Ours is the one that does not depend on which
version of LiveKit the box is running. The web hook got the same line; it keeps
no hold, so the stale set was the whole of its problem.

## Deploy order

Server first, then the client. The new client message is one an older server
answers with `Unknown message type.`, which surfaces as an error on screen; the
new snapshot field is one an older client ignores. So the ordinary two-step,
and no shim: nothing is aliased and nothing has to be retired later. A build
that predates the report is simply never shown as speaking through a claim,
which is what every build does today.

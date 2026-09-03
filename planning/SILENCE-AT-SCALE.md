# What a claim costs when somebody is listening

**A design for unbuilt work, written 2026-09-03.** Delete it when the work
ships, moving whatever survives into `decisions/DECISIONS.md`. One piece of it
is already built — the narrowing below — and is here for the reasoning rather
than as something outstanding.

It exists because *App Description* raised the theme of non-interruption, which
led to guests as an audience of arbitrary size, which raised a question nobody
had asked: what a floor claim costs the media plane when fifty people are
listening. `BACKLOG.md` § *A floor claim costs the media plane a call per pair*
is the outstanding half.

## The constraint everything sits under

**Silence is stated per pair and cannot be stated any other way.** There is no
"mute Bob" operation here. There is only "Alice stops receiving Bob", said once
per listener, because enforcement is `updateSubscriptions` on the *receiving*
end.

That is not a preference. `server/src/media.ts` § `setSilenced` records two
earlier attempts that both acted on the speaker and both failed against the
platform: muting their track cannot be undone by a server, and revoking their
publish permission unpublishes them, which tears down iOS's audio unit — so the
silenced person lost their microphone *and* their playback and got neither
back. Anything proposed here has to keep the pair shape.

So the cost of a claim is a product of two lists, and the whole question is how
big each list is and how many round trips each pair costs.

## What was narrowed, and what it bought

Until 2026-09-03 both axes of `assertSilence` defaulted to `statedIdentities` —
the roster plus **every** guest. A listener therefore appeared on the speaker
axis as well as the listener axis, and an audience grew both sides of the
product.

`core/guests.ts` § `statedSpeakers` is the speaker axis now: participants,
present or not, plus only the guests holding a microphone. A guest without one
has `canPublish: false`, so there is no track of theirs for anybody to be told
to stop hearing, and every pair naming one was a round trip whose only possible
answer was an empty track list.

Members who have stepped out stay on the axis, for the reason `statedIdentities`
keeps them: releasing a claim has to un-silence whoever walked out under it.

Six members and fifty listeners, per floor transition:

| | pairs |
| --- | --- |
| before | 56 × 55 = 3,080 |
| after | 8 × 55 = 440 |

Bounded × N rather than N × N. The retained state went the same way:
`silenceStated` is keyed per pair, so it was quadratic in memory too.

**At today's sizes this changed nothing measurable** — six people is 30 pairs
either way. It was worth doing because it made the immediate half agree with
`reconcileSilence`, which already narrowed.

## What is left, cheapest first

### The reconciliation restates what is still in flight

**The one with a failure mode rather than a cost.** `stateSilence` deletes a
pair from `silenceStated` *before* it calls, deliberately, so that a statement
in flight is never mistaken for one in force. `reconcileSilence` runs every
`TICK_INTERVAL_MS` (500ms) while the floor is held and restates every pair
whose signature does not match — which includes every pair still in flight.

So a burst that is slow to resolve is followed 500ms later by another burst,
and the reason it was slow is now worse. At 30 pairs resolving in milliseconds
over loopback this is invisible. At 440 on a box also running the SFU and
egress, it is the loop that turns a slow moment into a stuck one.

The fix is one condition: treat an in-flight pair as stated rather than
restating it. It closes the feedback path without touching any interface, and
it is the only item here worth doing before there is evidence.

### The same participant is fetched once per listener

`setSilenced` begins with `getParticipant(room, speaker)` to find the speaker's
tracks, so a claim fetches each speaker's record once per listener — 55
identical round trips for one answer. Each pair is therefore up to two
requests, not one: 440 pairs is ~880 requests, issued in a single burst with no
concurrency limit of ours (`run()` fires the promise and attaches a catch;
whatever bound exists comes from the SDK's HTTP client, which nobody has
checked).

### Batching by listener, which is the real answer

`updateSubscriptions(room, listener, trackSids[], subscribe)` takes an **array**
of tracks, and a floor claim has the same shape for every listener:
unsubscribe every publishing speaker except the holder, subscribe the holder.
That is two calls per listener — about 110 for fifty — with every track id
coming from one `listParticipants`, which `audioTracks` already does.

O(listeners), constant 2, instead of O(speakers × listeners).

**Not worth building yet.** It changes the `MediaServer` interface, the
`MemoryMediaServer` fake, and the per-pair signature bookkeeping
`reconcileSilence` compares against — real surface area, in exchange for a
scale that does not exist. It is written down here so that the next person to
meet the number does not re-derive it.

## What would settle whether any of this is needed

**Nothing here is measured.** There is no number for what LiveKit's Twirp
endpoints sustain on this box, and `bin/usage peak` — which answers the
equivalent question for recorded participants against
`track_cpu_cost` — has no counterpart for subscription statements. A claim in a
channel with a real audience, timed, is the missing evidence, and it cannot be
gathered until guests-as-audience is something people actually do.

## And it is bounded from the other end, if anybody decides that

All of this is the cost of an **unbounded** listener count. The seat guards that
exist bound time rather than number: `GUEST_SESSION_TTL_MS` bounds a departed
guest's absence, the emptying rule ties a link to the conversation's life, and
knock/admit is per-person but manual — a member taps admit for each arrival,
inside the conversation, which is its own interruption and its own argument.
Nothing counts concurrent seats; `MAX_CHANNEL_PARTICIPANTS` binds participants
only.

A cap on concurrent guest seats, or a listener role that is not a seat and does
not knock, would make the whole of this moot. That is a product decision rather
than a media one — `TASKS.md` is where it belongs if it is taken up.

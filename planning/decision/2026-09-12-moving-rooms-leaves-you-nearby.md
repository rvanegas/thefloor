# Moving between channels leaves you nearby, not stepped out

2026-09-12.

## The defect

Presence is exclusive: a person has one microphone and one pair of ears, so
`stepOutOfOthers` in `server/src/channels.ts` removes you from every other
channel the moment you enter one. That much is right and stays.

What it did to get there was a plain `STEP_OUT` — the `chosen` exit — which is
the one thing the act is not. *Stepped out* means somebody left **deliberately**,
and the whole purpose of the word is to tell the room to give up on them and
stop expecting them back. Nobody chose to leave the room they are removed from
here. Worse, the act that removed them is the strongest evidence the system ever
gets that they are holding their phone and looking at it: they just walked into
another room.

So the one person who was demonstrably reachable was the one the roster told
everybody to give up on. Somebody stepping from one channel to the next fell two
rungs in the first — past *Nearby*, which is exactly the claim their situation
supports — instead of one.

## The correction

`stepOutOfOthers` dispatches `DECLARE_NEARBY` rather than `STEP_OUT`. Its
present branch is precisely the transition wanted: `stepOut` with the `nearby`
exit, which puts them in `waiting`, stamps `lastPresentAt` — they *were* here
until this moment — and dates the wait from now rather than from whatever the
last heartbeat happened to be. See `Exit` in `core/channel.ts`, whose rows are
the whole difference between the ways of leaving.

Three things follow, and each was checked rather than assumed.

**It announces nothing**, which falls out of `commit` rather than needing a
flag: the `declaredNearby` diff there asks `!before.present.includes(id)`, so
anybody who *was* in the room and is now nearby is passed over. A declaration
announces because a declaration is an arrival; this is a departure, and ringing
the absent to report one would be that rule stood on its head. Asserted from
both ends — `participants.test.ts` for the rung, `push.test.ts` for the silence
— because it would come back the day that clause was relaxed.

**Nothing about exclusivity loosens.** Nearby holds no audio session and no
media subscription, so the one microphone and one pair of ears are still in the
channel just entered. Knocking on three doors in turn now leaves you nearby in
the first two and present in the third, until the attention clock ends each of
them at the fifteen minutes it always was.

**No shim, and no wire change.** `waiting` is the field every build has always
rendered as *Nearby* with a ping beside it. A client that predates all of this
draws the new state correctly, because it is not a new state — it is the
existing one, reached by a route that used to reach the wrong one.

## What the correction falsified

Two places had written the old behaviour down as an invariant, and both said
some version of *the two cannot both be true of one account for long: entering
steps you out of everywhere else*. Present here and nearby there is now the
ordinary state of somebody who has moved.

- `core/protocol.ts`, on `nearby` in both `RejoinableView` and its neighbour.
  The surviving claim is narrower and is kept: you cannot be present in a room
  and nearby in **that** room, `ENTER` clearing the wait.
- `app/src/ui/HomeView.tsx` suppressed the entire nearby tier whenever anything
  was live, on that premise. It now filters out the live channel alone and
  draws both tiers at once — under the live bar and never beside it, which is
  the layout the surrounding comment already described. Left as it was, the
  change would have been invisible to the one person it is about: everybody
  else's roster said *Nearby* about them while their own Home drew no bar, and
  the bar is the way back.

## The client's own record, corrected in the same pass

`AppProvider.nearbyIn` was a single channel id, and `nearbyArrival` a single
`{channelId, who}`. Nearby has never been exclusive — the wire says so, `nearby`
being a bit on every home entry rather than an id on the snapshot — so
declaring in a second channel silently forgot the first. The server went on
listing both waits, Home went on pinning both bars, and the push still arrived;
the only thing that stopped happening was the offer, which is the whole of what
being nearby does for the person who declared it.

Both are now keyed by channel, and `useNearby` watches every declared room with
one remembered roster apiece rather than one view and one id. `dismissNearbyArrival`
takes the channel, since *Stay nearby* in one room says nothing about an offer
standing in another.

This is separate from the change above and would have been worth making anyway.
It is in the same commit because the first makes the second reachable far more
often: moving between rooms is now a way onto the *Nearby* rung that takes no
tap at all.

## The other direction: a room people are standing beside

Asked for in the same session, and it is the same observation taken from the
other end. *Nobody present* had been treated as *nothing happening*: a channel
with an empty roster sorted into the tier below LIVE and was ordered by how long
it had been quiet. But a room two people are nearby in is one step in from being
a conversation, with people who have already said they can be reached — which is
a far stronger reason to put it in front of somebody than idleness is to sort it
down. Ordinary idleness is in fact the wrong measure for such a room, since what
would be worth reporting has not happened yet and a step in is what would make
it happen.

`nearbyCount` is the new wire field on `RejoinableView` and `InviteView`: how
many people **other than the reader** are in `waiting`. `isLive` in
`ui/ChannelsView` reads it as a second way of being live, so the channel is
hoisted into LIVE. The row reads *2 nearby*.

Three details, each of which could have gone the other way.

- **The reader is left out of the count**, on `lastPresenceByOthers`' reasoning:
  a channel is not worth hoisting in front of somebody on the strength of their
  own reachability, and a channel the reader is nearby in is drawn as a bar in
  the tier above rather than as a row at all.
- **Present and nearby are not added, and not said together.** A row reading
  "1 present · 2 nearby" would put the weaker claim beside the stronger one and
  leave the reader doing arithmetic. Anybody present and the row says what every
  build has said; nobody present and it says the only true thing there is.
- **A guest's row says nought**, not the real number. Who is standing beside a
  room is not a guest's to read, on the same rule that makes their roster
  names-only. That is a rule and not a fallback, so it stays when the optionality
  goes — SHIMS.md gate 189 says so.

## The cap: five rooms, and the sixth evicts the oldest

The two changes above both make the *nearby* rung easier to get onto — one by
removing the tap entirely — and Home pins a bar for each. Enough bars and the
channels and the contacts are pushed off the bottom of the phone, which costs
the reader more than the bars were ever worth. So `MAX_NEARBY_CHANNELS = 5` in
`core/constants.ts`, enforced by `capNearby` in `server/src/channels.ts`.

**It is a limit on the screen, not on the state**, and that is worth saying
plainly because nothing about the mechanism wants one: being within reach of a
room costs no audio session, no media subscription, and one bit on a snapshot.
The server would carry twenty happily. The tier above the lists would not.

**First in, first out.** The wait held longest is the one least likely to still
be true — it had a quarter of an hour to age out on its own — and it is the only
order that leaves what somebody just did intact. Dated by `nearbyMs`, which is
the age of a wait however it began: from the declaration where there was one,
and from the last sign of life where a connection simply ran out of grace. A
wait with no dateable start sorts as the **newest**, an absent stamp being no
evidence of staleness; reading it the other way would evict on missing data
ahead of a wait that is measurably old.

**Whatever caused the call is never the thing evicted.** `keep` is excluded
before the sort. It sorts as newest anyway in every ordinary case, so this is a
guard rather than the mechanism — but answering a tap by undoing it is the one
outcome a reader could not possibly interpret.

**All three ways onto the rung are capped**, which took three call sites
because there is no single chokepoint: the declaration, in `dispatch`; the
implied one, in `stepOutOfOthers`; and the inferred one, in `tick`, where a
connection running out of grace is the only way on that nobody chose. The tick
collects the users who gained a wait and caps each once after the emit, rather
than stepping out of channels while iterating over them.

**An evicted channel reads as *Stepped out***, and that is right: there is no
rung below *nearby* but that one. It is not the room-to-room move the first
section is about — it is a claim withdrawn because too many were held at once.

The boundary worth remembering, because it is off by one from the obvious
reading: **walking through six rooms in turn leaves five waits and one
presence**, not six waits. Presence is not a wait. It takes a seventh room to
evict anything by walking.

## What was deliberately not done

**The move raises no arrival offer on the phone that made it.** Being nearby in
the room you just left is a state the server holds; the device's own
`nearbyIn` records declarations made *here*, and this one was not — it is a
consequence of entering somewhere else. Offering a step in to the room behind
you while you are standing in a conversation, microphone open, is an
interruption rather than an answer. The push still reaches the same phone under
the ordinary rule, and the roster still says *Nearby* to everybody else, which
is what the rung is for.

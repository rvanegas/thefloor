# Playing is not tidying

`canControlPlayback` asks presence. It asked `hasTheRoom` — you are in the
channel, or nobody is — which meant a member looking at an *empty* channel's
screen could play, pause, seek, re-level and clear the shared track without
ever stepping in. Reported from build 261, done rather than deduced.

The guard is now `mayPutSomethingOn`, which `canLoadTrack` and `canStartWatch`
already were, so the four guards over the two shared features agree again.

## The seam this closes

2026-08-24 split driving from putting something on: *starting is for whoever is
in the room, driving is for whoever the room belongs to*. The argument for the
loose half was tidying — an absent member pausing a track somebody left running
on an empty channel is clearing up after a room that has gone home — and it
reads well for *pause* and *clear*.

It does not survive *play*, which the same guard governs. Playing a track is
not tidying up after anything; it starts a sound in a channel, and an empty
channel is empty this second and need not be the next. What the person stepping
in walks into was chosen by somebody who is not there, which is the case
`mayPutSomethingOn` was written to refuse — the rule was already in the file,
one guard along, arguing against the branch that let this through.

The watch party reached the same place hours earlier by a different route
(decisions/2026-09-20-watching-is-something-you-are-in.md): a seek from outside
the room moves a picture somebody is watching. Two features, two failures, one
rule. The divergence that decision recorded lasted a day.

## What keeps the empty half

`hasTheRoom` is not going anywhere. It still governs what a conversation can
*see* — the channel's name and description, who is invited, the clipboard, a
recording's name — where an empty channel really is nobody's conversation to
interrupt and the act leaves no sound behind. What left the list is the one
entry that made noise.

## Cost, and what it is not

One tap. A member who wants to pause a track on an empty channel steps in
first, which is the same cost the watch party's transport now carries and the
same one loading has carried since August.

Not a wire change: the guards are in `core/`, which both ends import, so the
greyed control and the refused action move together. Not a floor change either
— a claim still confers exclusive control, and `floorPermits` is untouched.

## Shape of the change

`core/channel.ts` (`canControlPlayback`, and the prose on `holdsSharedControl`
and `mayPutSomethingOn`), one caption in `app/src/ui/ChannelView.tsx` that
existed only for the member outside an empty channel, and the tests that
encoded the old half in `core/__tests__/room.test.ts`,
`core/__tests__/watch.test.ts` and `server/__tests__/shared-audio.test.ts`.

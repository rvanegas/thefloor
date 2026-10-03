# The recording transport needed presence

2026-09-12.

Every act that reaches into a channel is guarded by where the actor is
standing. `hasTheRoom` governs one family — the name, the description, the
clipboard, invitations, guest links, what is playing — on the argument that
nobody reaches into a conversation they are not in, with an empty channel
excepted because there is nothing there to interrupt. A second family asks
plain presence, because the act is about the room rather than about the
channel: claiming the floor, muting somebody, answering the door, starting a
recording.

**The recording transport was in neither.** `canPauseRecording` and
`canStopRecording` asked one question — whether the floor had silenced the
actor — and `canResumeRecording` took no user at all, only a state. The
membership wall in `reduce` was the whole of what stood between a run and a
member who was somewhere else. So anybody who belonged to the channel could
open it from Home without stepping in and pause, resume or end the record of a
conversation they were not in and could not hear.

It reads like an oversight because it is one: the rule was written for
`canStartRecording` and the other three were written as transport controls
rather than as acts. The glossary had said *started and stopped by anybody
present* the whole time, which is the case AGENTS.md describes — a name in
the code and an entry in the glossary disagreeing means one of them is a bug,
and here it was the code.

**All four now ask `isPresent`.** The floor clause the two cutting actions
carried is unchanged and is stacked on top of it: a silenced party still may
not cut off the record while they have no voice in the channel.
`canResumeRecording` takes a `userId`, which is the signature change — a
guard with nobody to authorise cannot refuse the person who is not there.

**Presence rather than `hasTheRoom`, and the two are indistinguishable here.**
A run cannot outlive the room: `settleEmpty` ends it on the transition to
nobody present, so there is never a running or paused transport in an empty
channel, and the empty-channel half of `hasTheRoom` could not be reached even
if it were asked. Saying `isPresent` puts this in the family it belongs to and
states the rule rather than what the rule happens to collapse to. There is a
test asserting the collapse, so a later change that let a run outlive the room
would fail on the reasoning rather than silently widen the guard.

**The screen says why.** A member looking at a run in progress from outside
the room now gets *Step in to pause or stop this recording* under the dead
buttons, placed above the silenced line rather than below it — `isSilenced`
asks only who holds the floor, so it answers true for somebody who is not in
the room at all, and its sentence ends "your microphone is still being
captured", which for them is not true.

**No shim, and nothing owed to older builds.** The wire is unchanged, the
server is strictly stricter than it was, and a build that predates this shows
an absent member live buttons whose taps the server ignores — the same thing
every other guard already does to a client whose copy of `core/` is behind.

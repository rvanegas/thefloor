# A phone alone is the only thing worth retiring — 2026-09-07

**The rule removed the one person who was doing something.** On 2026-09-06 a
member was stepped out of an active channel after fifteen minutes. His phone
said so itself, which is the first time one of these has been settled by
measurement rather than inference:

    attention expired after 900s others=1 audible=0 fg=F gap=30s

He was publishing; the other occupant was muted and listening. `attend`
discards your own voice from `audible`, so the only participant *making* the
audio was the only one whose clock was ageing, while everybody listening to him
was refreshed by him. Rule B systematically retires the source and keeps the
audience.

Rule A was excluded twice over: it needs `publishing === 0` and his microphone
ran unmuted throughout, and it retires everybody, while the other occupant's
span carries on past the step-out.

**The same line settled the open question `b577c65` was written for.** Sixteen
consecutive looks at `gap=30s` across the whole window: iOS does **not** freeze
these timers behind a live LiveKit connection. No frozen-clock explanation is
available for this or any earlier report, and any future one has to produce a
line showing a gap.

## What could not be fixed by measuring better

A room somebody walked away from and a room where two people are deliberately
quiet — music with a muted listener, two people asleep — produce identical
readings, and the right answers are opposite. Nothing taken from the audio
separates them. That is not a gap in the instrument; it is the whole of the
problem, and it is why refining the measure was abandoned.

**So the device clock is scoped to the case it can judge: a phone standing
alone.** Rule B now fires only when nobody else is in the room. Rule A is
unchanged and still retires a room in which nothing is published unmuted, which
covers two pocketed phones that are both muted.

**Two pocketed phones with open microphones are therefore never retired.** That
is the decision rather than a gap. The eventual bound is the battery.

## Departure counts as evidence, on a phone

`attend` refreshed `heardAt` on an arrival and not on a departure, on the
stated argument that *somebody leaving says nothing whatever about whether you
are still here*. True as literal evidence, and the wrong rule once the clock is
solo-only: becoming alone is exactly the transition that arms it, and the
newly-solo person would inherit whatever was left of a window that started
while the others were still talking. The last person out of a room could take
somebody with them.

The replacement premise is that the clock measures **how long the situation has
been unchanged**, and a departure changes it.

**The web does not take this, and does not take the solo gate either.** A phone
has suspension as a backstop; a browser tab has none, and an abandoned tab in
an occupied room is the entire reason the web clock exists. Handing it a fresh
window on every departure would make it never expire. Unlike the foreground
rule of 2026-09-06 this could not be kept native-only in the hook — it lives
inside `attend`'s diff of `others` — so `Look` carries an explicit
`departureCounts`.

## Recording is no longer a reason to open a microphone

`canStartRecording` now requires somebody else present, or media playing.

Recording here is a record of what happened in a room, and nothing happens in a
room of one; a note to yourself is a different feature. Permitting it made
`isRecordingActive` a term inside two predicates about *audio*, which is how a
solo phone came to hold a microphone open with nobody there.

`isRecordingActive` is now **redundant rather than removed** in both
`microphoneNeeded` and `channelHasAudio`: whenever a run is legal, the
occupancy clause has already answered true. `core/__tests__/micNeeded.test.ts`
pins that redundancy, so relaxing the guard fails a test rather than silently
reopening the hole.

The guard is on *starting* a run, not continuing one — a recording whose other
participant leaves goes on, and ends when the room empties.

## Every arrival is announced

`announceActive` fired only on the empty-to-occupied edge, on the argument that
somebody joining a conversation in progress changes nothing worth walking over
for. The argument was about the arrival and missed the room: **a channel that
never empties can never produce that edge again**, so an occupied room swallowed
every notification anybody outside it would have received, permanently.

That was the harm both attention rules were written to prevent, and it is now
load-bearing in the other direction — an occupied room is a state this system
deliberately allows to persist, so it must stop being one that silences
everybody else. It fires on any arrival now. The per-recipient window in
`announceActive` was always the real rate limiter; the edge was a second one
doing the same job worse, and `revive` still pre-stamps every participant so a
deploy cannot storm.

**It also had to be told who arrived.** It read `present[0]`, which was correct
only because the room had been empty. On any other arrival that names whoever
has been there longest, so the notification would have said the wrong person.

## The exit says what it was

Rule B sent `STEP_OUT`, which the reducer files as `exit: 'chosen'` — a tap on
the button. It now sends `ATTENTION_EXPIRED`, the same action Rule A raises, so
grepping for one finds the whole mechanism.

**It does not leave them *Nearby*, deliberately.** `inattentive` clears
`waiting`, and the reason here is not the one Rule A gives: the fifteen minutes
it takes to reach an expiry is the same fifteen minutes Nearby would grant, and
it has been spent whether or not anybody was shown it. Granting a fresh window
afterwards is the double count `WAITING_WINDOW_MS` exists to prevent.

Additive on the wire, so it needed ordering and no compatibility window — the
server learns the action first. Three sites are easy to miss and all three
fail silently: `CLIENT_ACTIONS` in `channels.ts` gates whether a client may
send it at all; `displaceOtherSessions` in `ws.ts`, or a sibling session
re-sends `ENTER` from a stale belief and undoes the expiry; and the standing
check in `app/src/api/socket.ts`, or a reconnect re-enters the channel it was
just expired from.

## What this does not do

`waitingAlone` still opens the microphone at step-in and still has no timer of
its own — Rule B is that timer, which is why the keep-alive's own window could
stay deleted. Presence still follows the websocket rather than the room; see
BACKLOG.md § *Presence follows the websocket, not the room*.

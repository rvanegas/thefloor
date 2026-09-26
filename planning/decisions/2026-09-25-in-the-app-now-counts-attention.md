# "In the app now" counts attention

2026-09-25. A contact's row on Home said *In the app now* about somebody who
had the desktop app up and had been unresponsive for hours. It was not wrong
about anything it was measuring: the row asked whether that account held a
session socket, and it did, because the machine was awake.

## What was wrong

**The socket is the right kind of evidence and the wrong question.** It was a
fact rather than a subtracted timestamp, deliberately — `describeAvailability`
reads it first because somebody sitting in a channel for an hour sends nothing,
and inferring idleness from the last message is exactly what the contact row
before it got wrong. So the fix was never a shorter timeout on the socket. What
a socket proves is that a process is running; what the row claims is that a
person will answer.

**The evidence that answers it already existed and was scoped to rooms.**
`ClientMessage.attentive` is touch-driven on the web and foreground-driven on a
phone, and it names *channels* — and `SocketClient.attentive` dropped the
message outright when the list was empty, on the stated reasoning that
"somebody on Home with no channel open and standing nowhere is attending the
application and no room in it, and there is no clock that fact belongs to".
That sentence was true and is what made the defect unreachable: the one signal
distinguishing an attended app from an abandoned one was never sent by the
population the complaint was about.

**And the timestamp underneath was the same lie told as a number.** This is the
part that turns a one-line change into a real one. `describeAvailability` falls
back to *Last seen N ago*, and under `agoOrNull`'s sixty-second floor it returns
*In the app now* instead — while `accounts.last_seen_at` is rewritten on every
heartbeat. Narrowing the boolean alone would have changed nothing whatsoever on
the screen.

## What was built

**An account-level attention clock, `accounts.attended_at`**, written on every
`attentive` report and read by both halves of availability. A column rather
than a map beside `channels.attentiveAt`: the boolean needs no durability —
a restart drops every socket, so it is false by construction — but *Last seen 3
days ago* has to survive a reboot.

**The client now sends a report that names no room.** One guard deleted. That
is the whole of the client change, `useAttention` having gathered the evidence
on both platforms since 2026-09-09.

**`isAbout` in `ws.ts` is the predicate, and it is an AND**: a live session
socket, and attention inside `ATTENTION_WINDOW_MS`. The socket half is what
makes the claim revocable at once — closing the app is immediately truthful,
where a window has to run out — and it is also the only thing that can carry a
report. It replaced `hasConnection` at the one assignment that ever read it,
`reachability.inApp`, whose two callers are the contact row and the profile
screen. Push delivery stopped reading it in September 2026, so nothing about
notifications moved.

**Both halves read one clock.** `Accounts.lastAttendedAt` is what a screen is
told, and `last_seen_at` is no longer rendered anywhere — it stays as proof of a
*connection*, which is what the notification pause and `bin/people` want.

**`announcedAbout`, a delivery record rather than a second clock.** `inApp` used
to move only when a socket did, so two call sites knew the transitions between
them. A window running out is a third and has no event, so every path that can
move the fact now calls `announceIfChanged`, which compares what is true against
what was last said. Membership of the set *is* the last answer, so it cannot
drift and cannot grow: being about requires a socket, and every way of losing
one ends in the same call.

**The sweep notices the expiry**, in the loop that already walks every
connection on a clock — the same argument the re-entry window in it is there
under. A `setTimeout` per account would be a second schedule to cancel, re-armed
twice a minute by the reports themselves. A person attending for an hour reports
a hundred and twenty times and their contacts hear once.

**`ACCOUNT_ATTENTION_BUILD = 294` is the shim**, and it needs two halves for one
answer: a connected device below it vouches for its owner by existing, and a
null `attended_at` falls back to the heartbeat for the sentence. Every install in
the field when this shipped fails the new rule innocently — below 175 it reports
no attention at all, and from 175 to 293 it reports only rooms. Without the
fallback the whole population would read as away. SHIMS.md carries what may be
deleted with it and what may not.

## What was considered and not built

**A second, shorter window.** *In the app now* is a louder claim than *nearby* —
it invites somebody to call — and five minutes was arguable. Fifteen won on one
property that a shorter number destroys: a pocketed phone standing in a channel
stops reporting and is retired from the room on this same clock, so a contact
row and a roster cannot end up describing one silence differently. A second
literal would also be a second thing to keep in step, which
`core/constants.ts` already says is where the split goes if it is ever needed.

**Vouching for somebody because they are present in a live channel.** It would
keep a person on a call from reading as away while their phone is in a pocket.
Rejected as the second judge of presence that `core/channel.ts`'s `isWaiting`
carries the scar from: one thing answers *are they about*, and the room-scoped
window goes on answering only what it answers now. It is also unnecessary —
under one window the two expire together anyway.

**Changing what a push notification is suppressed for.** Nothing to change:
`liveSessions` and the rule that read it went in September 2026, and
`reachability.inApp` has had two readers since, both of them captions.

**Back-filling `attended_at` from `last_seen_at`.** It would have handed every
abandoned client a fresh stamp and asserted precisely the thing that was wrong.
Null means nobody has said, which is true.

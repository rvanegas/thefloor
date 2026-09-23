# A week of ignored arrivals pauses the arrivals — 2026-09-23

An account that has been sent arrivals for a week without once opening the app
stops being sent them. It resumes the moment the person is seen, and being seen
is what it already was — `markSeen`, which the socket calls as it opens, on
every message it carries and as it closes.

**Arrivals and nothing else.** `invited`, `pinged` and `accepted` go on
reaching a paused account, and none of them counts towards the week.

`accounts.unanswered_since` is the whole of the state: the moment the oldest
arrival nobody has come back for was announced, null when nothing is
outstanding. The push notifier in `app.ts` stamps it on the way out and reads
it on the way in; `markSeen` clears it, which costs nothing because that UPDATE
was already being written on every heartbeat. `NOTIFICATION_PAUSE_MS` in
`push.ts` is the week.

## Why pause anything

The move available to somebody who has stopped answering is the iOS switch, and
it is the worst outcome this system has:

- **It is permanent in practice.** Nobody goes back into Settings to turn an
  app's notifications on again.
- **It applies to everything**, including the notifications a human aimed at
  them by hand.
- **It is invisible from here.** APNs answers 200 for a live token whose app
  has been silenced, so the server cannot tell a person who switched it off
  from one who is simply out. Nothing on the box would ever record that it
  happened.

Against that, a pause costs some announcements that were not being read anyway,
is reversible by the person opening the app, and leaves a number in the log.
Going quiet first is the cheaper of the two silences, and it is the only one
this end gets to choose.

A week is generous rather than tuned, deliberately. No ordinary holiday reaches
it and nothing about the product's rhythm suggests a sharper figure; picking a
number that would need defending on data nobody has is how a threshold becomes
a thing to fiddle with.

## Why only arrivals

The argument above is an argument about **volume**, and only one kind arrives
in volume: a room reporting who walked into it, which in a busy channel is
several a day and which nobody composed. That is what fills a lock screen, and
it is what somebody is reacting to when they reach for the switch.

The other three are one person doing something aimed at one other person —
adding them to a channel, calling them into one, taking up an invitation they
sent. They happen a handful of times, not a handful of times a day. Withholding
them would spend the entire cost of this feature on the notifications least
responsible for the problem, and it would make the pause self-perpetuating: a
note from a human is the likeliest thing to bring a lapsed person back, and it
would be precisely the thing withheld.

**The gate governs both halves**, which is the part worth not losing later.
Only an arrival is refused, and only an arrival stamps `unanswered_since`. A
clock fed by notifications the rule would never withhold would be measuring one
thing and deciding another — a single ping could pause a month of arrivals on
its own. `server/__tests__/push-pause.test.ts` ends with the two tests that say
so, which are what fail if somebody later reaches for `userIds` without reading
the kind.

## A stamp, not a subtraction from `last_seen_at`

The obvious implementation is to compare `last_seen_at` against a week ago, and
it is wrong in the one direction that does not show up: it pauses somebody
nobody has had reason to notify. An account can be absent for a year having
ignored nothing, and its first arrival is the one most likely to bring the
person back. What is being measured is *arrivals received and not answered*,
which is a second fact, so it is a second column.

For the same reason the stamp is written only when it is null. Overwriting on
each send would restart the week every time, and a person in a busy channel —
exactly the person this exists for — would never reach it.

And the stamp goes on whoever was actually sent to, after the address lookup:
somebody with no registered device has ignored nothing, and starting a clock on
them would pause an account that was never reachable at the moment it finally
becomes one.

## What it is not

Not a *notification level*, which is a preference somebody set per channel and
which the pause neither reads nor changes. Not the *notification answer*
(`accounts.notifications`), which is what the phone reports about permission.

Nothing on any screen says an account is paused. The traces are a `paused`
count on the `push sent` and `push skipped` log lines, a `push paused` line for
a `debug` account, and a `paused` column in `bin/people` — which exists because
the state is otherwise unobservable, and an operator reading a quiet log has no
other way to tell a paused account from an unreachable one. A banner telling
somebody *we have stopped announcing arrivals to you* would be an interruption
about interruptions, sent to the person who demonstrated they did not want one.

GLOSSARY.md § *Paused (of arrivals)*. Most of the suite is about who is **not**
paused, because pausing the wrong person is the failure nobody can see from
here.

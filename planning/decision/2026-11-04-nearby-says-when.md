# Nearby says when

*Nearby* was one bit — within reach, for fifteen minutes — and a ping was a
summons with no way to answer it but to come. Todd's account of being pinged
in the middle of a recording (the call of 2026-10-07, and the task
*Answer a ping with when you can come*, which this closes) was that his
silence could have meant anything, and that he wanted a one-tap answer of
three kinds that are not the same: *in the flow, don't know when*; *a few
minutes*; *free at a known time*. A loose negotiation of time, as the path
from asynchronous to synchronous.

**What was built:** a declaration may carry a *when* — `NearbyWhen`, three
kinds, in `ChannelState.nearbyWhen` beside `declaredNearbyAt` and cleared with
it. It is said from a chooser under the People roster, *When can you come
in?*, drawn while you are nearby; and from three buttons on a ping's
notification. It is shown on the declarer's People card in place of the
attention clock. A named time holds the declaration open until the time plus
the ordinary window, and sets a local reminder on the declarer's phone. When
a ping is open on you, the person who sent it is told once, as a `pinged`
notification. Nobody else is told anything a declaration did not already
announce, though a declaration that brings its *when* with it says it in the
arrival.

**Settled with Rodrigo before building:** both surfaces, not one; a named time
holds the state rather than lapsing at fifteen; the reminder, the sender, and
the card — and no other push.

## Why it is a declaration and not a reply

`settle-whether-ping-is-enough-on-its-own.md` had already said what to do if
ping was not enough: make it carry more — a reason, a time, a thing to answer
— and never grow a thread inside the app. An answer that was a message would
be the first message in a thread. So the answer is a *state*, the same state
as tapping *Nearby*, with a qualification; the notification to the sender is
the only thing that makes it an answer, and it goes once per ping because a
corrected answer arriving as a second audible notification is a conversation.
The route is `POST /channels/:id/nearby` rather than the socket only because
the buttons may run with no socket open.

A sender who is themselves nearby is absent, so the declaration would also
announce *Bob is nearby, …* to them a beat before the answer said the same.
The answer marks them announced first, so they get one notification.

## Why three kinds and not a number

*In the flow* and *a few minutes* are not durations nobody bothered to type.
*I don't know* and *not long* are the answers, and a guessed figure would be a
promise nobody made. Only the third names a moment, so only the third holds
the state open or sets a reminder. The chooser offers *20 min* and *1 hr* for
it rather than a time picker: one tap was the whole of the ask, and a wheel is
not one tap. Plain *Nearby* stays one tap on the rung and means what it
always did; the chooser is a second tap for somebody with more to say.

## Why a named time holds the wait open

Before the time, inattention is exactly what was promised — they said they
were busy — and retiring them for it at minute fifteen would turn *free in
40* into a disappearance at fifteen. After it, they get the window a plain tap
gets, so *free at three* is still nearby at five past. The card then reads
*free now*, never *late*: it reports what somebody said and has no business
grading it. `MAX_NEARBY_AHEAD_MS` caps the time at four hours, clamped rather
than refused, because past an afternoon this is a calendar entry.

## The buttons open the app, and that is the library's limit

The plan was buttons that answer without opening anything,
`opensAppToForeground: false`. The installed `expo-notifications` 55 says in
its own types that such an action **never reaches a listener when the app has
been killed**, and its background task runs for action taps on Android only.
On iOS that is a button which answers when the app happens to be suspended
and silently does nothing otherwise — which is most of the time somebody is
in the flow. A launch that answers beats a button that sometimes does not, so
the three buttons open the app; the answer is held until sign-in is restored
and then sent, and the response is cleared so a later launch cannot replay it.

**Not built, and the way to do it if wanted:** a native
`UNUserNotificationCenterDelegate` handler that answers over HTTP without
starting JavaScript. iOS will launch an app in the background for a
non-foreground action; it is Expo's JS bridge that cannot use that. It would
be a native module and is a separate piece of work.

## Rounding

A named time is rounded to the nearest minute, not up. Rounding up put as
much as fifty-nine seconds on a promise, and the card — which reads to the
minute — said *free in 21 minutes* to somebody who had just tapped *20*.
Found by the first UI test, not by reasoning.

## What is not measured, and what has not been heard

Whether answers get used, or change whether people come, is the question
`settle-whether-ping-is-enough-on-its-own.md` asks of pings. The meter records
pings and the arrivals that answer them; it does not record a *when*, and this
does not add it.

**None of it has been on a phone.** The suite covers the reducer, the server's
hold and answer, the APNs payload and the chooser; it cannot cover a long
press on a real notification, a cold launch answering, or the reminder
firing. The walk is two phones: ping B from A, answer *In 20 minutes* from B's
lock screen with B's app killed, and check that A is told once, that B's card
reads *free in 20 minutes*, that B is still nearby at minute sixteen, and
that B's reminder fires at twenty.

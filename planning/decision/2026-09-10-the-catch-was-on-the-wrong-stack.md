# 2026-09-10-the-catch-was-on-the-wrong-stack

Android's foreground service crashed the app on entry to any channel, for a
week, for every Android 14 user who had not already granted the microphone —
which on a fresh install is all of them. It was reported as *tapping on any
channel name crashes the app*, and the reporter cured it himself by granting
the microphone permission by hand, which is the observation that identified it.

## What the bug actually was

Two mistakes that only bite together.

**The first is a catch on the wrong stack.** `CallServiceModule` wrapped its
start in `try`/`catch` and documented the result as a contract: *both functions
answer with a boolean and neither throws*, on the reasoning that this sits on
the path carrying live audio and a missing notification must not take a call
down. The reasoning is right and the code did not implement it.
`context.startForegroundService(intent)` only *queues* the service and returns.
Android 12's background-start refusal is raised there, so the catch does hold
for that one — which is the failure the comment was written about, and the
coincidence that made the contract look verified. Android 14's permission check
happens later, inside the service's own `startForeground`, on the main thread,
on a stack the module's `try` has already left. `SecurityException`, uncaught,
process dead.

**The second is that nothing asked for the permission.** `RECORD_AUDIO` was
declared in `app.json` and otherwise left to WebRTC, which prompts implicitly
when it opens the microphone. But the service is started *before* the
microphone opens, deliberately — Android 14 wants a `microphone` service
started by a process that is about to capture rather than one that already is —
so at the moment the service starts, on a first channel, the permission has
never been asked for and cannot be held. The two decisions were each correct
and were made three days apart, and their product was a guaranteed crash.

## Why the tests did not have it

`__tests__/callService.test.tsx` is a good file and covers the thing it was
written for: that the service is scoped to the channel rather than the room, so
a reconnect does not cycle it. It mocks `modules/call-service` in order to count
the calls, which is the right move for that question and is exactly what makes
this one unreachable — the mock answers `true`, as the real module was believed
to. **A JavaScript test of a module mocked at the JavaScript boundary cannot
find a bug that lives in Kotlin**, and the honest statement of the coverage
here is that the Kotlin is covered by a compile and nothing else.

The one assertion that would have caught the JavaScript half is an ordering
assertion — that the permission is asked for *before* the start — and it is now
in that file. It is worth noticing that the ordering is invisible in the result:
asking afterwards leaves every other assertion in the file passing and the crash
exactly where it was.

## What was done

Three changes, none of which subsumes another:

- **`CallService.onStartCommand` catches and calls `stopSelf`.** The only place
  that exception can be caught, because it is the only place it is thrown. This
  alone stops the crash, and leaves the channel working on screen with no
  service behind it.
- **`CallServiceModule` checks `checkSelfPermission` first** and answers `false`
  without starting anything. Not redundant with the catch: catching means not
  crashing, declining means not leaving a started service with no notification
  for Android to kill and complain about. Checked on every start rather than
  remembered, since a permission can be revoked from Settings mid-session.
- **`app/src/audio/micPermission.ts` asks for `RECORD_AUDIO` before the service
  starts.** This is the one that makes the service actually *work* on a first
  channel rather than merely fail quietly. Without it the first two changes turn
  a crash into a channel that dies whenever the user switches apps, which is a
  better bug and still the bug the service exists to prevent.

## What to take from it

**A `try` around a call that queues work does not cover the work.** The shape
generalises past Android: `startForegroundService`, `startService`, anything
posting to a handler or a queue. The exception surfaces where the work runs, and
that is where the catch has to be. The comment asserting the contract was
written at the same time as the code that broke it, by somebody who had checked
the Android 12 case and generalised — so the lesson is not *write the comment*,
it is that a contract claimed at one call site has to be checked at every path
that can violate it.

**And a permission that gates a platform API has to be held before the API is
called, not merely before the feature is used.** The app satisfied the second
and not the first, and the gap between them was three days of unrelated,
correct decisions.

See ANDROID.md § *Background audio, which was where the work genuinely
diverged*, whose last bullet carried the false contract and now carries this.

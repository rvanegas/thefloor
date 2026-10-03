# 2026-10-01 — The server ends the lock screen card

Built from `task/live-activity-should-be-removed-before-forced-step-out.md`,
which was its title and nothing else. Asked which failure it meant — a card
that outlived the server stepping the device out, or one that should simply
come down sooner — the answer was **both**, and they are two different
mechanisms.

## What was wrong

`2026-09-18-the-lock-screen-card-does-not-outlive-the-room.md` held the card
for `DISCONNECT_GRACE_MS` after `inTouch` went false and then took it down, on
the argument that the phone and the server should make one bargain with one
number. Two things defeat that.

**The clocks do not start together.** The server's grace runs from when it
notices the drop; the phone's from when `inTouch` goes false, which waits on
its own heartbeat (`HEARTBEAT_TIMEOUT_MS`, checked every
`HEARTBEAT_INTERVAL_MS`) and on the media room giving up. So the card came down
*after* the step-out, every time.

**The timer is JavaScript, and the commonest way to be stepped out is not to
be running any.** A phone suspended in a pocket, or killed, runs no timer and
hears no snapshot — and is precisely the phone whose socket the server gives
up on. The card then stays for as long as ActivityKit keeps it, offering a
Mute for a microphone nothing is holding. The 2026-09-18 entry's adoption at
launch only fixes it at the *next* launch. Displacement is the same failure by
another route: another device's `ENTER` tells live sockets `displaced`, and a
suspended phone has none.

## What was built

**The phone's hold is `LOCK_SCREEN_HOLD_MS`, fifteen seconds less than the
grace**, so that while the app runs the card goes first. Fifteen covers the
detection lag with room to spare and still holds through a deploy as seen from
a phone (twenty-five seconds) and through a tunnel. Coming down while the
server still counts the phone present is the right error: by then it cannot
hear the room either.

**The server ends the card by push**, for the case no timer on the phone can
reach:

- The card is requested with `pushType: .token`; `LockScreenController`
  forwards each token through `LiveActivityModule.emitPushToken`, which also
  keeps the last one for a listener that mounts after an adopted card has
  reported. `useLockScreenPushToken` files it with `POST /live-activities`
  while in touch, retrying on the next return of touch if it failed.
- The server keeps it in `live_activities` — durable, because the suspended
  phone may have stepped in before a deploy — with the channel and the
  `deviceKey` ws.ts displaces by.
- `endWhereAbsent` runs on every channel change and ends each card whose
  account is no longer present: the grace or attention expiring, removal,
  deletion, and an ordinary Step Out, where it is redundant and harmless.
  `endOtherDevices` runs on every `ENTER` and ends the account's cards on
  other devices. A registration for a room the account has already left is
  ended on arrival.
- `ApnsPusher.end` sends `event: end` with `dismissal-date` now, on the
  `.push-type.liveactivity` topic and push type, with a `content-state` that
  decodes as `ContentState` — required on an end, and dropped by the phone
  after APNs has said 200 if it does not decode. Same key, host and
  `APNS_ENV` as alerts.
- `show()` now updates a held activity only while it is `.active`; one the
  server ended is replaced, which is what lets a device that was displaced
  and steps back in get a card again.

**Not "before" in the server's half, deliberately.** The push goes in the
same change as the step-out, not ahead of it. Ending the card early from the
server would need a timer per disconnected account, and would leave a card
gone on a phone that then came back inside the grace — and a card cannot be
restarted from the background.

## Order of shipping

The route is new, and a server without it answers 404, which the hook treats
as a failure to retry and nothing worse — so neither order breaks anything.
**Deploy first all the same**: a build that reaches phones before the route
does files nothing, and its cards end only the old way.

## What was checked, and what was not

The suites, including a server test that runs the grace out on a suspended
phone and sees the end sent then and not before, and one for the APNs headers
and payload. `swiftc -typecheck` of the controller and module against the iOS
SDK at 16.1 and at 15.1, with the pod stubbed — not a `prebuild --clean` and a
device build, which is the only check of the module's `definition()`.
**Nothing is verified on a device.** The walk has to kill the app without
telling it, since anything that leaves JavaScript running lets the phone's
own hold take the card down and proves nothing about the server: run a debug
build from Xcode against a server with `APNS_ENV=sandbox`, step in with
somebody else in the room, lock the phone, and press Stop in Xcode — which
ends the process without `willTerminate`, as a crash or jetsam does. The card
should stay up, and go about a minute later, when the room sees the device
leave. Then the displacement: step in, lock, stop the app the same way, and
step into the same channel from another device of the account — the phone's
card should go at once.

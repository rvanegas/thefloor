# Notifications do not ring — they are alerts

**Status:** the alert shipped 2026-08-10 (see
decisions/archive/DECISIONS-2026-08-07-to-2026-08-13.md). This is what was deliberately
left out of it.

A notification arrives, sits on the lock screen, and opens the app into the
channel when tapped. What it does not do is behave like an incoming call:
there is no ringing, no answering from the lock screen, no full-screen incoming
UI, and nothing wakes the app before the tap.

### What the larger version needs

- **PushKit** to wake a closed app, which in turn requires **CallKit** — Apple
  requires a PushKit VoIP push to report an incoming call, and will terminate
  an app that takes one without doing so. Note CallKit was ruled out for
  background *audio* (see decisions/archive/DECISIONS-2026-08-07-to-2026-08-13.md);
  this is the other thing it is for, and here it would be the right tool.
- `voip` in `UIBackgroundModes`, removed before the first TestFlight build
  because it did nothing, becomes load bearing again.
- A second delivery path in `push.ts`: a VoIP push is a different `apns-push-type`
  against a different topic (`<bundle id>.voip`) and a different device token,
  so `Pusher` gains a method rather than a caller.

The alert covers most of the value and none of this is undone by adding it —
the same server-side events would drive both.

### Smaller things left on the table

- **Time Sensitive delivery.** `interruption-level: 'time-sensitive'` would let
  a notification break through a Focus mode, which suits a live conversation.
  It needs the `com.apple.developer.usernotifications.time-sensitive`
  entitlement, so it is a trip through the developer portal rather than a code
  change.
- **Nothing is notified but these two events.** A contact request, a request
  accepted, or somebody inviting you into a channel you are already a member of
  all still reach you in-app only.
- **Android delivery was built on 2026-09-04** and is waiting on a Firebase
  project rather than on code. `FcmPusher` sits beside `ApnsPusher`, the fan-out
  routes by platform, and the client creates three notification channels; with
  no credential every Android address falls to `ConsolePusher`, which is what
  makes the whole path testable ahead of the thing it needs. This bullet said
  there was no delivery at all until then. planning/ANDROID.md § *Push, which
  was the largest gap* is where the rest of it lives.

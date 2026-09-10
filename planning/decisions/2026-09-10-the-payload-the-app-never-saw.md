# The payload the app never saw

Every field this server attached to a notification was discarded before any
JavaScript ran, on both platforms, for as long as there have been
notifications. `content.data` was empty on arrival, so `reachesInApp` was
always absent, so no push has ever raised a banner over the open app — and
`sweepArrivals` has never dismissed anything.

## The contract, which is the library's and not ours

`expo-notifications` does not hand the app the payload it received. For a
*remote* notification it hands over one key of it:

```objc
// EXNotificationSerializer.m
BOOL isRemote = [request.trigger isKindOfClass:[UNPushNotificationTrigger class]];
return isRemote ? request.content.userInfo[@"body"] : request.content.userInfo;
```

Android is the same shape by a different route: `NotificationData.kt` builds
what becomes `content.data` from `data["body"]`, parsed as a JSON object, and
ignores every sibling in the map.

This server sent `channelId`, `reachesInApp`, `alert` and `kind` beside `aps`
on APNs, and as four sibling entries in the FCM data map. Neither is under
`body`. So `dataOf()` in the app's `push.ts` returned `{}` for every push that
has ever arrived.

## What it cost

- **No banner, ever, over the open app.** `shouldShowBanner` is
  `reachesInApp(notification) && !isPassive(notification)`, and the first term
  was always false. `shouldShowList` is the unconditional `true` beside it,
  which is why the notification was always in Notification Centre — delivered,
  listed, silent, and reported as a success at every layer.
- **`sweepArrivals` has never swept.** It filters on `kind === 'arrived'`,
  which never matched, so stale arrivals accumulate — the exact thing that
  function exists to prevent, with a long comment about iOS never expiring a
  delivered notification.
- `isPassive` was always false too, which cost nothing only because the banner
  it would have suppressed was never going to appear.

`onNotificationTap` was untouched: it stopped reading the payload on
2026-09-04, which is why tapping a notification has always worked and made the
rest look fine.

## Why nothing caught it

`app/src/__tests__/push.test.ts` builds `notification({ channelId: 'chan_1',
reachesInApp: true })` and asserts `shouldShowBanner` is true. The handler is
correct and the test is correct about the handler; what it cannot know is that
the device never produces that shape. `server/__tests__/apns-headers.test.ts`
asserted `payload.kind` and `payload.channelId` — reading the payload as the
server wrote it, which is exactly where it was right.

Two tests, each verifying its own side of a seam neither one crosses. The same
shape as the Kotlin bug in `8e37192`: every assertion stays green.

The new tests assert the whole payload shape rather than key by key, because
the defect is a key in the *wrong place*. A key-by-key assertion passes on the
broken form, and so does the reader who writes it.

## No shim, and it deploys ahead of any build

This is a wire change, and AGENTS.md's rule is to teach the server the old
shape first. It does not apply, because there is no old shape to keep working:
every build in existence reads `content.data.<key>` and currently receives
nothing at all. Moving the keys under `body` makes all of them start working —
build 51 included — with no build made worse and nothing to retire later.

So it deploys on its own, and the fix reaches every phone already installed
without an upload.

## The boolean, settled

FCM's data block is `map<string, string>` and Google refuses a boolean in it,
which is why `reachesInApp` used to be sent as `"true"` on that side and as a
real boolean on APNs. Under `body` the value sits inside a JSON string, so its
type survives and both services now deliver a boolean. The app's check against
`true` or `'true'` stays as insurance rather than as a platform difference.

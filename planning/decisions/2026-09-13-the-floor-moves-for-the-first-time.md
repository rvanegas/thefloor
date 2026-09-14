# 2026-09-13-the-floor-moves-for-the-first-time

`MIN_SUPPORTED_BUILD` went from 51 to 80 — the first time it has moved since
build 51 was released on 2026-08-19 and the number stopped being free. Three
shims went with it, which is what the move was for.

## The measurement came first, and that is the rule

`bin/health` read `oldestBuild` 80 and `silentBuilds` 0 before anything was
edited. That is the whole of the licence: every install that speaks to this
server was already at or above 80, so nobody was shown `UpdateRequiredView` by
the change. SHIMS.md says this in its own words and is worth repeating here,
because the tempting order is the other one — find a shim worth deleting, raise
the floor to free it, and take the installs below it off the air as a side
effect nobody costed.

Build 51 could never have been retired properly. The expiry client landed hours
after `build/51` was tagged, so 51 reads neither `minBuild` nor `mustUpdate`:
it can only be waited out, and `oldestBuild` reaching 80 is what says it
finally was.

## What went

All three were type tidies rather than wire changes, which is why they could
land in one commit:

- **`HomeView.recordings`** (gate 21). Home stopped drawing recordings long
  ago; the server went on sending the flat list for build 20. `homeFor` no
  longer calls `recordingsFor` — which stays, being where the access rule for
  playback and export is written down.
- **`ChannelView.pingableAt` optionality** (gate 56). Required now. The server
  has set it unconditionally since it shipped.
- **`ChannelView.notificationLevel` optionality** (gate 78). The same.

## What it cost, which was all in the tests

The production change is about twenty lines. The suite was another matter, in
two ways worth writing down.

**Making a field required is not free in a test tree.** Every `ChannelView`
fixture that omitted `pingableAt` compiled while it was optional and threw the
moment `view.pingableAt?.[…]` became `view.pingableAt[…]`. Some of those
fixtures are typed as `unknown` in the harness, so *typecheck passed and the
tests failed* — 198 of them. The harness now supplies an empty map, which is
what the wire supplies.

**Three server test files read recordings through `GET /home`**, because it was
the only HTTP route that carried a `RecordingView`. Deleting the field left
them with nowhere to look: recordings reach a client on the channel snapshot,
and that travels over the websocket. `createApp` now returns two things it did
not:

- **`recordingsInChannel`**, the function the snapshot is built from. Right for
  a channel the registry is holding, which is what `media.test.ts` and
  `mixing.test.ts` have.
- **`recordingView`**, the row → view mapper. Needed because
  `transcript-routes.test.ts` writes its channel straight to SQLite, so the
  registry has never heard of it — and `recordingsInChannel` goes through the
  registry, that being what enforces who may see what. `app.channels.restore()`
  does not help: a hand-written row has no `state` blob, and restore closes
  those rather than reviving them.

Exposing both is a widening of the production surface for tests' benefit, which
is worth being uneasy about. The alternative was a socket harness in three
files to assert on a field's *value*, and the mapper is the thing under test in
every one of those cases.

## What this makes reachable, which is a real one

BACKLOG.md § *The update screen tells a browser to open the App Store* was
filed as unreachable "for a while", on the grounds that the floor was 51 and
every web train is cut at or above the released build. That while is over. A
browser tab left open on a train below 80 now meets `UpdateRequiredView`, which
tells it to update from the App Store — advice a browser cannot take. The entry
has been updated to say so.

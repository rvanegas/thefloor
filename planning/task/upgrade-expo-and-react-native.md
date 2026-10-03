# Upgrade Expo and React Native

This app is on **Expo 54 / RN 0.81.5**. As of 2026-09-18 the SDK ladder above
it is **55 → RN 0.83.10**, **56 → RN 0.85.3**, **57 → RN 0.86.3** (latest), with
58 in preview. Three SDKs behind, which is roughly where Expo's support window
ends and where the interesting breakage starts.

## Whether it is worth doing at all

**Not for anything the app currently wants.** Nothing in the backlog is blocked
on a newer runtime, the New Architecture is already on (SDK 54 defaults it and
`app.json` does not override), and swiping shipped on core `Animated` precisely
so it would not need one. On its own merits this is maintenance.

**The forcing function is Apple, and it is a date rather than a feature.** Every
spring Apple raises the minimum SDK an app may be *built with* for the App Store
to accept it, and that floor is a property of the Xcode and native toolchain a
given RN version supports. **Go and check the current deadline before planning
around anything else in this file** — if a submission would be refused, the
upgrade stops being optional and every cost below is one you are paying anyway.
`bin/submit-ios` is the thing that would start failing, and it would fail at
upload, which is the worst moment to discover it.

**The secondary reason is dependency gravity.** Reanimated 4.6 already declares
`react-native: 0.83 - 0.86` — this app cannot take the current release of a
mainstream package. That costs nothing today, and it is the shape of what
arrives next: a library worth having whose newest version has moved past 0.81.

## What will actually break, in order of how much it will hurt

1. **LiveKit and WebRTC.** `@livekit/react-native` is now **3.0.0** against this
   app's `^2.12.0` — a major, with its own migration, independent of Expo. The
   trap is underneath it: **`@livekit/react-native-expo-plugin@1.0.2` still peers
   `@livekit/react-native: ^2.1.0`** and has not been updated for v3. So if a
   newer SDK forces LiveKit 3, the config plugin that makes it build under Expo
   is the blocker, and it is somebody else's repository. **Check this first** —
   it can sink the whole plan before a single package is bumped, and everything
   else here is easy by comparison.
   `@config-plugins/react-native-webrtc` is friendlier: **15.0.2 peers
   `expo: >=56`**, so it covers the destination.
2. **The three local native modules.** `modules/live-activity`,
   `modules/call-service` and `modules/audio-route` are Swift and Kotlin against
   `expo-modules-core`, which is where the API churn lands across SDKs. Nothing
   warns you; they fail at compile.
3. **The two config plugins.** `plugins/with-google-services.js` and
   `plugins/with-live-activity.js` write into the prebuild output, and prebuild
   internals move between SDKs.
4. **Every `expo-*` version string.** SDK 55 renumbered the unified packages to
   match the SDK major — `expo-notifications` goes from `~0.32.17` to `~55.0.27`
   and so on for all fourteen. Cosmetic, total, and `npx expo install --fix`
   does it.
5. **The web app.** `react-native-web` is `~0.21.0` on every SDK from 55 to 57,
   so this is the one axis that does not move. `bin/deploy` builds and ships it,
   and the trains are the thing to smoke-test rather than to fear.

## How to do it

**One SDK at a time — 54 → 55 → 56 → 57 — with a device build at each stop**,
not a jump to 57. Three hops each with a working build beats one hop with a
compile error that could have come from any of three. `npx expo install --fix`
per hop, then `npx expo-doctor`, then a real build.

**Before the first hop**, read `planning/RELEASING.md` in full and note the
`prebuild --clean` trap: it drops the signing team, and this is a task made
entirely of prebuilds.

**Android is untested ground and should not be discovered here.** See
`backlog/android-has-never-been-built-or-run.md` — an SDK upgrade is the worst
possible moment to find out whether that half builds, so either establish a
baseline Android build first or decide explicitly that the upgrade is iOS-only
and that the Android half stays unverified.

**The smoke test is the walk**, `planning/APPREVIEWSCRIPT.md` — the one that
found eight defects before 1.0.0. Audio is what an SDK bump most plausibly
breaks and least plausibly announces: a room that connects but captures
nothing, a route that does not switch, a Live Activity that never appears.

## What would make this cheap, and is not true yet

Nothing here is hard; it is all serial, and each step's failure mode is a native
build error an hour into a rebuild. The thing that would change the economics is
a CI build for both platforms, which does not exist — see
`dev-ops-database-and-configuration-backups.md` for the adjacent gap. Worth
pricing that before the third hop rather than after.

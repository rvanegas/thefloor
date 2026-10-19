# Upgrade Expo and React Native

This app is on **Expo 55 / RN 0.83.10** since 2026-10-18, one hop up from 54.
The ladder above it is **56 → RN 0.85.3** and **57 → RN 0.86.3** (latest as of
2026-09-18), with 58 in preview. Two SDKs behind.

## What the hop to 55 cost, for calibrating the next two

iOS only, by decision; Android was not built. Smaller than this file feared:

- **One type error.** RN 0.83 types `Appearance.setColorScheme` as `'light' |
  'dark' | 'unspecified'`, so "follow the system" is `'unspecified'` rather than
  `null` (`app/src/ui/appearance.ts`).
- **The privacy manifest vanished silently.** SDK 54's template carried
  `ios/TheFloor/PrivacyInfo.xcprivacy`; 55's does not, and prebuild writes one
  only from `app.json`'s `ios.privacyManifests`, which now holds it. Nothing
  warns; a diff of the generated `ios/` against the previous one is what found
  it. **Do that diff at every hop** — Info.plist, entitlements, the file list.
- **LiveKit did not move.** `@config-plugins/react-native-webrtc` has one major
  per SDK — 13 peers `expo ^54`, 14 `^55`, 15 `^56` — so 55 took 14 and LiveKit
  stayed on 2.x.
- **TypeScript 6 and `@types/jest` 30 are kept** against `expo-doctor`, which
  wants 5.9 and 29; it wanted the same on 54.
- **The lock-screen widget failed to compile**, and nothing in this file
  predicted where. SDK 55's generated `ExpoModulesProvider.swift` writes
  `internal import LiveActivity` into the app module, which also compiles the
  widget's shared sources; Swift then refuses their plain `import` as an
  "ambiguous implicit access level". The fix is explicit levels in
  `targets/lock-screen/` — `public` where the class is public, `internal` in
  the intents. Any new app-target file importing a local module needs the same.
- The four local modules themselves and the three config plugins needed no
  change.

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

1. **LiveKit and WebRTC, at the hop to 56.** `@livekit/react-native` is now
   **3.0.0** against this app's `^2.12.0` — a major, with its own migration,
   independent of Expo. The plugin that once blocked it no longer does:
   **`@livekit/react-native-expo-plugin@1.0.3` peers `^2.1.0 || ^3.0.0`**
   (1.0.2 peered `^2.1.0` only). `@config-plugins/react-native-webrtc` 15.x
   peers `expo ^56`, and is the version 56 takes.
2. **The four local native modules.** `modules/live-activity`,
   `modules/call-service`, `modules/audio-route` and `modules/reported-call` are
   Swift and Kotlin against
   `expo-modules-core`, which is where the API churn lands across SDKs. Nothing
   warns you; they fail at compile.
3. **The three config plugins.** `plugins/with-google-services.js`,
   `plugins/with-live-activity.js` and `plugins/with-localizations.js` write
   into the prebuild output, and prebuild internals move between SDKs.
4. **Every `expo-*` version string.** SDK 55 renumbered the unified packages to
   match the SDK major — done at 55; from here each hop is a major bump of the
   same twelve. `npx expo install --fix` does it.
5. **The web app.** `react-native-web` is `~0.21.0` on every SDK from 55 to 57,
   so this is the one axis that does not move. `bin/deploy` builds and ships it,
   and the trains are the thing to smoke-test rather than to fear.

## How to do it

**One SDK at a time — 55 → 56 → 57 — with a device build at each stop**,
not a jump to 57. Three hops each with a working build beats one hop with a
compile error that could have come from any of three. `npx expo install --fix`
per hop, then `npx expo-doctor`, then a real build.

**Before the first hop**, read `planning/RELEASING.md` in full and note the
`prebuild --clean` trap: it drops the signing team, and this is a task made
entirely of prebuilds.

**Android is untested ground and should not be discovered here.** See
`bring-android-level-with-ios.md` — an SDK upgrade is the worst
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

# The plist decides which shapes exist

*Sideways is full screen* shipped on 2026-09-19 and did nothing on a phone. The
derivation was right, the tests passed, and `useIsLandscape` returned false for
the life of the process, because iOS never handed the app a landscape window to
measure.

`app/app.json` spells out `ios.infoPlist.UISupportedInterfaceOrientations`, and
the iPhone's array listed `UIInterfaceOrientationPortrait` alone. It now lists
portrait and both landscapes. Upside-down stays out: nothing on any screen
wants it.

**`orientation: "default"` is not what allows a rotation, and the file that
said so was `watch/orientation.ts`'s own header.** Expo's orientation plugin is
wrapped in `createInfoPlistPluginWithPropertyGuard`, which stands down when the
Info.plist property is already spelled out in `ios.infoPlist` — so `default`
wrote nothing, which is exactly what it was set to `default` *for*. That was
deliberate, on 2026-09-01: orientation is per-platform, Expo has no key for
that, and the two `infoPlist` keys say it instead — iPhone portrait, iPad all
four, which Apple requires of an app that can share the screen. The iPad half
is untouched.

So the premise the feature was built on was true of a setting that was not
doing anything, and the setting that *was* doing something had been written for
a different question three weeks earlier and was never re-read.

## What would have caught it

Reading the generated plist rather than the JSON, which is the rule this
repository already applies to `rtc.use_external_ip` and which the 2026-09-01
commit itself applied — *verified against the generated plist rather than the
JSON* — to the keys it was adding. Nobody re-ran it for the keys it was
leaving in place.

**No JavaScript test could have failed here**, and that is the part worth
keeping: `useWindowDimensions` in a test returns whatever the harness says, so
a rule derived from the shape of the window is only as true as the plist that
decides which shapes exist. Checking it is a prebuild and a native rebuild,
not a reload — which is also why this cost a day rather than a minute.

RELEASING.md § *Orientation is per-platform* carries the correction, and
`watch/orientation.ts` no longer claims `app.json`'s `orientation` is what
makes the feature possible.

## What has to happen for it to take effect

A prebuild and a rebuild. The change is a native manifest, so no deploy and no
JS bundle reaches it — build 249 and everything before it stays portrait-locked
on a phone however the app is turned.

# Releasing an iOS build

Everything only somebody producing an iOS build needs: what `app.json` is set
to and why, what `prebuild --clean` takes away, the icon rules that fail at
upload rather than at build, and the state of the first submission.

Split out of AGENTS.md on 2026-08-15, when that file reached its 650-line
limit. It is loaded into every session before anybody types anything, and none
of this is needed by somebody working on the server, the reducer or the app's
behaviour — which is most work. This file is read when a release is being made.
The traps that bite outside a release stayed behind: `APNS_ENV`, the three
artifacts that disagree about entitlements, and the credentials.

**Read this before running `bin/release-ios`.** The branch and tag conventions
around a release are in AGENTS.md under `## Branches, tags, and what is actually
in people's hands`; what App Review was told is in APPREVIEW.md.

---

## Before the first TestFlight build

Configuration decided 2026-08-09 and worth knowing the reasons for.

- **`supportsTablet` is now false.** Nothing in the layout adapts to a larger
  screen and nobody has opened it on an iPad. Claiming support invites App
  Review to test there, on a layout built for a phone. Turn it back on after
  actually looking at one.
- **`voip` removed from `UIBackgroundModes`, and still out.** It does nothing
  without PushKit, and reviewers have objected to apps declaring it unused.
  Push notification has since been picked up and this did *not* change: a
  visible alert needs neither `voip` nor `remote-notification`. It becomes load
  bearing only if PushKit and CallKit are adopted for call-like ringing.
- **`userInterfaceStyle` is `automatic`.** This said `dark`, and stopped being
  true when `app/src/ui/theme.ts` grew a light palette — the app follows the
  system now, and a screenshot of it in light mode is it working rather than
  failing. What the setting is *for* has not changed: it is what makes system
  surfaces — alerts, the keyboard, the status bar — match the app instead of
  rendering pale against a `#0E1013` screen.
- **`ITSAppUsesNonExemptEncryption: false`.** All traffic is HTTPS and WebRTC,
  which is the standard exemption. Declaring it stops App Store Connect asking
  on every single upload.
- **The iOS icon is the artwork now, rasterised from `the-floor-icon.svg`.**
  `app/assets/icon.png` and `app/assets/favicon.png` are generated from it; the
  SVG is the master, and neither PNG should be edited by hand. Regenerate with
  ImageMagick, rendering large and downsampling so the diagonal is smooth
  rather than stepped:

      magick -background white -size 4096x4096 the-floor-icon.svg \
        -resize 1024x1024 -alpha remove -alpha off -type TrueColor \
        -colorspace sRGB PNG24:app/assets/icon.png

  `-alpha remove -alpha off` is not decoration: **an iOS app icon with an alpha
  channel is rejected at upload.** The artwork is opaque either way — two
  triangles filling the square — so the channel would carry nothing and still
  fail the check.

  `bin/release-ios` runs `prebuild --clean`, which regenerates the whole
  `ios/` asset catalogue from `app/assets/icon.png`, so nothing else has to be
  copied anywhere for a build to pick this up.

- **The Android adaptive icon is prepared but Android is not shipped here.**
  Three layers, generated from `the-floor-icon.svg` and
  `the-floor-icon-mono.svg`; there is no `android/` and `bin/release-ios` is
  the only release path. Why each layer is what it is — and why the monochrome
  silhouette gets its own master file — is in planning/DECISIONS.md.

- **The splash is still the Expo default.**

- **Availability is worldwide, and the donate link is filtered per person.**
  Guideline 3.1.1(a) permits buttons and external links to outside payment
  mechanisms *in the United States storefront* and prohibits them everywhere
  else — so what has to be US-only is the link, not the app. This was very
  nearly got wrong in the other direction: the original plan shipped US-only,
  which would have locked out non-US users who already existed.

  The filter is `server/src/region.ts`, fed by a locale and timezone the app
  reports. **Anything it is not sure about resolves to hidden.** If you ever
  change it, keep that asymmetry: showing the link outside the US storefront is
  a guideline violation, and hiding it inside costs one donation.

  Two global kill switches sit above it, both server-side and both a restart
  rather than a submission: unset `KOFI_URL`, or set every account's
  `donations_allowed` to 0. That is deliberate, because the US carve-out exists
  under an injunction still being appealed.

- **`NSMicrophoneUsageDescription` was wrong until 2026-08-14**, and it is the
  one string every user and every reviewer reads. It said "so the other person
  in a session can hear you": sessions became channels on 2026-08-10, and a
  channel holds up to `MAX_CHANNEL_PARTICIPANTS` rather than one other person.
  Worth re-reading whenever the vocabulary moves — nothing tests a permission
  string.

`buildNumber` must increase for each upload, even when the version does not —
and **`bin/release-ios` does that itself**, reading `app.json`, adding one, and
writing it back before it prebuilds. Bumping it by hand first is not an error
Apple will complain about, but it skips a number: doing both is what turned 23
into 25 and left build 24 never existing.

---

## `prebuild --clean` drops the signing team

`expo prebuild --platform ios --clean` regenerates `ios/` from scratch, which
discards `DEVELOPMENT_TEAM` and leaves the next archive failing with "Signing
for TheFloor requires a development team".

Pass it explicitly until something better exists:

    xcodebuild ... DEVELOPMENT_TEAM=9946JKHZUJ CODE_SIGN_STYLE=Automatic

Note too that changing `expo.name` renames the whole native project. It became
`TheFloor` when the display name did, so the workspace, scheme and source
directory all moved from `thefloor` to `TheFloor`. Anything with those paths
hard-coded breaks silently, and the error names a missing scheme rather than
the rename that caused it.

---

## Submitted to the App Store, 2026-08-14

Version 1.0.0, build 36, `WAITING_FOR_REVIEW`, release set to manual so approval
and release stay two decisions. **planning/APPREVIEW.md carries everything**:
what was built for it, what was typed into App Store Connect, the submitted
review notes and description verbatim, and the six things filling in the listing
taught — among them that the App Store version record and `CFBundleVersion`'s
sibling `CFBundleShortVersionString` must agree or the build picker is silently
empty, and that a screenshot showing the donate card would defeat
`server/src/region.ts` in every storefront at once.

The demo accounts are planning/DEMO-ACCOUNT.md; their credentials are in
`~/.config/thefloor/demo-account.txt`, mode 600, and `REVIEW_IDENTIFIER` /
`REVIEW_CODE` on the box are what make the review sign-in work.

---

# UIRequiresFullScreen is not a retreat, it is an expiry

Settles the backlog item *Whether iPadOS 26 still honours
`UIRequiresFullScreen`*, which asked because RELEASING.md was promising a
one-line retreat from iPad multitasking that nobody had checked was still
there. It is not. Apple's TN3192, *Migrating your iPad app from the deprecated
`UIRequiresFullScreen` key*, is the answer, and it has a date on it:

- **iPadOS 26** deprecates the key and its compatibility mode, and says it
  "will be ignored in a future release". It still works on 26.
- **iOS 27 and iPadOS 27** end it: the key "no longer opts your app out of
  resizing". The system resizes the scene *discretely* instead — the scene does
  not change size while the window is dragged, and on release its
  `effectiveGeometry` changes and it moves to a `UIScreen` of the new size.
  This applies to an app built against the iOS 27 SDK.
- **`UIRequiresFullScreenIgnoredStartingWithVersion` is not an escape hatch.**
  It names the version at which the system *begins* ignoring the key, so it
  preserves the old behaviour on *older* systems — it cannot buy the opt-out
  on 27 and later. An app that needs full screen on iOS 18 sets it to `26`.

So the retreat exists on one OS version and expires. Anything that plans on
being able to opt back out is planning against a deadline, which is why
RELEASING.md's *Orientation is per-platform* bullet was rewritten in the same
commit rather than left to be discovered by whoever went to use it.

**The evidence the backlog item cited was a red herring**, and is worth naming
so nobody re-derives the wrong conclusion from the same place. It quoted
`UISceneSizeRestrictions` in the iOS 26.2 SDK, where `allowsFullScreen` is
annotated `API_AVAILABLE(macCatalyst(16.0))` and noted as "currently only
honored on Mac Catalyst" — which is still there verbatim. But that property is
about whether a Catalyst *window* may go full screen, and has nothing to do
with the iPad multitasking opt-out. It was never evidence either way. The two
share a word and nothing else.

**The key is not absent, which RELEASING.md also claimed.** The generated
`app/ios/TheFloor/Info.plist` carries `UIRequiresFullScreen` set `<false/>`,
written by prebuild. The effect is the same — the app is not opted out — but
TN3192's own checklist asks that the key not be present at all, so the
difference is worth knowing before somebody greps for it, finds it, and
concludes the app is in compatibility mode.

**Two things become live when this checkout moves to the iOS 27 SDK**, neither
of them work now. A **launch screen is required for App Store submission** from
iOS 27; the app has one (`UILaunchStoryboardName` is `SplashScreen`), so this
is satisfied and merely needs to stay that way. And any layout that assumes a
fixed scene size will start seeing discrete resizes. The rest of TN3192's
checklist the app already meets: all four orientations are declared in
`UISupportedInterfaceOrientations~ipad`, and `app/src/ui/layout.ts` carries the
breakpoint that makes a wide scene mean something.

Nothing was changed in the app. This is a finding about a deadline, not work.

# Ask Apple For The User-Assigned Device Name Entitlement

`com.apple.developer.device-information.user-assigned-device-name`, which is a
request to Apple with a lead time rather than a checkbox. Without it
`UIDevice.current.name` answers a generic **"iPhone"** on iOS 16 and newer, so
`app/src/api/device.ts` prefers `Device.modelName` — "iPhone 15 Pro" — which
tells somebody which of their devices this is where "iPhone" does not.

It matters only in one place: the screen picker on the Watch tab, when an
account has **two or more** other devices signed in, which is unusual by
design. With one other device there is no list, only a confirmation naming it.
So this is a small improvement to a rare screen, and the app is correct without
it — read that as the reason there is no hurry, not as a reason to skip it.

**The entitlement reaches three artifacts that must agree** — `app.json`, the
App ID and the provisioning profile — so RELEASING.md § *What the app requests,
what it gets, and how to check* is the procedure, and a build signed against a
profile that does not carry it fails at signing rather than at runtime. Do not
add it to `app.json` before it is granted.

**Keep the fallback whatever happens.** The web has no device-name API at all,
so a nameless device is described by its kind — *A browser*, *Another phone* —
and that path has to stay: a made-up name in a list of real ones is worse than
a gap. See decisions/2026-09-17-the-screen-is-the-app.md.

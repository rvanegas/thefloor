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

## The plan, written up 2026-09-25

**First, settle whether it has already been asked for.** Two places in the tree
say it has — `app/src/api/device.ts:63` and
`decisions/2026-09-17-the-screen-is-the-app.md:181`, both reading "requested,
not yet granted" — while this file's title says it has not, and nothing anywhere
records a date or the text submitted. Apple's form has no status page; the only
record of a pending request is the confirmation mail it sends. So the first step
is a search of that mailbox, and it is not one a session can do. If a request is
pending, everything below from *Submit it* onwards is already spent and what is
left is the write-down. If it is not, then those two comments were wrong on the
day they were written, which is the argument for step three existing at all.

**A grant needs no app code change, and that is worth knowing before starting.**
`describe()` in `app/src/api/device.ts` already prefers `Device.deviceName`
whenever it differs from both the model and the brand, falling through to
`Device.modelName` and then to null. Today that guard rejects the generic
"iPhone" as the model over again; with the entitlement the same call starts
answering "Rodrigo's iPhone", the guard passes, and the picker shows it. So the
grant is a configuration change and a rebuild, not a feature — and the fallback
this file insists on keeping is kept structurally rather than by anybody
remembering to.

**Submit it.** The form is at
`developer.apple.com/contact/request/user-assigned-device-name/`, behind an
Apple ID sign-in, so it is Rodrigo's to send and cannot be scripted. It wants
the bundle identifier `co.rvanegas.thefloor`, the Team ID from the portal's
Membership page, the listing, and a justification. The honest justification is
the one this file already contains: one account is signed in on several devices
at once, and when a member picks which of *their own* devices shows a shared
screen, the picker lists them by name and shows that list to nobody else. Every
entry reads "iPhone" without the entitlement, so a person with a phone and an
iPad is choosing between two labels that identify neither. **Expect a refusal.**
Apple's bar for this one is narrow and our screen is rare by design; a refusal
costs nothing, which is the whole reason this is worth sending rather than
agonising over.

**Write down what was sent, in the same commit.** The date and the text, in this
file. That is the step whose absence produced the contradiction at the top: a
comment in `device.ts` asserting a request with nothing behind it, pointing at
`planning/WATCH-IN-APP.md`, which was deleted along with the design it described.
**Four files still point at it** — `device.ts:63`, `ChannelView.tsx:4563`,
`channelSharing.test.tsx:478` and `WatchPlayer.tsx:21` — and the decision entry
says in its own first lines that it inherited that file's surviving reasoning, so
the decision is where the three unrelated ones should point. That is its own
small chore rather than part of this, but it is the same rot and the fix is
mechanical.

**On a grant, the portal comes first and `app.json` second.** Never the other
way round: a build signed against a profile that does not carry the entitlement
fails at *signing*, which is a confusing failure to meet having just edited a
JSON file. So enable the capability on the App ID, regenerate the provisioning
profile, then add the entitlement to `app.json`'s `ios.entitlements` — which
today has none — and prebuild. Verify on the **exported IPA** and not on the
entitlements file or the archive, the archive being Development-signed and
therefore no evidence; RELEASING.md § *What the app requests, what it gets, and
how to check* is the recipe, including the three authentication flags without
which the export fails claiming there is no signing certificate. Then confirm on
a real phone with two devices signed in, because the picker is the only place any
of this shows. `npm test` and `npm run typecheck` should pass untouched — if they
do not, something was changed that did not need to be.

It rides along with whatever build is next. There is no case for a build of its
own, and the note at the top of this file is the reason.

**One thing i18n changed since this file was written.** The kind-labels are now
translated — `aBrowser` and `anotherPhone` in `app/src/i18n/`, consumed at
`ChannelView.tsx:2198` — and a user-assigned device name is not, nor should it
be: it is what its owner called their own hardware. So a Spanish UI will show
*Un navegador* beside "Rodrigo's iPhone", which is correct and will still look
like an oversight to somebody auditing the file later.

**On a refusal**, a dated decision entry saying so and why, this file deleted,
and `device.ts`'s comment amended from "requested, not yet granted" to refused —
so that the next reader does not re-ask. A refusal is exactly the deliberately
not built that `decisions/` is for.

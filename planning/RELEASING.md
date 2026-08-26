# Getting a build to users

Everything only somebody producing an iOS build needs: what `app.json` is set
to and why, what `prebuild --clean` takes away, the icon rules that fail at
upload rather than at build, what an upload costs each time, and what App Store
Connect will not tell you about the state of a submission.

## The five verbs, which are five different days

Adopted 2026-08-21, because *release* had come to mean both "put a build in
TestFlight" and "put a build in front of App Review" — while the `released` tag
meant neither. One word sat at both ends of the pipeline. These five do not
overlap, and **nothing here is a synonym for any other line**:

| Verb | What it does | Who is affected | Marked by |
| --- | --- | --- | --- |
| **land** | merge to `master`, **push**, delete the branch and worktree | nobody | `master` moves on the origin |
| **deploy** | `bin/deploy` — server to the box | **everybody, within a minute** | `server/deployed.json`, `/healthz` |
| **upload** | `bin/upload-ios` — archive, sign, send to App Store Connect | TestFlight testers, after processing | tag `build/<n>` |
| **submit** | `bin/submit-ios` prepares it; a person presses Submit | nobody yet | nothing local |
| **release** | make an approved build downloadable | **everybody who updates**, over days | tag `released` moves |

Apple **approves** between submit and release, which is their word and is not
overloaded. Approval is not release: the two are separate actions in App Store
Connect and the gap between them is a decision, which is why `released` moves
on the second and not the first.

**The two that reach users are `deploy` and `release`, and they are nothing
alike.** A deploy is one command, takes a minute, needs nobody's permission and
cannot be recalled except by another deploy. A release is days of queue, one
review that can say no, and a population that updates whenever it updates. The
whole of `## Branches, tags, and what is actually in people's hands` in
AGENTS.md exists because of that asymmetry, and `MIN_SUPPORTED_BUILD` exists
because the slow one never fully completes.

**`land` is the one most likely to be mistaken for shipping, and it ships
nothing.** A landed change is on the origin and in no one's hands: not on the
box until a deploy, not on a phone until an upload, a submission, an approval
and a release. The reason to say it precisely is that the phrase *is* the
instruction — AGENTS.md defines "land it" as merge, push, clean up, in one
phrase — and a session told to land something and hearing "ship it" will reach
for the wrong script.

Split out of AGENTS.md on 2026-08-15, when that file reached its 650-line
limit. It is loaded into every session before anybody types anything, and none
of this is needed by somebody working on the server, the reducer or the app's
behaviour — which is most work. This file is read when a build is being made.
The traps that bite outside that stayed behind: `APNS_ENV`, the three
artifacts that disagree about entitlements. The credentials an upload needs —
the App Store Connect key and its Admin role, the APNs `.p8` — were split out
of AGENTS.md the same day and are in CREDENTIALS.md.

## One verb does not imply the others — say so and ask

Added 2026-08-24, from the prompt: *"if I ask for deploy, prompt me in case
upload is necessary; similarly if I ask for upload, prompt me in case deploy is
also necessary."*

Each verb is asked for explicitly, every time — AGENTS.md § *Branches, tags*.
This is the other half of that rule, and it is not the same half. Being told
`deploy` is not permission to upload; **but noticing that the deploy alone
leaves the work half-delivered, and saying nothing, is its own failure.**

**So: do the verb that was asked for, and then say what it does not cover.**

| asked for | check | what to say |
| --- | --- | --- |
| **deploy** | does the change touch `app/`? | the box has it; phones do not until an upload |
| **upload** | does it touch `server/` or `core/`? | testers will get it; the box has not changed |
| either | does `core/` move? | it is compiled into **both**, so both are usually wanted |

`core/` is the one that catches people. It is imported by the server and by the
app, so a change there is a wire change in waiting: deployed alone it can meet a
client that speaks the old shape, uploaded alone it can meet a server that does.
See AGENTS.md § *Never ship a wire change to a server before the client can
speak it*.

**Ask; do not infer.** A half-delivered change is often deliberate — two tasks
being combined, a server change wanted now and a build wanted after more work,
or a build already in TestFlight that the box must not get ahead of. The point
is to put the question where it can be answered in a word, not to guess which
answer was meant. An oversight comes back as *"both, then"*; an intention comes
back as *"no, just the deploy"*, and both are one line of the person's time.

The check itself is `git diff` against what is live: `bin/health` says which
commit the box is running, and `git describe --tags --match 'build/*'` says
which build the last upload was cut from.

---

**Read this before running `bin/upload-ios`.** The branch and tag conventions
around getting a build out are in AGENTS.md under `## Branches, tags, and what
is actually in people's hands`; the accounts App Review signs in as are in
DEMO-ACCOUNT.md.

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

  `bin/upload-ios` runs `prebuild --clean`, which regenerates the whole
  `ios/` asset catalogue from `app/assets/icon.png`, so nothing else has to be
  copied anywhere for a build to pick this up.

- **The Android adaptive icon is prepared but Android is not shipped here.**
  Three layers, generated from `the-floor-icon.svg` and
  `the-floor-icon-mono.svg`; there is no `android/` and `bin/upload-ios` is
  the only release path. Why each layer is what it is — and why the monochrome
  silhouette gets its own master file — is in planning/decisions/DECISIONS.md.

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
and **`bin/upload-ios` does that itself**, reading `app.json`, adding one, and
writing it back before it prebuilds. Bumping it by hand first is not an error
Apple will complain about, but it skips a number: doing both is what turned 23
into 25 and left build 24 never existing.

**What Apple receives used to be one higher than what was archived, and the
fix is one line in the export options.** `manageAppVersionAndBuildNumber`
defaults to **YES**, and at the export that re-signs for distribution it
renumbers the build silently: build 43 was archived on 2026-08-16 carrying
`CFBundleVersion` 43 in `/tmp/thefloor.xcarchive/Info.plist` and arrived in
TestFlight as **44**. Everything downstream then named a binary that did not
exist — the bump commit, the `build/<n>` tag, and `app.json`, left a number
behind what Apple held and so bumping into a taken number on the next release.

`bin/upload-ios` now passes it as `false`, because this script owns the build
number and increments it itself; Apple's default exists to spare you a refused
upload when the number is already used, which is worth less than the numbers
agreeing. **Builds up to 44 predate that**, so their tags and commits are off by
one against App Store Connect and cannot be corrected — read a tag from that
era as naming the commit rather than the binary. From 45 on, the archive, the
tag, `app.json` and TestFlight should all say the same thing. **Check that on
the next upload rather than assuming it**, since this has only been reasoned
about and not yet observed working.

The same key would settle the entitlement check in AGENTS.md, whose note about
build 19 producing an IPA reading 20 is this behaviour seen where it is
harmless, the checked copy never being uploaded.

---

## The build number never resets, and Apple would let it

Apple's rule is narrower than the habit. `CFBundleVersion` must be unique
among the builds sharing a `CFBundleShortVersionString`, and must increase
within that train — you cannot upload build 51 for 1.0.0 twice, and you cannot
follow it with 50. It says nothing across versions: 1.0.0 build 51 followed by
**1.1.0 build 1** is accepted, and plenty of projects do exactly that, because
Apple scopes the number to the version. So counting up forever is a choice, and
it is the choice made here.

Three things depend on it, and each breaks quietly rather than loudly:

- **`MIN_SUPPORTED_BUILD` is a bare integer with no version beside it.** It
  says 36 and means the thirty-sixth build ever made. Reset the counter and
  `36` names two binaries — one from 1.0.0 and one from whatever came next —
  and the rule it exists to make decidable, that a shim goes once the floor has
  passed the build that needed it, stops being decidable. The same holds on the
  wire: `x-thefloor-build` carries a build and no version, so a reset makes
  every claimed build ambiguous, including the ones already recorded.
- **`build/<n>` tags are one flat namespace.** git has no notion of the version
  they belong to. A reset either collides with an existing tag, which git
  refuses, or gets disambiguated by hand into something `bin/upload-ios` does
  not produce.
- **`bin/upload-ios` reads `app.json`, adds one, and writes it back.** It
  knows nothing about the version and is not asked to. Resetting means editing
  the number by hand, which is the operation that skipped a build above.

`CFBundleShortVersionString` — `expo.version` in `app.json`, `1.0.0` — moves on
its own schedule and must match the version record in App Store Connect or the
build picker is silently empty. Bumping it is a separate act from an upload and
`bin/upload-ios` does not touch it.

So: yes, indefinitely, and 51 is the fifty-first build across all versions. The
question was TASKS.md's `## Relation of Version and Build`, answered
2026-08-17.

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

## What one build costs, end to end

Everything below this line recurs. It was gathered here on 2026-08-18 and again
on 2026-08-19, out of the three App Store files that covered the first
submission and were deleted when the app was approved — so what was learned
there and goes on being true survives them.

1. **Deploy the server first**, if it changed. A client that speaks to a server
   that has not caught up is the one failure mode nothing else here prevents.
2. **`git diff build/<n>..HEAD -- core/protocol.ts`**, against the oldest build
   still installed rather than the newest released. `oldestBuild` on `/healthz`
   reports it. This is the discipline that matters most and the only one no
   tooling enforces.
3. **`bin/upload-ios`.** One command: refuses a dirty tree, bumps and commits
   the build number, prebuilds, archives, uploads, tags.
4. **`bin/set-review-notes`**, which fills the demo code into
   `planning/submissions/review-notes-<version>.txt` and sends it. The notes
   come from a file in the tree so they are reviewed like anything else; the
   code is not in that file, and the script refuses one where the placeholder
   has been filled in by hand. **A submission's two texts live in `planning/submissions/`** —
   the notes and the `whats-new-<version>.txt` that `bin/submit-ios
   --whats-new` sends — because they are the only files in `planning/` that are
   payload rather than prose: they carry no first line saying what they are,
   since every character of them is read by a reviewer or shipped on the
   listing. A directory keeps that distinction visible and keeps `ls planning/`
   readable between submissions. Before this existed the notes were pasted, and on 2026-08-23 the
   paste that landed was `planning/recent-changes.txt` — an internal changelog,
   naming build numbers and a debug-flag diagnostics panel, carrying neither
   the warning to test account deletion last nor the Guideline 1.2 account of
   guest links. Every check in `bin/submit-ios` passed, the field being
   non-empty.
5. **`bin/submit-ios`,** which prepares the submission and stops before the
   button: it creates the version record if there is none, refuses a build
   whose train does not match `expo.version` or that is still processing,
   insists on "What's New" and on review details a reviewer can sign in with,
   opens a reviewSubmission and puts the version on it. Then it prints the page
   to press Submit on, because that PATCH is the irreversible half and
   everything before it is editable. `--dry-run` says what it would do;
   `--status` reports what App Store Connect holds and writes nothing.
6. **Press Submit**, having read the page and the list below.

And the thing that is not a command: **walk the app on a device first, in the
order a stranger would, with nothing skipped.** Answering the 2.1 rejection
meant making a screen recording, which meant exactly that walk, and it found
eight defects in an app its author had been using daily since the first commit
a fortnight before — including a recording feature that silently discarded what
people had just recorded. Twenty minutes, and it is the highest-yield thing on
this list.

**"For months" is what this said until 2026-08-22, and the project was two
weeks old.** The number was doing rhetorical work — surely a long-used app is
past such things — and the real claim is stronger without it: eight defects in
two weeks of daily use, by the person who wrote it, none of them found by
using it and all of them found by walking it in a stranger's order.

### What the second build costs that the first did not

Five differences, none of them obvious from having done the first one.

- **A new version record, and `expo.version` has to move with it.** A build
  cannot be attached to a version already released. Create the next version in
  App Store Connect *and* bump `expo.version` in `app.json` to the same string.
  `bin/upload-ios` bumps `buildNumber` and nothing else, deliberately — most
  releases do not change the version — so this one is by hand, and it is the one
  that bites: `CFBundleShortVersionString` and the App Store version record must
  agree **or the build picker is silently empty**, with nothing on screen
  saying why.
- **"What's New in This Version" is required.** It is the only listing field an
  update must have and a first submission does not. Everything else —
  screenshots, description, keywords, age rating, review notes — carries
  forward untouched, and should be changed only where it has stopped being true.
- **The reviewer still has to sign in, so the demo accounts stay.** Every update
  is reviewed, and the review notes' credentials have to work each time. This
  is why DEMO-ACCOUNT.md's teardown now triggers on withdrawing the app rather
  than on approval: deleting the accounts after the first approval leaves the
  second submission with a sign-in that fails, and recreating a contact pair
  under time pressure is worse than leaving them alone.
- **Phased release exists for updates.** Seven days, 1% to 100%, pausable at
  any point. A first release does not offer it. It is the cheapest insurance
  there is on a change with any risk in it, and pausing is instant where pulling
  a build is not.
- **The compatibility floor stops being free.** While everything installed was
  a tester, `MIN_SUPPORTED_BUILD` moved on judgement. With a public build out,
  raising it ends sessions on phones belonging to people who cannot be asked to
  update — so raise it only once `oldestBuild` on `/healthz` has already passed
  the number, never in advance to license deleting a shim. See
  `server/src/release.ts`, which carries the reasoning.

## What every submission needs configured on the box

Four settings in `server/.env`, none of them code, each of which is invisible
when wrong and each of which a reviewer meets:

- **`REVIEW_IDENTIFIER` and `REVIEW_CODE`**, or the reviewer cannot sign in at
  all. Both are required; either alone configures nothing.
- **`CONTACT_EMAIL`**, which is what the privacy page offers as the way to ask a
  question. Unset, the page points at the App Store listing's support address
  instead — true, but it reads as an app that will not say who runs it.
- **`KOFI_URL`**, without which the Support card offers nothing and a reviewer
  reading the notes about a donate link finds no donate link.

And the review account has to hold something to look at, since an account
holding nothing shows a reviewer an empty Home. The two accounts, why there are
two, and how to get a session as either are in DEMO-ACCOUNT.md; their
credentials are in `~/.config/thefloor/demo-account.txt`, mode 600.

## To verify before pressing submit

Ordinary things that are true today and are cheap to check again, because each
is the kind that goes stale between a decision and a submission.

- **`aps-environment` is `production` in the exported IPA** — the check at the
  top of this file, run against the build being submitted rather than any
  earlier one.
- **App Privacy still describes what the app collects**, which is the whole of
  the next section — the answers, the ones deliberately left No, and the
  manifest that does not agree with them. It is app-level rather than
  version-level, so nothing about a submission forces the look; take it.
- **`supportsTablet: false`,** so App Review does not open a phone layout on an
  iPad and file what it finds.
- **The review account holds demo data and nothing real**, since its code is
  published in the notes and is public from the moment the notes are.
- **`/privacy` is live and the date on it is right.** `PRIVACY_UPDATED` changes
  when the substance does.
- **A donation row is not needed, but `GET /donations` answering for the review
  account is**, since the reviewer will open the Support card.
- **`/support` answers as a page**, since it is what the App Store listing links
  to and the first thing a reviewer can open without installing anything.
- **The review notes ask for account deletion to be tested last.** Deleting the
  demo account takes its contacts with it, and what signs back in is a fresh
  account that cannot create a channel — so the rest of the review happens
  against an app that appears to do nothing. DEMO-ACCOUNT.md has the repair.

## The App Privacy answers, one data type at a time

Answered against `/privacy` on 2026-08-26, which is the method as much as the
date: that page is written as claims checkable against this source tree, so it
is the inventory and the questionnaire is the summary of it. **If the two ever
disagree the page is right and the questionnaire is stale**, because a change
to what is stored has to walk past `server/src/privacy.ts` and does not have to
walk past App Store Connect. Re-answer here, not from memory of what was ticked
last time.

It is **app-level, not version-level**, so nothing about a submission forces a
look at it — which is exactly how it goes wrong. The usage meter shipped
2026-08-19 and was declared 2026-08-20, a day the published label was untrue.

Every line below is **linked to the user's identity** and **not used for
tracking**. Nothing here is Third-Party Advertising, Developer's Marketing or
Product Personalization; the only purposes that appear are App Functionality
and, once, Analytics.

| Data type | Purpose | What it is, in this codebase |
| --- | --- | --- |
| Contact Info → Email Address | App Functionality | `accounts.identifier` is the sign-in address; `pending_invites.identifier` is an address one person typed for another; `donations.email` is what Ko-fi reports |
| Contact Info → Name | App Functionality | `accounts.display_name`, `guest_sessions.display_name`, `donations.from_name` |
| User Content → Audio Data | App Functionality | recordings in S3, and the stems sent to the transcription provider when somebody asks |
| User Content → Other User Content | App Functionality | `accounts.bio`, channel names and descriptions, `transcript_lines`, `donations.message` |
| Identifiers → User ID | App Functionality | `accounts.id`, and every row that references it |
| Identifiers → Device ID | App Functionality | the APNs token in `device_tokens`. Apple's category for a push token, even though it names an installation rather than a person |
| Usage Data → Product Interaction | **Analytics and App Functionality** | two different things under one heading — the meter (`usage_spans`, `usage_bytes`, 30 days, never shown to anyone) is Analytics; `accounts.last_seen_at`, which contacts are shown so they can tell whether it is a reasonable moment to talk, is App Functionality |
| Purchases → Purchase History | App Functionality | the `donations` row: amount, currency, whether recurring, attributed to an account and shown back under Support |

Three of those are **changes from what is published**, which as of 2026-08-20
was Contact Info, User Content, Identifiers and Usage Data → Product
Interaction for Analytics alone:

- **Usage Data gains App Functionality** beside Analytics. The meter was
  declared and last-connected was not, and they are the same category.
- **Purchases → Purchase History is new**, and is the one judgement call here.
  The reading against it is that the payment happens on Ko-fi's site, outside
  the app, and the record arrives by webhook rather than from a device — so it
  is arguably not collected *from this app* at all. Declared anyway, because
  the flow starts at a button in the app, the row is attributed to the account
  and shown back to that account, and the two errors are not symmetric: an
  undeclared category found by review is a rejection, an over-declared one is a
  line on a label nobody disputes.
- **Nothing is added for transcripts**, which is the answer the task expected to
  be harder. Audio and text were already declared as User Content, and the
  questionnaire asks what types are collected rather than who processes them —
  a provider acting on our behalf does not create a new type. What it *would*
  change is tracking, and does not: no third-party data, no ad measurement, no
  broker. What remains open is what the provider does with its copy after
  `Transcripts.forget`, which is BACKLOG.md's question and not this label's.

### The ones deliberately answered No

Each of these has a reason that is not "we did not think about it", and each
will look wrong to somebody who has not:

- **Contacts.** Never. The address book is not read, and no permission for it is
  requested. In-app contacts are people who accepted a request inside the
  application; an email typed into an invite is Contact Info, not the phone's
  contact store. Declaring this would imply a capability the app does not have.
- **Location, coarse or precise.** `app/src/api/region.ts` sends the device's
  locale and IANA time zone with the donations request, and `server/src/region.ts`
  reads them to decide whether the donate link may be shown — Guideline
  3.1.1(a). It is used in the request and stored nowhere; what persists is at
  most a hand-set boolean, `accounts.donations_allowed`. A time zone is not
  location data, and transient use is not collection.
- **Financial Info → Payment Info.** The card never reaches this server. Ko-fi
  holds it under their own policy, which `/privacy` says out loud.
- **Diagnostics, all three.** There is no crash or performance SDK in
  `app/package.json`, and Apple's own crash reporting is not developer
  collection. Server logs are not collected from the app.
- **Browsing History, Search History, Health, Sensitive Info, Advertising
  Data, Other Data.** Nothing produces any of them.

**When SMS sign-in lands, Contact Info → Phone Number is the answer that
changes**, and it changes app-level rather than in that version's record.

### The privacy manifest is a separate file and does not agree

`app/ios/TheFloor/PrivacyInfo.xcprivacy` declares `NSPrivacyTracking` false —
correct, and the reason no ATT prompt and no `NSUserTrackingUsageDescription`
belongs anywhere near this app — and an **empty `NSPrivacyCollectedDataTypes`**.

That emptiness was justified on the meter: the manifest describes collection by
app and SDK *code*, and the meter is derived server-side from sessions rather
than sent as telemetry. True of the meter, and **not true of the rest of the
table** — the client posts an email address and a display name and publishes
live audio, which is app code transmitting collected data. So the justification
on file covers one row and is being read as covering eight.

Left empty for now rather than quietly changed, because the recorded reasoning
says the opposite and that is a decision to make rather than a typo to fix. The
argument for populating it: the collected-data section of a manifest is
informational, feeds Xcode's privacy report, and over-declaring costs nothing.
The argument for leaving it: Apple requires the manifest for required-reason
APIs and listed SDKs, neither of which is this, and an empty array has passed
every upload so far. **Nothing about this is a submission blocker either way.**

### There is no API for any of it

`appPrivacyDetails`, `appDataUsages` and `dataUsages` all 404, and `appInfos`
carries only categories and age rating. So this cannot be read by a script or
gated in `bin/upload-ios`: it is checked by opening the page, and changes need
**publishing**, not just saving.

## App Store Connect, and what it will not tell you

Learned the hard way on 2026-08-17, resubmitting after the 2.1 rejection.

**The reply box and the Notes field are both capped at 4,000 characters.** A
long reply has nowhere to go — there is no larger field, and the answer is to
say it in 4,000 rather than to hunt for one. Both counters count down from
4,000, so paste and read the number.

**A sent reply cannot be edited.** One went out saying the screen recording was
attached when it was not; the repair was a second message carrying the file,
because the first could not be corrected. Attach before sending, not after.

**Resubmission runs from the version, not from the submission.** On the
submission detail page "Resubmit to App Review" stays greyed; the live control
is **Update Review** on the version page. The red banner there is informational
and does not need clearing.

**The notes can be rewritten while a submission is waiting.** A PATCH to
`appStoreReviewDetails` is accepted at `WAITING_FOR_REVIEW` and the submission
is undisturbed — same state, same submitted date — verified against a live one
on 2026-08-23. So a wrong paste is recoverable right up until a reviewer opens
it, and the fix is `bin/set-review-notes` rather than withdrawing anything.
Worth knowing before somebody withdraws a submission to correct a typo, which
costs the place in the queue.

**A version holding a build cannot take a different one, and the state that
says so is easy to misread.** Once `bin/submit-ios` has run, the version sits
at `READY_FOR_REVIEW` with a build attached and a reviewSubmission open — and
that is *not* submitted. Apple has received nothing; `submittedDate` is null
and `bin/submit-ios --status` prints `not submitted` against it. But the
version is no longer editable, so uploading a newer build and running the
script again fails with "1.2.0 is READY_FOR_REVIEW, which is not editable".

Two ways out, and the cheap one is nearly always right. **Remove the version
from the review submission in App Store Connect**, which returns it to
`PREPARE_FOR_SUBMISSION` and costs nothing when nothing was submitted — no
review has begun and there is no rejection to answer. Then attach the newer
build and run the script again. The expensive way is to bump
`CFBundleShortVersionString`, upload against a new train and abandon the
version record, which is right only when the version number itself was wrong.

The trap is the interval: the gap between running the script and pressing
Submit is exactly where a walkthrough finds defects and a new build gets made,
so this is the ordinary case rather than a corner. Learned on 2026-08-22, with
1.2.0 holding build 79 while build 80 was the one worth submitting.

**The UI is a poor witness to what state a submission is in.** The API is the
authority, and answers in a second:

    GET /v1/apps/<appId>/reviewSubmissions        → state, submittedDate
    GET /v1/apps/<appId>/appStoreVersions         → versionString, appStoreState
    GET /v1/appStoreVersions/<id>/build           → which build is attached
    GET /v1/builds?filter[app]=<appId>            → what Apple actually received

Signed with the same App Store Connect key `bin/upload-ios` uploads with — an
ES256 JWT, `aud: appstoreconnect-v1`. `WAITING_FOR_REVIEW` with a fresh
`submittedDate` is what a successful resubmission looks like;
`UNRESOLVED_ISSUES` with the old one is a rejection nobody has answered yet.

**`bin/submit-ios --status` is those four queries in one command**, and is the
thing to run rather than reloading the page. The script it belongs to is why
this section is no longer only a list of endpoints: 1.1.0 was submitted through
the API by hand on 2026-08-20, which is what showed that the whole path is
scriptable, and `bin/submit-ios` is that path with the guards attached and the
last call left out. A submission made this way is attributed in App Store
Connect to **`API user <key id>`** rather than to a name — `API user
3X4KWJ3W7M` in the submissions list is the key in `~/.config/thefloor/asc`, not
a second person with access.

The build list is worth its own mention: it is the only thing that says what
Apple *received*, as opposed to what was archived, tagged or echoed by the
script. Those four agreed for the first time on build 45.

### The DSA declaration, which is still a loose end

Answered **non-trader**: the app is free, there are no in-app purchases, the
Paid Apps Agreement is unsigned, and donations are voluntary, external and
unlock nothing, so there is no transaction with a user to be commercial about.

The red banner did not clear, and the Compliance row read `Digital Services
Act · 27 Countries or Regions · Active`. Those two disagree and it was never
resolved. It does not block review — the app was approved and released with the
banner still red — but it governs **EU availability**, which is what the
worldwide-availability decision rests on.

**Do not clear the banner by completing "Contact Information Verification".**
That is the trader path, and it ends with a home address published on the
product page. The route is Contact Us in App Store Connect, because only Apple
can clear an account-level flag.

---

## The release history

**1.0.0, build 51, released 2026-08-19.** The first public build.

Build 36 was submitted 2026-08-14 and rejected 2026-08-15 under **Guideline 2.1
— Information Needed** — not a defect finding but the seven-item information
pack a first submission is expected to carry. Fifteen builds separate 36 from
51, and only the first of those was about the rejection: making the screen
recording Apple asked for meant walking the app as a stranger would, and that
walk found eight defects. What each of them was is in decisions/DECISIONS.md;
the three files that carried the submission itself — the reply, the shooting
script and the build-by-build account — were deleted on approval, having had
everything recurring moved into this one first.

**51 was released rather than 52 deliberately**, though 52 was already in
TestFlight and master was some 2,800 lines of `app/` and `core/` ahead of it.
The declaration to Apple stays clear when what was approved is what ships.

The cost is worth knowing, because it is permanent: **build 51 cannot be told
to update.** The expiry client — `app/src/api/expiry.ts` and
`UpdateRequiredView` — landed in `5739f45` on 2026-08-17, hours after `build/51`
was tagged. 51 announces which build it is, so `oldestBuild` on `/healthz` can
see it, but it reads neither `minBuild` nor `mustUpdate` and will never show the
update screen. Every build from 52 on can be retired with a sentence on screen;
the first public one has to be waited out instead.

---

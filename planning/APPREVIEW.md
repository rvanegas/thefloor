# App Store review

**Temporary.** The checklist for the first App Store submission. It is deleted
when the app is approved, with whatever is still true afterwards moving to
DECISIONS.md. TASKS.md points here.

**Submitted 2026-08-14 as build 36. Rejected 2026-08-15 under Guideline 2.1 —
Information Needed. Resubmitting build 44.** Not a functional finding: Apple did not
report a bug, a crash or a policy breach, and did not say they failed to sign
in. They asked for the seven-item information pack that a first submission is
expected to carry, and the notes that went in answered perhaps three of them.
The rejection, what it asked for and the reply are in "The 2.1 rejection" below.
Release is manual, so approval will not put it live — that stays a separate
decision. The submitted text is at the end of this file, because a rejection is
answered by editing what was said rather than by remembering it.

What went in: build 36 (the first containing account deletion and the privacy
link), four screenshots, description, keywords, the review notes, six App
Privacy declarations, age rating 12+ by override, category Social Networking,
free, worldwide, and both served pages live. The demo channel holds one clean
5.68-second recording with a stem per participant.

**The one thing unresolved at submission** is the EU trader banner — see "The
DSA declaration" below. It does not block review; it governs EU availability.

---

## Built


### In-app account deletion — Guideline 5.1.1(v) — **done 2026-08-14**

Was the certain rejection. `DELETE /me`, a row under Sign out in
`HomeSettingsView`, one confirmation. It leaves every live channel rather than
evicting anyone: shared channels and the recordings made in them carry on
without you, and only channels you were the last member of are deleted with
what is in them. The `accounts` row survives as an emptied tombstone, because
`channels.initiator_id` is a real foreign key into it — nothing on it describes
a person and nothing can sign in as it. Donations are unlinked rather than
deleted.

The reasoning is in DECISIONS.md, "Deleting your account, and the row that
survives it"; `server/__tests__/account-deletion.test.ts` is the record of what
it does and does not take. The privacy page moved with it.

**For the review notes:** deletion is in Settings, under the account's own
heading, and takes effect immediately.

### A privacy policy link inside the app — Guideline 5.1.1(i) — **done 2026-08-14**

The policy has to be linked *both* in App Store Connect metadata and "within the
app in an easily accessible manner", and nothing in the app linked to it. It is
a Privacy card on the settings screen, above the Account one, opening
`${API_URL}/privacy` in the browser.

Cheaper than it first looked: `API_URL` in `app/src/api/config.ts` is already
the server, so no new route and no new field on any response — and the claims
somebody reads are the ones made by the server actually holding their data,
which a URL written into the app could not guarantee.

**The one thing to check before submitting** is that `API_URL` is non-empty in
the release build. It comes from `EXPO_PUBLIC_API_URL` at bundle time; empty, the
link says there is no server configured rather than opening `/privacy` on
nothing, which is honest but is not a privacy policy.

### A support page — Guideline 1.5 and the Support URL field — **done 2026-08-14**

`server/src/support.ts`, served at `GET /support`, written for somebody with a
question rather than for a reviewer with a checklist. `server/src/html.ts` is
the shell it shares with the privacy policy — the escaping and the chrome, and
nothing else, since the prose is the point of each page.

---

## Settled already, with the evidence

These have been decided, and the reasoning is recorded. They are here so the
submission checklist is complete, not because there is work in them.

| Guideline | Status |
| --- | --- |
| **1.2** user-generated content | Answered without moderation tooling. There is no way to reach anybody without a mutual accepted contact — no discovery, no directory — and any member of a channel can delete any recording in it. Blocking was built and reverted; see DECISIONS.md, "Blocking was built for Guideline 1.2, and reverted". **This one goes in the review notes**, because a reviewer reading "audio recording, multi-user" will look for it. |
| **2.1** completeness / demo account | `REVIEW_IDENTIFIER` and `REVIEW_CODE` fix one address's one-time code, because signing in means reading a code out of an inbox and a reviewer has none. Both must be set in `server/.env` before submitting and unset after. |
| **2.5.4** background audio | `UIBackgroundModes: ["audio"]` is declared and used — a channel goes on carrying audio with the app backgrounded. `voip` and `remote-notification` are deliberately out; see RELEASING.md. |
| **3.1.1(a)** external payment link | Permitted in the United States storefront, prohibited elsewhere, so the app ships worldwide and `server/src/region.ts` withholds the link per person, resolving every ambiguous case to hidden. `KOFI_URL` unset withdraws it from every installed build at a restart. See DECISIONS.md. |
| **4.8** Sign in with Apple | Not applicable. Sign-in is a first-party email code; there is no third-party login to offer an alternative to. |
| **5.1.1** permission strings | `NSMicrophoneUsageDescription` was corrected on 2026-08-14 and names channels rather than sessions. It is the only usage string the app needs — `expo-document-picker` uses the document browser, not the photo library. |
| **ITSAppUsesNonExemptEncryption** | Declared `false` in `app.json`. HTTPS and WebRTC only. |

---

## The server has to be configured for a submission

Four settings in `server/.env`, none of them code, each of which is invisible
when wrong and each of which a reviewer meets:

- **`REVIEW_IDENTIFIER` and `REVIEW_CODE`**, or the reviewer cannot sign in at
  all. Both are required; either alone configures nothing.
- **`CONTACT_EMAIL`**, which is what the privacy page offers as the way to ask a
  question. Unset, the page points at the App Store listing's support address
  instead — true, but it reads as an app that will not say who runs it.
- **`KOFI_URL`**, without which the Support card offers nothing and a reviewer
  reading the notes about a donate link finds no donate link.

And the review account has to be signed in to once and given something to look
at, since an account holding nothing shows a reviewer an empty Home.

---

## To verify before pressing submit

Ordinary things that are true today and are cheap to check again, because each
is the kind that goes stale between a decision and a submission.

- ~~**`aps-environment` is `production` in the exported IPA.**~~ Done for build
  36, which is the one to submit. Redo it only if another build is made.
- **`supportsTablet: false`,** so App Review does not open a phone layout on an
  iPad and file what it finds.
- **The review account holds demo data and nothing real**, since its code is
  published in the notes and is public from the moment the notes are.
- **`/privacy` is live and the date on it is right.** `PRIVACY_UPDATED` changes
  when the substance does, and account deletion changed the substance.
- **A donation row is not needed, but `GET /donations` answering for the review
  account is**, since the reviewer will open the Support card.
- **Deleting the review account is the last thing to test, not the first.**
  There is one of them, its code is published, and it does not come back.
- ~~**The demo account has a recording in it.**~~ Done 2026-08-14: one clean
  run of 5.68 seconds with a stem for each participant, made from a handset and
  a Simulator. The four failed 0:01 runs beside it are marked deleted. See
  DEMO-ACCOUNT.md, and DECISIONS.md for the recorder bug it uncovered.
- **`/support` answers as a page**, since it is what the App Store listing links
  to and the first thing a reviewer can open without installing anything.

---

## App Store Connect, which is not code

None of this is in the repository, which is exactly why it is written down here.

**Support URL.** `https://thefloor.rvanegas.co/support` — written, in
`server/src/support.ts`, on the same argument the privacy policy makes for
itself: served by the server it describes, so it deploys with the code and
cannot claim something that stopped being true. It is written for somebody with
a question rather than for a reviewer with a checklist, which is the only way to
write one that is any use.

Wired and tested. `GET /support` was the app's donations route until the rename
to `/donations` freed the name, and Fastify refuses a duplicate — so one test
asserts both still answer, the page unauthenticated and the JSON route with a
401, which is what tells them apart.

**Privacy policy URL.** `https://thefloor.rvanegas.co/privacy`.

**App Privacy labels.** They must match `server/src/privacy.ts`, which is
already a truthful inventory, so read them straight off it:

- *Contact info — email address*: linked to identity, used for app
  functionality. It is the sign-in identifier and how a contact request finds
  somebody.
- *User content — audio*: recordings, in S3 in the United States, linked to
  identity, app functionality. Live conversation is **not** recorded and should
  not be declared as collected.
- *User content — other*: display name and bio.
- *Identifiers — device id*: the APNs token, discarded on sign-out or when Apple
  reports it dead.
- *Usage data*: none. There is no analytics, no advertising, no third-party SDK
  receiving activity. Declare nothing here and mean it.
- **Tracking: no.** Nothing is shared with data brokers or used across apps.

The locale and timezone the app reports for the region filter are read and
discarded rather than stored — check `region.ts` and the call site before
declaring, since "used but not stored" is still a disclosure question if it is
ever persisted.

**Age rating.** The 2025 questionnaire asks about user-generated content and
about unrestricted communication with strangers. The honest answers are: yes to
user-created content, **no** to unrestricted contact — contact requires mutual
acceptance and there is no discovery. The privacy page already says the app is
not intended for anyone under 13; whatever the questionnaire returns must not
contradict that.

**Screenshots.** Required for 6.9" and 6.5" displays. Portrait only, which the
app already is. A channel with two people in it and one holding the floor is the
screen that explains the product; Home with contacts and a channel list is the
second.

**Review notes.** Write these rather than leaving them blank — most of the risk
in this submission is a reviewer guessing wrong about a design decision. Include:

1. The demo address and its fixed code, and that a code is normally emailed.
2. **That one person alone can use it** — create a channel, record, play back,
   export, rename, delete. `canStartRecording` requires only presence, and the
   microphone opens for a solo recording specifically. A reviewer who assumes a
   second person is needed will file 2.1 against a working app.
3. The 1.2 answer, in two sentences: no discovery, no strangers, mutual consent
   to any contact, and every member of a channel can delete anything in it.
4. That recording is deliberate, visible to everyone in the channel while it
   runs, and never automatic — the 5.1.2 question before it is asked.
5. That the donate link is a Ko-fi link, external, unlocks nothing, and is shown
   only to the United States storefront under 3.1.1(a).
6. **That deleting the account should be tested last.** It is not a warning
   about damage — the deletion is meant to be tried — it is that the demo
   account's contacts go with it in both directions, and signing in again at the
   same address yields an account with no contacts, which cannot create a
   channel at all (`ChannelRegistry.create` requires `areContacts`). A reviewer
   who deletes early spends the rest of the review on an app that appears to do
   nothing. One sentence removes the risk.

**Availability: worldwide.** This is the setting the donations argument used to
rest on and no longer does. Shipping US-only would now lock out non-US users who
already exist. Do not narrow it.

**Price: free**, and it has to stay free for the Ko-fi arrangement to be what it
claims to be. A paid app with an external donate link is a different guideline
conversation.

**Category.** Not decided anywhere yet, and it is not cosmetic: it is what a
reviewer reads the app *as*. Social Networking invites the 1.2 moderation
question directly; Productivity or Utilities does not, and neither describes it.
The honest reading is a communication tool for people who already know each
other, which is Social Networking with the 1.2 answer in the review notes — the
answer is good, so the safer-looking category is not worth the misdescription.
Decide it deliberately rather than by whatever the form defaults to.

**Content rights.** The form asks whether the app contains, shows or accesses
third-party content. It does, in one place: somebody can play an audio file they
chose into a channel. See the 5.2 note below, which is the same question asked
by a different form.

**App Review contact.** Name, phone and email, required, and it is where Apple
writes if they cannot get in. Use an address somebody actually reads during the
review, not `noreply@`.

**The build. It is 36**, uploaded 2026-08-14 and the first containing account
deletion, the privacy link and a server serving `/support`. Select it against
the version in App Store Connect. Nothing earlier can be submitted: in build 35
the Delete account button does not exist.

**Release: manual.** So the approval and the release are two decisions rather
than one, and a server that needs `KOFI_URL` or the review credentials changed
can be changed before anybody arrives.

---

## Open, and worth a decision before submitting

- **Media played into a channel and then exported — Guideline 5.2.** Somebody
  can pick an audio file and play it to the room, and a recording captures it.
  That is a copyright surface, and it is not currently mentioned anywhere a user
  or a reviewer would see. It is probably a line in the review notes and a line
  on the privacy page rather than a build, but it should be a decision rather
  than an omission.
- **Recording consent across jurisdictions.** Everyone in the channel sees the
  run in progress, which is the disclosure Apple asks for. Two-party-consent
  states ask more, and the app says nothing about it. Same shape: a sentence,
  not a feature — but decide it.
- **A support page, per above.** Blocking for the metadata, not for the code.

---

## What the submission itself taught, 2026-08-14

Filling the listing surfaced six things that are invisible from the code and
would each have cost an evening on the next submission.

**The version record said `1.0` and every build says `1.0.0`.** Apple groups
builds under the matching `CFBundleShortVersionString`, so the build picker was
simply empty, and the obvious conclusion — "36 has not finished processing" —
was wrong. The version field is editable while the state is Prepare for
Submission. `app.json` is the source of truth; make App Store Connect agree with
it rather than the other way round.

**The age rating calculated to 4+ and had to be overridden to 13+.** Every
content answer was honestly None — there is no profanity, horror or alcohol *in
the app*, and user-generated content is declared separately — so the
questionnaire produced a rating meaning "suitable for a four-year-old". That
contradicts the privacy page, which says the app is not intended for anyone
under 13, and a 4+ app carrying unmoderated person-to-person voice invites
Kids-category scrutiny it should not attract. Overriding upward is always
permitted and never queried. **Do not fix this by inflating the content
answers**, which would be lying about the app to move a number.

**A screenshot defeats `region.ts`.** Screenshots appear on the listing in every
storefront, so a Home screenshot showing the donate card puts an external
payment call to action in front of a German customer — the exact thing
Guideline 3.1.1(a) prohibits and the entire region filter exists to prevent. It
cannot be cropped out, because the pixel dimensions have to be exact. Shoot Home
with `donations_allowed = 0` on that account, then set it back to null.

**One screenshot set is enough.** 1320 × 2868 lands in `APP_IPHONE_67`, and
App Store Connect reuses it for the 6.5" slot, saying so on the page.

**The price tier is app-level and is not part of the version**, so "Add for
Review" goes blue without one. An approval landing on an app with no price is
one that cannot be released. Free, base territory United States.

**The demo account's display name is on your store screenshots.** It read "App
Review" in the first set, which tells every customer they are looking at a test
build. Rename it for the shoot and rename it back — the notes and the account
must agree by the time a reviewer signs in.

### The DSA declaration, which was the one loose end

Answered **non-trader**: the app is free, there are no in-app purchases, the
Paid Apps Agreement is unsigned, and donations are voluntary, external and
unlock nothing, so there is no transaction with a user to be commercial about.

The red banner did not clear, through a hard reload or otherwise, and the
Compliance row read `Digital Services Act · 27 Countries or Regions · Active`.
Those two disagree and it was not resolved before submitting. It does not block
review — "Add for Review" enabled with the banner still red, which is Apple's
own validator saying so — but it governs **EU availability**, and that is the
setting the worldwide-availability decision rests on.

**Do not clear the banner by completing "Contact Information Verification".**
That is the trader path, and it ends with a home address published on the
product page. If the banner outlives the review, the route is Contact Us in App
Store Connect, because only Apple can clear an account-level flag.

---

## The 2.1 rejection, 2026-08-15

Apple's message is the standard Guideline 2.1 information request. **Read what
it is before deciding what to do about it:** it does not name a bug, does not
say the reviewer could not sign in, and does not dispute a design decision. It
asks for seven pieces of information, and the notes that were submitted answered
items 3 and 4 well, item 6 by accident, and the rest not at all. The fix is
prose and a video, not a build.

Verified 2026-08-16, before writing the reply, because each of these is the kind
that goes stale between a submission and an answer and each would turn an
information request into a real 2.1:

- `GET /healthz` ok, `/privacy` and `/support` both 200.
- `REVIEW_IDENTIFIER` is live on the box and names `appreview@rvanegas.co`;
  `POST /auth/request-code` then `/auth/verify` with the published code returns
  a token. **The reviewer's way in works.**
- `GET /home` for that account still shows one accepted contact (Sam Rivera),
  one channel, and the one 5.68-second recording. Nothing a reviewer did
  disturbed the demo data — which also says they did not test deletion.
- Both stored demo bearer tokens in `~/.config/thefloor/demo-account.txt` are
  now **dead** — 401 against `/home`. They are 90-day tokens and this is only
  the second day, so something revoked them rather than expiring them, most
  likely a sign-out. It does not matter while the bypass is configured, since a
  fresh token is one sign-in away, but it does matter for teardown: DEMO-ACCOUNT
  step 2 deletes both accounts with those tokens. **Mint fresh ones before
  unsetting the bypass**, or the rows become unreachable — which is the exact
  failure that document's ordering exists to prevent, arriving by a route it did
  not anticipate.

### The one item that needs a decision rather than a sentence

**Item 1, the screen recording, has to be shot on a physical device, against
the build being submitted — which is 51.** Decided 2026-08-16, having first gone
the other way. The argument for a minimal build (build 36 plus the keyboard fix,
which reached TestFlight as 42 and 43) was that the binary, the notes and the
video should describe the same app. But the video had not been shot yet, so
shooting it against 44 satisfied that at no cost, and 44 additionally carries
"Hold a snapshot per channel, not one for all of them" — a live conversation
dropping behind "Loading channel…" and hanging up its audio, which is exactly
the kind of thing a reviewer finds and files under 2.1.

44 also improves the review itself. `dc18d82` made "Start a channel" the last
row of the channel list, and it creates a channel with **no invitees** —
`ChannelRegistry.create` runs its `areContacts` check per invitee, so an empty
list passes. A reviewer can therefore start a channel alone, which makes "you do
not need a second person" structurally true and defuses the old hazard of
deleting the demo account early and being left with an app that appeared to do
nothing.

### What is set up for the recording, 2026-08-16

Apple asks the recording to include account deletion, and deleting the demo
account takes its contacts with it in both directions. So the recording is shot
on a **separate account, `johnny@rvanegas.co`**, and that is the one deleted on
camera. The review account is never touched and needs no repair afterwards.

Getting there needed no production change and no bypass flip. The demo account
sent `johnny@` a contact request over `POST /contacts/request`, using a token
minted with `REVIEW_IDENTIFIER`/`REVIEW_CODE`, and it was accepted in the app.
Johnny then created and **named** a channel, "Weekly Convo" — the naming is
load-bearing rather than cosmetic, because `core/channel.ts` does not widen an
*unnamed* channel: an invite into one only parks the invitee in `invited`, and
`SET_NAME` does not promote them later. With it named, the demo account invited
Sam over the websocket (`canInvite` needs the inviter to be a participant, not
present, so nobody had to sign in as Sam, whose token is dead and who has no
code). Sam landed in `participants` directly.

So "Weekly Convo" holds Johnny, App Review and Sam. When Johnny deletes on
camera, the channel survives with App Review and Sam in it, and the demo account
lands back on one contact, one channel and one recording — which is what the
reply describes.

**Before rolling**, three things, two of which cannot be fixed once recording:

- **Confirm `johnny@rvanegas.co` receives mail.** Apple wants the login flow, so
  the app has to be signed out first — and `POST /auth/sign-out` revokes the
  token. Johnny has no fixed code, so a dead inbox means a locked-out account
  and a lost setup.
- **Sign out**, off camera.
- **Reset the microphone prompt**, which has already been granted on that
  device and so will not fire again. iOS Settings → General → Transfer or Reset
  iPhone → Reset → Reset Location & Privacy. Apple names permission prompts
  specifically.

**What the recording has to contain, in order**, because Apple names each and a
missing one is another round trip: launching the app cold; the sign-in flow,
address then code, pausing on the display-name field that doubles as
registration; Home; sending a contact request to any address, which shows a
request going out and nothing happening, the whole 1.2 answer; entering the
channel and the **microphone permission prompt** with its purpose string
readable; claiming and releasing the floor; recording, stopping, naming it
something neutral rather than the participant-derived default; playing it back
into the channel; renaming; exporting; "Play something together"; deleting a
recording, with its confirmation; Settings → Privacy policy opening in the
browser; "Chip in" opening Ko-fi; and Settings → Delete account last, ending on
the sign-in screen. Do not sign in again — that creates a fresh empty account.

There is no purchase flow, no subscription and no paid content to show, and no
App Tracking Transparency prompt, because there is no tracking.

Item 2 could not be answered from the repository — **nothing on the wire carries
a device model** — so the list of handsets and iOS versions came from whoever
did the testing, and is the internal testers' own hardware rather than a matrix
chosen for coverage.

### The reply, verbatim

Sent as a reply to the review message, with the recording attached, and copied
into the App Review Information → Notes field, which is where Apple asked for it
to live for future submissions.

```
Thank you — here is the information requested, in the order asked.

1. SCREEN RECORDING
Attached: a recording captured on a physical iPhone running the current release
of iOS, of build 51, the build submitted. It begins with a cold launch and
runs through sign-in, the microphone permission prompt, creating and using a
channel, recording a conversation, playing that recording back, renaming,
exporting and deleting it, the external donation link, the privacy policy link,
and finally account deletion.

There is no purchase, subscription or paid-content flow in the app, and no App
Tracking Transparency prompt, because the app does no tracking. The only
permission the app requests is the microphone, and the recording shows that
prompt and the purpose string that accompanies it.

The recording was made on a separate test account rather than on the review
account below, so that the account you sign in to is left with its contact, its
channel and its recording intact. The account deletion shown at the end is that
test account's, and it is a real deletion.

Sign-up and sign-in are the same screen in this app: an address, a six-digit
code, and a display-name field that names a new account or renames an existing
one. The recording therefore shows the registration screen and every field on
it.

2. DEVICES AND OPERATING SYSTEMS TESTED

iPhone 16 Pro Max — iOS 26.6
iPhone 16 Pro — iOS 26.6
iPhone 16e — iOS 18.5
iPhone 13 mini — iOS 26.6
iPhone 12 Pro Max — iOS 26.6

The app is iPhone-only; it does not declare iPad support. It was nonetheless
exercised on iPad in iPhone compatibility mode, so that the experience there is
known rather than assumed:

iPad Pro (12.9-inch, 4th generation) — iPadOS 26.5
iPad (7th generation) — iPadOS 18.7.9

This is the hardware belonging to the app's internal testers, so the list is
what real people were carrying rather than a matrix chosen for coverage. It is
all physical hardware in daily use, on the versions of iOS those people were
actually running. The app is portrait-only.

3. WHAT THE APP DOES, WHO IT IS FOR, AND WHY
The Floor is a voice app for talking with people you already know.

The problem it addresses is that a phone call demands to be answered now and a
group chat never finishes a thought. A channel in The Floor is a place rather
than a call: it holds up to six people, keeps its name, description and
recordings between conversations, and is still there when everyone has closed
the app. Nobody has to answer it. You drop in, and whoever is there is there.

Conversation is open by default — everyone present can speak. Anyone may also
claim "the floor", and for as long as they hold it every other microphone is
withheld, which is a way to be heard without being interrupted. Releasing it
returns the room to normal. Anyone can mute themselves at any time.

Anybody in a channel can start a recording. It captures each person as a
separate track, follows the floor so that whoever is silenced is silent in the
file, and when it stops it is named once for everyone. A finished recording can
be played back into the channel for everyone to hear together, renamed,
exported, or deleted — by any member, not only whoever started it. It takes its
name from the channel, so everyone refers to it by the same name, and any member
may rename it for everyone. A member can also pick an audio file from their
phone and play it into the channel the same way.

The target audience is small groups of people who already know each other —
families, friends, collaborators, remote colleagues — who want to talk rather
than type, and who want the conversation to be somewhere rather than to be an
event that has to be scheduled. It is not a social network: there is no feed, no
directory, no discovery, and no way for a stranger to reach anyone.

4. SETTING UP AND REACHING THE MAIN FEATURES

Signing in. There are no passwords. Normally a six-digit code is emailed. The
review account has a fixed code so that no inbox is needed:

  Email: appreview@rvanegas.co
  Code:  194399

Enter the address, tap through, then enter the code.

You do not need a second person, and this is structural rather than a
convenience: a channel can be started with nobody in it, and recording requires
only that you are present. One reviewer alone can exercise every feature in the
app.

The account is set up rather than empty. Signing in, you will find one accepted
contact, Sam Rivera, and three channels:

- "Weekly Convo", shared with Sam Rivera, holding one recording called "Short
  Sample". This is the one to start with; everything below can be done in it.
- "Sam Rivera" — an older channel shared with her that nobody has named, so it
  is described by who is in it rather than titled. The italics on Home mean
  exactly that: named channels are asserted, unnamed ones are only described.
- "Just you" — a channel with nobody else in it, which is what starting one
  alone looks like. It is there because a channel can be started with no
  invitees at all, and you are welcome to do the same.

To reach each feature from a signed-in Home screen:
- Open "Weekly Convo" from "Your channels". Tap "Step in" to join it; the
  microphone prompt appears here.
- "Claim the floor" takes the floor and "Release the floor" gives it back. It
  is available only when somebody else is present, since claiming it is asking
  the room to be quiet and there is no room to ask when you are alone. With one
  reviewer this control will be unavailable, which is correct rather than
  broken.
- Record starts a recording and Stop ends it. Nothing asks for a name: the
  channel lends its name to what it records, so every member sees the same
  name without anyone being asked. Renaming is on the recording's own row.
- Recordings are listed inside the channel, under "Recordings" — including
  "Short Sample", which is already there. Each row offers Play (which plays it
  into the channel for everyone present), Export, Rename and Delete.
- "Play something together" in the same channel picks an audio file from the
  phone and plays it into the room.
- "Start a channel" is the last row of the channel list on Home. It opens a
  new channel immediately, with nobody else in it — no contact is required.
  You can also start one with somebody by tapping them under Contacts.
- Contacts are added by email address at the foot of Home, or by tapping
  someone met in a channel. Nothing happens until the other person accepts.
- "Chip in" under Support on Home is the external donation link — see item 6
  for why it may not be shown to you.
- Settings, from the top of Home, holds "Privacy policy" (which opens the
  policy in the browser), Sign out, and Delete account.

Settings > Delete account works, takes effect immediately, and you are welcome
to use it. One thing worth knowing rather than a warning: it removes the
account's contacts in both directions, so signing in again at the same address
gives you a working but empty app. Everything still functions — you can start a
channel and record in it with no contacts at all — but the contact, the channel
and the recording set up for you will be gone. Testing it last costs you
nothing.

No sample files are needed. If you would like to try playing an audio file into
a channel, any audio file already on the device will do; the app uses the
document browser to pick one.

5. EXTERNAL SERVICES USED
- LiveKit — the open-source WebRTC media server, self-hosted by us on our own
  server, carrying live audio and producing the recordings. No third party
  receives the audio.
- Amazon S3 (US region) — storage for finished recordings.
- Amazon SES — sends the six-digit sign-in codes.
- Apple Push Notification service — notifies you when somebody asks you into a
  conversation.
- Ko-fi — an external donation page, opened in the browser. See item 6.

There is no third-party authentication provider, no payment processor, no
advertising network, no analytics or attribution SDK, and no AI or machine
learning service. The app collects no usage data. Sign-in is first-party.

6. REGIONAL DIFFERENCES
The app functions identically everywhere, with one deliberate exception.

The Support screen offers an external link to a Ko-fi donation page. Guideline
3.1.1(a) permits an external link to a payment mechanism in the United States
storefront and prohibits it elsewhere, so the server decides per person whether
to send the link, and shows it only where it appears the person is in the
United States. Every ambiguous case resolves to hiding the link. Where the link
is withheld, the "Chip in" card does not appear on Home at all, and the app is
otherwise identical.

The donation is voluntary and unlocks nothing. An account that has never given
behaves exactly like one that has. The app is free everywhere and there is no
in-app purchase or subscription of any kind. If you are reviewing from outside
the United States and wish to see the link, we can enable it for the review
account on request.

Nothing else varies by region: no content, no feature, and no restriction.

7. REGULATED INDUSTRY OR THIRD-PARTY MATERIAL
Not applicable. The app does not operate in a regulated industry — no health,
financial, gambling, medical or legal services — and ships no third-party
material of its own. All content in the app is created by its users.

One surface is worth naming rather than leaving for you to find: a member can
play an audio file from their own device into a channel, and a recording made
while that is happening captures it. That is the user's own file and the user's
own choice, in a private room whose members all consented to be there, and the
app supplies no catalogue, library or store of content.

ADDITIONAL — USER-GENERATED CONTENT (Guideline 1.2)
Included because it is what a reviewer reading "multi-user audio with
recording" will look for.

There is no discovery, no directory, no search, and no way for a stranger to
reach anyone. Every contact requires a request that the other person accepts;
until they do, nothing happens and no channel can be created. A channel can only
contain accepted contacts. Every member of a channel can delete any recording in
it, and any member can leave at any time, which removes them from the channel.
Removal is therefore available to the person affected, at the moment of harm,
without waiting on us.

RECORDING AND CONSENT
Recording is never automatic. Somebody in the channel starts it deliberately,
and while it runs it is visible on screen to everyone in that channel.
```

---

## What was submitted, verbatim

Kept because a rejection is answered by editing what was said, and because App
Store Connect is not a place anything can be diffed.

**These are the notes submitted on 2026-08-14, which the 2.1 rejection found
insufficient.** The replacement is the reply above, which goes in the Notes
field for the resubmission. Kept for the diff.

### Review notes

```
WHAT IT IS
The Floor is a voice app for talking with people you already know. A channel is
a place rather than a call: it holds up to six people, keeps its name,
description and recordings between conversations, and is still there when
everyone has closed the app.

Conversation is open by default — everyone present can speak. Anyone may also
claim "the floor", and for as long as they hold it every other microphone is
withheld, which is a way to be heard without being interrupted. Releasing it
returns the room to normal. Anyone can mute themselves at any time.

Anybody in a channel can start a recording. It captures each person as a
separate track, follows the floor so the silenced are silent in the file, and
when it stops it is named once for everyone. A finished recording can be played
back into the channel for everyone to hear together, renamed, exported, or
deleted — by any member, not only whoever started it. A member can also pick an
audio file from their phone and play it into the channel the same way.

People are reached by contact request, by email address or by tapping someone
you have met in a channel; nothing happens until they accept. Home shows who
your contacts are and when they were last connected, so you can tell whether it
is a reasonable moment to talk. Notifications tell you when somebody asks you
into a conversation.

SIGNING IN
There are no passwords. Normally a six-digit code is emailed. The review account
above has a fixed code — enter appreview@rvanegas.co, then 194399.

YOU DO NOT NEED A SECOND PERSON
The account already has one contact and one channel. Open the channel, tap
Record, speak, stop, then play the recording back, rename it, export it, or
delete it. Recording requires only that you are present, so a single reviewer
can exercise the whole feature alone.

USER-GENERATED CONTENT (1.2)
There is no discovery, no directory, and no way for a stranger to reach you.
Every contact requires an accepted request on both sides, and every member of a
channel can delete any recording in it — removal by the person affected, at the
moment of harm.

RECORDING AND CONSENT
Recording is never automatic. Somebody in the channel starts it deliberately,
and while it runs it is visible to everyone in that channel.

DONATIONS
The Support screen links out to Ko-fi in the browser. It is external, unlocks
nothing, and the app behaves identically whether someone donates or not. The
link is shown only in the United States storefront, per 3.1.1(a).

PLEASE TEST ACCOUNT DELETION LAST
Settings > Delete account works and you are welcome to use it. It removes the
account's contacts, and a fresh sign-in at the same address has none — and an
account with no contacts cannot start a channel, so deleting early leaves the
rest of the app looking empty.
```

### Description

```
The Floor is for talking with people you already know.

A channel is a place rather than a call. It holds up to six people, keeps its
name and its recordings between conversations, and is still there tomorrow.
Nobody has to answer it; you drop in, and whoever is there is there.

Conversation is open — everyone can speak. When one person needs to be heard
properly, they take the floor, and every other microphone stays quiet until
they give it back. It is a way to finish a thought.

Record a conversation when it is worth keeping. Every voice is captured on its
own track, so what you get back is clear rather than a scramble, and it is
named once for everybody. Play it into the channel afterwards and listen
together, export it, or delete it — anyone in the channel can, not only
whoever started it.

Nobody can reach you unless you have both agreed. There is no feed, no
directory, no strangers, and nothing to scroll. No advertising, no analytics.
```

### Keywords

```
voice,talk,conversation,friends,audio,record,speak,listen,group,call,turns,chat
```

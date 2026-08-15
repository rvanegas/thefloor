# App Store review

**Temporary.** This is the checklist for the first App Store submission, written
2026-08-14. It is deleted when the app is approved, with whatever is still true
afterwards moving to DECISIONS.md. FEATURES.md points here.

The app has been on TestFlight since build 5 and is at build 35. TestFlight
review is not App Store review: a build that ships to testers has passed a
lighter check, and the guidelines below are the ones that have not been applied
to this app yet.

**The code is done.** What is left is metadata typed into App Store Connect,
four settings in `server/.env`, one recording that has to be made on a device,
and two decisions that are a sentence each rather than a build.

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
| **2.5.4** background audio | `UIBackgroundModes: ["audio"]` is declared and used — a channel goes on carrying audio with the app backgrounded. `voip` and `remote-notification` are deliberately out; see AGENTS.md. |
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
- **The demo account has a recording in it.** This is the one piece of demo data
  that cannot be seeded over HTTP — it needs real audio through LiveKit from a
  device — and a channel with nothing in it demonstrates none of what the app is
  for. See DEMO-ACCOUNT.md.
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

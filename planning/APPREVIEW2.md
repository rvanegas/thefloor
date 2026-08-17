# What answering the rejection changed, builds 36 → 51

**Temporary.** The record of the second submission: what Apple asked for, what
answering it uncovered, and what shipped in consequence. It goes when the app is
approved, with whatever is still true moving to DECISIONS.md. APPREVIEW.md is
the submission itself — the reply, the shooting notes, the App Store Connect
material.

Build 36 was submitted 2026-08-14 and rejected 2026-08-15 under **Guideline 2.1
— Information Needed**. Build 51 is the resubmission. Fifteen builds separate
them, and only the first of those was about the rejection.

---

## The rejection was not about a defect, and that is the point

Apple reported no bug, no crash and no policy breach, and did not say they had
failed to sign in. They asked for the seven-item information pack a first
submission is expected to carry: a screen recording, the devices tested, what
the app is for, how to reach its features, what external services it uses,
whether it differs by region, and whether it touches regulated material. The
notes submitted with build 36 answered perhaps three.

So the fix was prose and a video. **What produced fifteen builds was making the
video**, which meant using the app the way a stranger would, in the order a
reviewer would, with nothing skipped. That found eight defects, four of them
serious, in features the notes were actively promising worked.

The general lesson is worth keeping separately from the specifics: *the app had
been used for months by people who knew which paths worked.* Walking it as a
reviewer walks it took under an hour to find the first thing that silently ate a
user's work.

---

## The serious ones

### A recording that captured nothing deleted itself

**Symptom.** Start a recording, watch the timer run, stop it — and nothing. No
card, no error, no row in the database, nothing in the server log. Sometimes.
Other times the same taps worked perfectly.

**Cause.** Two things compounding. Alone in a channel the microphone is closed
deliberately, since holding it open takes the audio session as a call and drags
Bluetooth to hands-free; starting a recording is what reopens it. But "a
recording is running" is a fact the app learns *from the server*, so capture
began a round trip before anything was published. A short enough run therefore
ended with no audio at all — and a run with no stems had its open row **deleted
with a bare `return`**, leaving no trace that it had ever happened.

**Why it took an evening.** That silent delete made one bug look like four. Each
investigation found a plausible different villain — a dead socket, a missing
push, a mix that never landed — because the event had erased itself. Two of
those investigations produced fixes that were right on their own merits and were
not the cause.

**Fix.** A run that ran and captured nothing is filed as a failure, so the app
can say it ended early. Deleting still happens where there was no run at all — a
zero duration, a mismatched id — because that is a non-event rather than a
failure. And the microphone now opens when recording is *asked for* rather than
when the server confirms it, which closes the window that produced the empty
runs. `98d8bcf`, `bc10953`.

**For the review.** This was reachable by any reviewer following the notes,
which promise one person alone can record. A five-second tap would have shown
them nothing at all.

### A recording did not appear until its mix finished

**Symptom.** Stop recording, and the recording is absent from the list for
several seconds — measured at 5.1 seconds for a hundred-second run, and it
scales with the audio.

**Cause.** Recordings are mixed when the run ends rather than when somebody asks
for one. Both list queries excluded `mix_state = 'pending'`, so that every card
on screen played and exported the instant it was tapped. The intent was good and
the cost was worse than the benefit: what somebody had just made was missing,
with nothing to say why, which reads as failure.

**Fix.** The card appears at once, and Play and Export are disabled while the
mix is being made — Rename and Delete stay live, since they are about the row
rather than the audio. `19c842d`, plus `9ab32f0` so watchers are told when the
run is filed and again when the mix lands.

### Actions and the rename field opened where you could not reach them

**Symptom.** Tapping a recording card near the bottom of the list opened its
actions below the fold. Tapping Rename put the field on screen but left **Save**
under the keyboard.

**Cause.** `ChannelView` was the one screen that hand-rolled its own
`ScrollView` instead of using `Screen`, so it had none of the keyboard handling
every other screen has. Fixing that alone was not enough: a keyboard-aware
scroll view reveals the *focused field*, and the field was visible — it was the
button an inch below it that was covered.

**Fix.** `ChannelView` uses `Screen` (`cfe64d2`), and a card that grows asks to
be brought wholly into view (`cbae4c2`), measured in window coordinates against
the scroll view's frame rather than by `onLayout`, which reports position
relative to the parent and sent the first attempt scrolling to the top
(`200a914`). The rename case reveals again on `keyboardDidShow`, because the
keyboard shortens the viewport *after* the field appears.

### Two invitations from one person were the same banner twice

**Symptom.** The App Review account, signed in on a simulator, showed two
identical banners: "Johnny Tahoe is waiting in a channel — tap to join". Neither
said which channel. Both claimed he was waiting; he had stepped out of both.

**Cause.** `InviteView` carried only `{channelId, from, createdAt}` — no name,
no roster, no presence — so an invitation could say who sent it and nothing
else. The banner's "is waiting in a channel" was hardcoded rather than checked.

**Fix.** The invitation carries the channel's name, the rest of its roster and
how many people are in it — the same three facts a rejoinable channel already
carried. The banner titles by channel, and with nobody there reads "asked you in
· nobody here right now" and loses the floor-coloured urgency. That wording was
not invented: a rejoinable channel already said "Nobody here right now" one list
further down, and the two were disagreeing about the same fact. `8df62ad`.

---

## The smaller ones

- **Signing out and back in landed on the settings screen.** `Root` does not
  unmount when a session ends, so `settingsOpen` — and every other screen
  stacked over Home — outlived the account that opened it. Since signing out is
  only reachable from that screen, it was certain rather than occasional.
  `channelId` surviving mattered more: signing out inside a channel and back in
  as somebody else left the app rendering a channel the new account may not
  belong to. `ae3939b`.
- **A floating "Go" pill on the sign-in screen.** `returnKeyType` was set on the
  six-digit code field, which uses a number pad — a keyboard with no return key
  to label — so iOS supplied a detached one, in the middle of empty space beside
  the button it duplicated. Fields on keypad keyboards now ask for nothing.
  `2d7a15c`. The first screen anybody sees, and the first App Review sees.
- **Actions taken while the socket was not open vanished.** `send` discarded
  anything it could not write, with no queue and no way for the caller to know.
  Now queued and flushed on connect, expiring after ten seconds — an action is
  something somebody did at a moment, not a standing instruction. `9c072a3`.
  Found while chasing the recording bug; not its cause.

---

## Not the app: things that made the evening harder

- **Every upload could be renumbered on the way out.**
  `manageAppVersionAndBuildNumber` defaults to YES and silently increments the
  build at the export that re-signs for distribution, but only on collision. Two
  concurrent releases from different branches produced builds whose numbers
  matched neither the archive, the tag, nor `app.json` — which is most of why
  the numbering was incomprehensible for an hour. Now passed as `false`, and
  verified twice since. `9e7267e`.
- **A branch cut from `build/36` carried an older `bin/release-ios`** that
  neither refused a dirty tree, nor committed the bumped `app.json`, nor tagged.
  So builds made from it left no record, and the *absence* of a tag was read as
  "the upload failed" when it meant "a different script ran". `0a51d28`.
- **The systemd unit's restart throttle had never worked.**
  `StartLimitIntervalSec` and `StartLimitBurst` were in `[Service]`, where
  systemd moved them out of in v229, so they were ignored with a warning only
  `systemd-analyze verify` shows. The interval was systemd's 10s default against
  a 3s `RestartSec` — a window five restarts cannot fit inside, so the limit
  could never trip. Fixed on the box and in the provision source, and the unit
  was reloaded for the first time since it was written.

---

## What the notes themselves got wrong

Worth its own section, because these were claims made to somebody whose job is
to check them.

- **"Stop ends it, asking for a name once, for everybody."** It does not ask.
  The server names a recording after its channel — which is why the demo account
  had three called "Weekly Convo" — and renaming is a button on the row.
- **The build number**, which named 44 while nine further builds fixed things a
  reviewer would have met.
- **"One channel between them."** After the shoot there were three. Rather than
  delete two to make the sentence true, the notes now describe all three — and
  the two extras happen to demonstrate two other claims: that an unnamed channel
  is described rather than titled, and that one person alone can start one.
- **Nothing said the floor control is unavailable to a lone reviewer.**
  `canClaimFloor` requires `atLeastTwoPresent`, because claiming the floor is
  asking a room to be quiet and there is no room to ask when you are by
  yourself. It is the feature the App Store description leads with; a reviewer
  finding it greyed out and unexplained would reasonably file it as broken. This
  risk was present in the first submission too.

---

## What is still owed

- **`MIN_SUPPORTED_BUILD`** is 36 and the wire has gained three optional fields
  since: `RecordingView.mixing`, and `InviteView`'s `name`, `others` and
  `presentCount`. All are additive and older builds ignore them, so nothing is
  broken — but the floor should move once 51 has displaced the population.
- **Dismissing an invitation is client-side only.** It hides the banner locally;
  it does not decline. Defensible, but more obviously a *hide* now that
  invitations are identifiable.
- **The stray channels were kept**, on the principle that describing the account
  honestly is better than curating it to fit a sentence already written.

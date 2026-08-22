
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## The Self-Mute Tone

CLOSED, and the title was wrong for three builds

**Reported 2026-08-19. Fixed by build 63, confirmed 2026-08-21.** Moving the
mute out of Apple's voice-processing unit and into WebRTC's own mixer node
(`InputMixer` in `muteMode.ts`) ended it. DECISIONS.md § *Muting moves from
Apple's unit to our own mixer* carries the result and what it does not
establish.

**This was headed "Self-Mute Still Moves the Audio Category" until it was
closed, and had been wrong since build 62** — which read the route either side
of a mute and found `BluetoothHFP` at 24 kHz both times, no route change, no
category movement. The heading outlived its own disproof by three builds, and
a heading is what somebody scans. Left recorded rather than quietly corrected:
it is the same failure as the one below, where the result existed and no file
knew.

**Kept in full below, because the method is the valuable part.** Six builds,
four fixes across three layers, all reasoned from source, none of them this
bug. What follows is the record of that.

**What was tried, in order, each plausible and each kept because each corrected
something real:**

| Build | Aimed at | Result |
| --- | --- | --- |
| 56 | the audio session's **category** (`policyFor`) | no change |
| 57 | the mute **releasing the track** (`MicIntent`) | no change |
| 58 | the engine's **mute mode** (`configureMuteMode`) | no change |

Three different layers, three confident diagnoses read off the source, three
misses. The common fault is not the reasoning at any step — it is that four
rounds of reading were spent before one measurement, and the reading kept
finding mechanisms that were real but not this one.

**The instrument is `src/audio/engineState.ts` and it needs no syslog, no USB
and no Mac.** Every audio-engine reader is blocking-synchronous, so a full
snapshot is taken either side of each microphone transition and the
*difference* kept — `recording: true -> false`, or `nothing moved`.

**It read on the phone, in a TestFlight build**, under the mute button in
`ChannelView`, because the reading needs a Bluetooth headset and a second
person and that is a situation which happens away from a desk. A development
build would have put the answer in Metro, where somebody who is not at home
cannot get at it.

**It was removed on 2026-08-21, before the next upload, and it went as one
piece** — `SessionAudio.engineLog`, `src/audio/engineState.ts`, its two test
files, the `report()` block and route-change effect in `useSessionAudio.ts`,
and the block in `ChannelView` that rendered it. That is the rule this entry
stated: deleting one and leaving the others is how a diagnostic becomes
furniture. **One piece was kept anyway** — the native route reader — and that
exception has its own entry below, so it cannot be forgotten silently.

**What survives the deletion is the readings, not the instrument.** Build 59's
is in DECISIONS.md § *The first reading, and the two things it could not see*,
along with what came after it. Restoring the panel means `git revert`, not
rewriting it.

**What each reading would mean** is written into that file's header so the next
session does not re-argue it. In short: `recording` going false means the input
is stopped despite everything, and the next lever is
`setRecordingAlwaysPreparedMode`, which exists to hold it open. `nothing moved`
means the engine is not what moves, three of the four fixes were aimed at the
wrong layer entirely, and the route is the remaining suspect — which was
awkward, because at the time nothing in this stack could read a route. That
closed the same day: STATES.md disagreement 8, and the panel below reads it.

**Do not ship a fifth fix before that reading exists.** It was the only
instruction in this entry that mattered, and it is how this closed: the reading
came first, killed the premise all four fixes shared, and left exactly one
variable, which build 63 changed.

**The reading was taken and then not written down, which nearly cost it.**
Build 63 shipped, 64 and 65 went past, and every file still described an
experiment awaiting a result that somebody already had. It was recovered on
2026-08-21 by asking. An unrecorded result is indistinguishable from an
untaken measurement — that is the standing lesson, and it is filed in
DECISIONS.md with the rest.

If the syslog relay is wanted as well, it takes the phone on **USB** — a network
pairing is not enough, and `devicectl` will happily report the device
"available" while the relay says "No device found":

    idevicesyslog -m "Native auto-config"

**Not `log stream`**, which three files recommended until 2026-08-20: it reads
the Mac's own logs and has no device options on current macOS, so it succeeds
and shows nothing.

## The Mic-Less Speaker Fix Is Verified; Check 3 Found Something Else

**Titled "Verify The Mic-Less Bluetooth Speaker Fix" until the checks were
run**, which they were on 2026-08-21, all three. Renamed rather than closed
because two of them passed and the third found a different bug, and a heading
asking for a verification that has happened is one somebody skips. The entry
above this one records what it cost to leave a heading standing after its own
disproof.

**Reported 2026-08-21, fixed the same day, verified on a device.** A second
participant entered and was audible on a Bluetooth speaker that has no
microphone — so the far end was playing out of a loudspeaker while the input
came from the built-in mic in the same room, which is an echo path.

**The cause was in the option list, not in a mechanism.** `CALL` listed
`allowBluetoothA2DP`, and A2DP is output-only, so under `playAndRecord` a
device that cannot capture was still an eligible output. iOS did as it was
asked. The option is gone; `session.ts` carries the reasoning and two tests pin
the absence.

**Unlike the four self-mute fixes, this one was not reasoned from a mechanism**
— the option's documented meaning is the observed behaviour, which is a much
shorter chain. That is a reason for more confidence, not for skipping the
check.

**What to check on the next build, in this order:**

1. **The reported case.** Mic-less Bluetooth speaker, second participant
   arrives. Expected: output moves off the speaker to the phone's loudspeaker,
   and both directions work.
2. **AirPods, which is the regression risk.** Build 19 removed this same option
   and a tester's headphones fell back to the phone speaker. That was read as
   A2DP eligibility being needed for headphones to be offered at all — a
   doubtful reading, since `allowBluetooth` covers an HFP-capable headset in
   both directions, but it is the thing that would bite. Expected: AirPods keep
   the route and go mono while capturing.
3. **The stereo transition still happens.** Nobody talking → `playback` →
   A2DP stereo returns. STATES.md calls this audible transition a feature; it
   should be unchanged, because the category did not move.

**If 2 fails, the route reader is how to tell what happened** rather than
guessing a sixth time. It is on screen: set `accounts.debug` and open the
diagnostic panel — see *A Gated Audio Diagnostic Panel* below. The `out` line
names the port and `rate` gives the profile numerically, which is the whole
reason a person who cannot judge it by ear can still run check 2.

**Checks 1 and 2 passed. Check 3 failed, and its failure is the interruption
below, reproduced.** Check 1 on build 65 and checks 2 and 3 on build 72, all
reported on 2026-08-21. The route fix is good: the mic-less speaker is
released as designed, and the build 19 regression did not recur — AirPods keep
the route and go mono while capturing, so the doubtful reading that A2DP
eligibility was needed for headphones to be offered at all is now disproved on
a device rather than merely doubted. **`allowBluetoothA2DP` can stay out of
`CALL` and this is settled.**

**What check 3 found.** Everybody present self-muted, the app was backgrounded,
YouTube played and sounded like A2DP — and foregrounding the app suspended it.

**It was read as the desired state and it is not.** The reading was that
self-mute keeps the session a call, so an exclusive session is what a muted
channel is supposed to have. `anyMicrophoneOpen` in `core/micNeeded.ts` says
the opposite, in the case it was written for: it excludes self-muted people by
construction, so *everybody* muted means `anyMicOpen` is false, and
`sessionFor(false, 0)` is `IDLE` — `playback` with `mixWithOthers`. The music
is supposed to keep playing. That is not an accident of the implementation but
the argument in that function's header: what one person's self-mute keeps a
call is *everybody else's* session while somebody else's microphone is still
open. When no microphone is open there is nothing to be exclusive for, and
`IDLE` exists precisely so a quiet channel costs another app's audio nothing.

So check 3 is a fault. The stereo half looked right — the other app sounded
like A2DP while this one was in the background — but that is a weak reading,
since a backgrounded app proves little about what this one asked for. The half
that plainly failed is the mixing that `IDLE` exists to provide.

**Do not "fix" this by pinning the session.** `micNeeded.ts` names both the
obvious cleanups — pin `CALL` on, or debounce the transition — and says both
delete the mono/stereo cue. The bug is between what is asked and what the
system ends up in, not in what is asked.

### The interruption, reproduced on 72 — and one comment is now known false

First seen on build 65 while *alone* in a channel, withdrawn within the hour
when a retry could not reproduce it, and parked rather than chased. Check 3
above reproduced it on 72 with a recipe: **everybody present self-muted,
background the app, start another app's audio, foreground this one.** Alone and
everybody-muted are the same case as far as the session goes — both are
`sessionFor(false, 0)`, both are `IDLE`, and both are supposed to mix.

**What is now established and was not.** `session.ts` justifies handing the
native observer `recording: CALL` unconditionally like this: *the observer
reads it only while this device is capturing, and our capturing implies
`anyMicOpen`*. **That implication is false under self-mute**, and self-mute is
the state this fault appears in. `intentFor` returns `muted`, which holds the
device open on purpose — `applyFor`'s own header says so: *with a muted track
still holding the device open, the engine never left the recording state to
re-enter it*. So the engine can report recording while `anyMicOpen` is false,
which is exactly the input on which the observer would apply `CALL` over an
`IDLE` we asked for. The comment is not a small error: it is the argument that
licenses the unconditional value.

**That is the leading candidate and not yet the answer.** Two others survive
the same evidence, and foregrounding is where they differ. A backgrounded app
loses presence in about a hundred seconds, so depending on how long the other
app played, foregrounding may be rebuilding the room rather than resuming one —
and a rebuild calls `startAudioSession`. Either WebRTC re-applying its own
defaults (the third writer STATES.md names) or the activation itself could be
what interrupts, with the observer innocent. **Activation is not
configuration**, and this symptom appears at an activation. Whether the
connection actually dropped is therefore the first thing to note when running
the measurement.

**Written down because the next occurrence is the second one, not the first** —
and this was the second. An audio-session fault that appears once and then
hides is the expensive kind.

**What the route fix has to do with it, which is little.** `CALL` is the only
configuration that fix touched, and this happens where `IDLE` is asked for. The
connection is that the fix made an existing wrong state audible: a `CALL`
applied while nobody is capturing used to leave an A2DP device eligible and got
away with it, and now evicts the route instead. That would make the
interruption a symptom of something pre-existing rather than a new fault, and
would go some way to explaining why this subsystem has resisted every fix
reasoned from source.

**Do not reason about it further — it reproduces now, so measure.** The panel is
back and gated: set `accounts.debug`, open it, run the recipe above, and read
the `asked` and `actual` lines at the moment the app foregrounds, which the log
stamps as `app active`. `actual` reading `playAndRecord` against an `asked` of
`IDLE` settles it outright, and settles which of the three candidates it is by
*when* the two lines part. See *A Gated Audio Diagnostic Panel*. **This is the
measurement to take before touching any code**, on the rule the entry above
this one paid six builds to learn.

## The Native Route Reader Is Still In The Tree

**Removed around, not with, the diagnostic — 2026-08-21.** The engine panel
under the mute button came out that day: `SessionAudio.engineLog`,
`src/audio/engineState.ts`, its two test files, and the `report()` block and
route-change effect in `useSessionAudio.ts`. `app/modules/audio-route` was
deliberately **left in place**, so this is the loose end.

What is there: `expo-module.config.json`, `index.ts`, `ios/AudioRoute.podspec`
and `ios/AudioRouteModule.swift`, plus `src/audio/__tests__/audioRoute.test.ts`,
which is now **the module's only caller**. Nothing in the app imports it. It
still builds, still registers as an Expo module, and still ships in the binary.

**It was kept on purpose and the purpose has a shelf life.** Removing a native
module is a build-affecting change and this one was proposed immediately before
an upload, which is the worst moment for one; and if the self-mute route
question above reopens, the route reader is the instrument that would be wanted
back, since STATES.md disagreement 8 records that nothing else in this stack can
read a route. Rebuilding it from git history is possible but is not free.

**Two ways to close this, and the choice is about that question, not about the
code.** If the route question is settled: delete the four module files and the
test, and let `prebuild --clean` regenerate `ios/` without it on the next
upload. If it is not settled: leave it, and say so here — but then the entry
above is not done either, and the honest state is that the investigation is
paused rather than finished.

**What must not happen is this note quietly ageing into permanence.** A native
module with one test and no callers is exactly the furniture the entry above
warns about, one level down: the panel was deleted to avoid becoming furniture,
and the thing it read from was kept.

**Closed the same day, in the second direction.** `app/src/audio/diagnostics.ts`
reads it, so the module has a caller in the app again and is no longer an
exception needing a note. It was also extended — `categoryOptions`,
`otherAudioPlaying` and `secondaryAudioShouldBeSilencedHint` — because the
comparison the panel exists for needs the options, and the once-seen
interruption needs the other two. This entry stays as history: the useful part
is not that the loose end closed, it is that the *reason* it was kept turned
out to be the reason it was wanted a day later, which is not what usually
happens to a deferred deletion.

## A Gated Audio Diagnostic Panel

**Built 2026-08-21, and unlike everything above it, it is not temporary.**
`app/src/ui/AudioDebugPanel.tsx` shows what the iOS audio stack is doing, on
the phone, under the mute button — where the deleted panel was. What it shows
is **what this app asked of the audio session beside what the session actually
is**, plus the route, the engine, whether another app is playing, and a log of
the things that cannot be polled.

**Read this before deciding it is furniture, because the objection is
answered.** The rule the entries above set is right: a diagnostic left in place
becomes furniture. But what makes furniture is being visible to every user with
nobody able to switch it off, which is what the previous panel was and why it
had to be deleted before an upload. This one is gated on `accounts.debug`, null
for every row in the database, and turning it off is:

    bin/db --write "update accounts set debug = null where identifier = 'someone@example.com'"

and a reconnect. No build, no submission, no wait. **Turning it on is the same
line with `1`.** There is no endpoint and deliberately no screen: it is not a
preference, and a setting somebody can find is a setting somebody will turn on
without knowing what it means.

**Who decides, since the entries above ask that of anything kept.** Whoever
holds the database. The flag is per account and per moment — set it while
watching something, unset it after. The panel costs an unflagged account
nothing: `hello` omits the field entirely, `AudioDebugPanel` is never rendered,
and the only thing that runs for everybody is `recordEvent`, which appends a
string to a forty-element array nothing reads.

**What closing this would look like**, so it cannot age into permanence either:
delete `ui/AudioDebugPanel.tsx`, `audio/diagnostics.ts` and its test,
`audio/engineState.ts`, the `asked` field on `SessionAudio` and its two write
sites, the `debug` column and its migration, the `debug` field on `hello`, and
`app.debug` in `AppProvider`. The route module goes with it or stays on its own
argument — see the entry above. **The trigger for that is not time passing.**
It is somebody deciding the audio subsystem no longer needs watching, which
after six builds in two days is not a decision to make from a quiet week.

**What it is pointed at first.** The unreproduced interruption in the entry
above: alone in a channel, foregrounding the app stopped another app's
playback. `sessionFor(false, 0)` is `IDLE` with `mixWithOthers`, so on the face
of it the build-65 change could not cause it — which means either the session
was not `IDLE` at that moment, or activation rather than configuration did it.
**The panel answers the first half by looking.** Open it, background the app,
foreground it, and read the `asked` and `actual` lines and the log line stamped
`app active`. If `actual` says `playAndRecord` while `asked` says `IDLE`, the
hypothesis in that entry is confirmed and the observer is applying `recording:
CALL` while nothing intends to publish.

## Being Silenced Without Looking — BUILT, fixed once, still unverified

**Built 2026-08-21, tried on a device the same day, and it did nothing at
all.** Not the pocket case — nothing, ever. iOS mutes haptics for the whole
duration of any session that is using audio input and the default is to do so,
so the cue was scheduled correctly, delivered correctly and discarded by the
operating system every time, with `notificationAsync` resolving throughout.
The session is `playAndRecord` whenever anybody present has a microphone open,
which is exactly when somebody can be silenced, so the feature never had a
state in which it could work. `applyConfiguration` now asserts
`setAllowHapticsDuringRecording(true)` at every write to the session and the
diagnostics panel reads it back as `haptics ok`; DECISIONS.md § *The buzz was
allowed and then discarded* has the header text and the reasoning.

**Build 71 was felt, and was the wrong cue** — "very slight, hardly
perceptible", which is a fair account of what a notification haptic is. It is
the alert vibration now, `vibrate()` in `modules/audio-route`, at the strength
iOS uses for an incoming call. The noise that implies costs nothing while it
fires, because being silenced means nobody is subscribed. **Build 72 is
unverified.**

**Reported and built 2026-08-21, unverified on a device.** A floor claim cuts
everybody else, and the only place it was said is the screen. Somebody with the
phone in a pocket, or face down on a table, went on talking into a track nobody
receives — for up to three minutes (`FLOOR_CLAIM_MS`), and again on every
claim. Nothing was broken; the state was correct in every layer and simply not
announced to the one person it was about.

**What it is now.** `app/src/audio/nudge.ts` schedules a haptic buzz while you
are *speaking* while silenced: the first two seconds into a run of speech, then
three seconds apart, four in total per claim. `useSilencedNudge` delivers it,
and is held in `App.tsx` beside the audio rather than in `ChannelView` —
presence is not a screen, so a cue mounted inside the channel screen would
switch itself off for exactly the people not looking at it.

**Tied to speech rather than to the transition**, which is the decision the
rest follows from. A one-shot buzz when the floor is claimed is missed by the
person it is for: the phone is in a pocket, they are mid-sentence, and a single
buzz against a leg is the least noticeable thing that could arrive. Tying it to
speech also leaves the quiet listener alone, who has no problem and would
otherwise be buzzed for having none.

**Four, then it stops, and the budget is per claim rather than per run of
speech.** Somebody told four times and still talking has either understood and
carried on or is not going to be reached by a fifth, and a phone buzzing every
three seconds for three minutes is its own kind of hostile. Counting per run
would let an ordinary speaker — sentence, breath, sentence — collect four
buzzes over and over for one claim; a test pins that.

**The one non-visual cue this app already had does not fire here**, which is
why nothing existed to extend. The audible mono/stereo transition — argued in
`core/micNeeded.ts`, recorded as STATES.md disagreement 4 — is driven by
`anyMicrophoneOpen`, which asks about `microphoneNeeded` and `selfMuted`. Being
silenced touches neither and the holder is unmuted throughout, so the session
configuration does not move and there is nothing to hear. The cue that exists
says *somebody's microphone is open in this channel*, which stays true of the
person who can no longer be heard.

**Both inputs were already computed, which is why this was a schedule rather
than a mechanism.** `isSilenced(channel.floor, me)` comes off the snapshot, and
`audio.speaking` already draws the dot — `ActiveSpeakersChanged` includes the
local participant, and **a silenced participant keeps publishing**:
`MediaPlane.setSilenced` withholds the *subscription* from each listener
(`updateSubscriptions`), never mutes the publication, which is what keeps the
silenced person's audio session alive. The SFU therefore still receives the
audio and still reports the speaker.

**Which is the reason Apple's detector was not used.**
`setMutedSpeechActivityEventListener` is the obvious tool and `muteMode.ts`
describes it: it is the talking-while-muted event, and it works *only* on the
voice-processing mute path — the path build 63 deliberately left to end the
AirPods tone that cost six builds. Taking it back for this would reopen a
closed bug to obtain an answer already in hand. Do not reach for it later
either.

**What was open is the pocket, and build 72 may have closed it by accident.**
The haptic could not reach a locked phone: `UIFeedbackGenerator` is ignored
when the app is not *active*, silently and with no error. Two things change
that. **Suspension is not the obstacle** — DECISIONS-2026-08-20-to-2026-08-21.md
§ *Backgrounding costs presence* measured a capturing app running twenty-five
minutes in the background, and this cue only fires while the microphone is
live, so the process is awake whenever there is anything to deliver. And
**`AudioServicesPlaySystemSound` is not a feedback generator** and is not gated
on `UIApplication` state, which is how iOS vibrates for a call while every app
is backgrounded. So the motor may reach the locked phone the tap could not.

**Test it before believing it**: lock the phone, have somebody claim the floor,
keep talking. If it buzzes, the remaining delivery — a **tone into the audio
session**, which reaches a background app because the audio does, at the cost
of playing over the voice it is announcing — is not needed and should not be
built. If it does not, that trade is still unsettled.

**Whatever any of it says must not be heard as "nothing is being kept".**
Silenced and recorded is unheard but captured, which `ChannelView` already says
in words. A buzz meaning "nobody can hear you", arriving on a phone in a
pocket, is where that gets confused.

**`expo-haptics` is a native module**, so this reaches a phone only after a
prebuild and a new build — it is not a JS-only change and cannot be checked in
Metro against an old binary. The same is now true twice over: the permission
that lets the buzz through is Swift in `modules/audio-route`.

**And the delivery was never confirmed, which is what let a whole feature ship
into a state it could not work in.** Both inputs being already computed made
this look like pure scheduling, and the scheduling is tested to the tick — but
nothing asked whether a buzz asked for is a buzz felt, and the API answers yes
either way. When the next non-visual cue is built, the question to ask first is
what suppresses it, not when to send it.

**One thing to settle on the way past.** `SessionAudio.mutedByServer` is
written from `RoomEvent.TrackMuted` and read by nothing, and since the floor
withholds subscriptions rather than muting the publication, it is not clear it
is ever true — no test asserts that it becomes so. This cue deliberately does
not use it. Whether the field is dead is a separate question, and STATES.md
disagreement 1 is where the answer belongs.

**What to check on the next build:** claim the floor from a second phone, keep
talking on the first with the app open, and count four buzzes at roughly 2s,
5s, 8s and 11s. Then stop talking, start again, and confirm nothing more comes
— the budget is spent for that claim. Then release and re-claim, and confirm it
starts over.

## Clipboard Sharing — CLOSED for text, and the size bound went the other way

**Built 2026-08-21, text only.** One slot per channel, replaced rather than
appended to; the card says who pasted and how long ago and never shows the
content; anyone present may paste, anyone at all may copy, and a clip that is
wholly a safe URL offers to open in the system browser. DECISIONS.md § *The
channel clipboard is one slot, and the content travels in the snapshot* carries
the reasoning.

**The entry proposed downloading on tap, and the opposite was built.** At 8,000
characters the content simply rides in the channel snapshot, which deleted the
upload route, the download route, the table and the failure mode for copying.
That inverts the size argument rather than answering it: the constraint turned
out not to be the one-off transfer but the *repetition*, a snapshot being
re-sent to every watcher on every transition in the channel. Read the decision
before proposing a larger cap.

## Clipboard Sharing: Images

The other half of the entry above, deliberately deferred. An image cannot ride
in the snapshot at any size worth having, so it is the fetch-on-tap design that
was planned and set aside: a `clips` row with an S3 key, a `GET` route, and a
descriptor in `ChannelState.clip` whose `kind` is already there waiting for it.

What it costs beyond that, none of which text needed: `getImageAsync` and
`setImageAsync` in `app/src/clipboard.ts`, which deal in base64 with a `data:`
prefix that has to be stripped and restored — and `setImageAsync` returns void,
so the "never report a success you did not have" rule that `copyText` satisfies
cannot be satisfied the same way. `storage.put` hardcodes `ContentType:
'audio/ogg'` and would need parameterizing. There is no image rendering
anywhere in the app yet, so a thumbnail is new ground. And `app/jest.setup.js`
mocks three clipboard functions; the image three are absent, so any path
reaching them throws in every existing suite.

Worth settling first: whether a thumbnail is shown at all, given that the text
case deliberately shows nothing. The argument against showing text — a screen
read over shoulders — applies at least as strongly to a picture, and an image
nobody can see before copying is a strange object.

## Anonymous Web Access

Channels can be shared to anyone with a link which navigates to web page with channel view modified for anonymous guest. Plan is here: ANONWEB.md

## Transcripts

Implement integration with Assembly.ai. Use multi-channel transcripts, searchability, batch transcription (not streaming), multi-language, diarization or speak-identification. Transcript triggered manually on recordings, result attached to recording and exportable. Search available during playback, and also across set of recording in channel.

## Watch Party

Currently, media play allows uploaded audio to be played and included into exportable recordings. Independently of this functionality, a watch party plays video, and disallows recordings. Plan is here: WATCHPARTY.md

## Stepping into Channel Distinct from Tapping on Card

Optional.

## Availability Logic

By way of indicators and notifications, users know when their contacts are available for conversartion, without having to interrupt each other with disruptive phone calls.

## Phone Calls

What happens when user receives a phone call?

## Publishable Recordings

## Calendar Integrations

Explore scheduling and usage patterns

## Introduce Radiate

A channel owner can gen a link defining the channel as root. Define a user's radiate number relative to a channel as 0 if user is in channel, and 1 + n the minimum radiate number of one's recently connected contacts is n. Recency is defined as having exchanged words in a channel. Having exchanhed words is defined as taking immediate turns in both directions in a channel.

Number is updated lazily when exchange occurs. In User View display radiate number.

## Build for Android

First evaluate relevant differences and establish dev simulator on mac.

## Payments Upgrade

Voluntary donations shipped on 2026-08-14 — a Ko-fi link, external, unlocking
nothing. See DECISIONS.md for why it is not in-app purchase. What is left:

- **`bin/import-donations`**, reconciling a Ko-fi CSV export into the
  `donations` table. Ko-fi has no read API, so a delivery missed while the
  server was down exists only in their dashboard; their dashboard is the
  authoritative record and ours is a convenience copy. Deferred until there is
  a real export to write the parser against, and it is also the answer for a
  donation paid from an address nobody signed in with.
- **In-app purchase, or Stripe**, if the Ko-fi arrangement stops being worth
  it. IAP is the only option that works outside the United States storefront;
  Stripe is the only one that can attribute a donation exactly, via
  `client_reference_id`. Both are a larger build than what shipped.

## Channel Admins

Channels, by default, have no admins or owner. In channel settings, a user can declare himself owner, and then give admin status to others. Certain functions are now available only to admins, and owner who is an admin implicitly.


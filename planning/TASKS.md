
# TASKS

These are new items on the roadmap — features, but also audits, open questions
and things to go and find out. There are more in BACKLOG.md.

## Idleness at Zero

Idleness display at zero is "Nobody is here right now".

## The Self-Mute Tone — CLOSED, and the title was wrong for three builds

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

## Verify The Mic-Less Bluetooth Speaker Fix

**Reported 2026-08-21, fixed the same day, unverified on a device.** A second
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

**Check 1 passed on build 65**, reported the same day: the reported case is
fixed. Checks 2 and 3 are still unrun.

### An interruption seen once on 65 and not reproduced

Reported and withdrawn within the hour on 2026-08-21. While alone in a
channel, foregrounding the app interrupted another app's playback — which had
worked before. On a retry it could not be reproduced, and the report was
parked rather than chased.

**Written down because the next occurrence is the second one, not the first.**
An audio-session fault that appears once and then hides is the expensive kind:
whoever meets it next will otherwise start from nothing.

**What did not add up, which is the useful part.** Alone in a channel,
`sessionFor(false, 0)` returns `IDLE` — `playback` with `mixWithOthers` — and
`CALL` is the only configuration the route fix touched. So on the face of it
the change could not produce this at all. Either the session was not in `IDLE`
when it happened, or the interruption came from *activation* rather than
configuration.

**The hypothesis it suggests, still unmeasured.** `pushPolicy` hands the
native observer `{ recording: CALL, playout: IDLE }`, and the observer applies
`recording: CALL` whenever the engine reports recording — not only when we
intend to publish. If `CALL` is applied while alone, then before the route fix
it left an A2DP device eligible and got away with it, and after the fix it
evicts that route and the eviction is audible. That would make the
interruption a symptom of a pre-existing wrong state rather than a new fault —
and would explain why this subsystem has resisted fixes reasoned from source.

**If it returns, do not reason about it.** The panel is back and gated, so
there is nothing to restore: set `accounts.debug`, open it, and read the
`asked` and `actual` lines at the moment the app foregrounds — the log stamps
that moment as `app active`. `actual` reading `playAndRecord` against an
`asked` of `IDLE` confirms the hypothesis above outright. See *A Gated Audio
Diagnostic Panel*.

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

## Clipboard Sharing

In channel, any user may paste his clipboard into the channel, after which any user may copy from the channel to his own clipboard. This is then a convenient way to share URLs or other small contents for which clipboards are typically used.

## Channel Admins

Channels, by default, have no admins or owner. In channel settings, a user can declare himself owner, and then give admin status to others. Certain functions are now available only to admins, and owner who is an admin implicitly.

## Anonymous Web Access

Channels can be shared to anyone with a link which navigates to web page with channel view modified for anonymous listener. Plan is here: ANONWEB.md

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


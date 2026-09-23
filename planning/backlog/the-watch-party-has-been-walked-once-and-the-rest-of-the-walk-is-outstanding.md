# The watch party has been walked once, and the rest of the walk is outstanding

**Partly done as of 2026-08-23, and rewritten 2026-09-23** against a subsystem
that had been rebuilt underneath it. The heading here first read "Nobody has
watched anything", which stopped being true the first time somebody did; the
verdict of that first pass was *mostly works*, and the one thing it found is in
`decisions/archive/DECISIONS-2026-08-23-to-2026-08-24.md` § *A watch party leaks
into the channel through the microphone* — not a defect but a property of the
design, said in the interface rather than fixed, because no code can fix it.
The reasoning for the feature is the same volume § *The Floor carries no video,
and that is the whole watch party*.

**Why it was rewritten rather than ticked off.** The walk as written described a
follower page on a laptop and a microphone that closed itself, and neither
exists. The player moved into the app on 2026-09-17
(`decisions/2026-09-17-the-screen-is-the-app.md`), and then between 2026-09-20
and 2026-09-23 the transport, the audio session, the device offer, the
advert-detector and the card were all rebuilt — three of those from faults
reported in a live room. **All three were in cases the old walk had no step
for**, which is the argument for the whole of Part C below.

Two phones and a laptop, all signed in to the same account where a step says
so.

## Before you start, and each of these has cost somebody a walk

**Unmute the room**, which is a deliberate act: parties start muted, so a walk
on the defaults is a walk with every microphone shut and no drift audible at
all. **And do it muted at least once too** — the mute lifting on pause and
returning on resume is the behaviour most likely to feel wrong in use, and no
test can tell you how it feels. Then **use headphones**, or the microphone
bleed above dominates everything and you will be listening to that rather than
to what you came for.

**Walk it on an account with the `debug` column set.** Since 2026-09-23 every
press, instruction, arrival and refusal writes to `recordEvent`, interleaved
with the audio session's own lines in one timeline — see
`decisions/2026-09-23-the-watch-transport-answers-the-press.md`, where that
interleaving is what turned three arguments into measurements. Walking without
it means reporting *it felt stuck* and having nothing to hand anybody.
**Open the audio panel before you start the film**: `startDiagnosticRecording`
installs the route observer when that panel first mounts and never before, so a
session where nobody opened it has no `route` lines and cannot say what iOS
granted.

## A. The transport and the clock

1. Paste a link, Start, Play. Both screens should be within a second or two of
   each other — `WATCH_DRIFT_MS` is 1500 — and **stay there for ten minutes
   without a visible correction**. Drift over time is the one thing that
   constant was chosen to buy and the one thing only a clock and a pair of eyes
   can check. **Nothing since has touched it**, which is why this step has
   survived every rewrite.
2. Seek from one phone; both screens jump.
3. Claim the floor from one phone; the other phone's transport greys out and
   **the film keeps playing** — a claim confers control, it does not pause.
4. Record is greyed with its reason: `canStartRecording` refuses outright while
   a party is loaded, playing or paused and wherever anybody is watching. Load
   an audio file: the two transports are exclusive since 2026-09-20 — both may
   be loaded, neither may play while the other does, and pausing is the way out
   of either.
5. Both step out; the party pauses. Step back in; it is still paused, where it
   was.
6. Restart the server; the party comes back paused at its position and every
   screen reconnects on its own. **The history has to come back whether or not
   a party does** — a different path through `revivedWatch`, and the one the
   server test pins.
7. **Paste a second link while the film is up.** Every screen should swap to it
   *stopped*, showing its title and staying that way until somebody presses
   Play. A burst of the new video before it settles means `cueVideoById` is not
   doing what its contract says, and the fix would be to hold the swap until
   the transport asks for it. **Check the outgoing film lands in *Watched
   before* with its name and length**: `rememberFilm` runs on the swap as well
   as on the stop.
8. **Click the video itself.** It may pause locally, and `follow()` should undo
   that within half a second — nothing should reach the other screens.
9. **Let a film run to its end.** It should stop there and say Finished, on
   every screen, and stay stopped. Then press Play: it should start again from
   the beginning on all of them. This was a live defect and was fixed in
   `77834cb3`, so it is a re-walk rather than a first one — the failure it
   replaced was the first second stuttering endlessly, and the failure the fix
   risks is the opposite, a screen stuck on Finished that will not replay.

## B. The devices and the microphone

10. **A film on one device.** Watch on the phone you are in the room on. The
    room should go quiet as it starts and stay quiet — ***Unmute the room* goes
    off the card entirely rather than greying**, the sentence beneath saying
    why, and it is the only refusal on that card that is removed rather than
    greyed (`decisions/2026-09-20-an-enforced-mute-has-no-button.md`). **Your
    microphone stays open and the sound blooms to stereo anyway**: since
    2026-09-23 the device is held for the length of the party under `SCREENING`
    — `playAndRecord` with a non-voice mode and A2DP — rather than closed, and
    nothing is published because a screening run is enforced-muted. Pause: the
    voice comes back, and with it the hands-free profile and mono.
    **What to listen for is the stereo, and what to look at is the indicator.**
    The handover this step used to be about has been measured — nineteen
    presses on build 278, resume median 597ms, no `engine stop` and no
    `categoryChange`, in
    `decisions/2026-09-23-the-screen-keeps-its-microphone.md` — so it is no
    longer the open question. **The open question is the lit microphone
    indicator**, up for the whole film now that the device is held. It is
    already true of any self-muted member and it is new for somebody who is
    only watching, and whether anybody minds is a question only an evening can
    answer.
11. **A film on two devices, one account.** From the phone, *Watch on another
    device*, with the app signed in on the laptop. The laptop becomes the
    *second device*: the film should arrive there without anybody stepping in,
    **taking that device over whatever it was showing** — another channel, the
    list, a settings screen — and opening on its own view, which is the
    picture, the transport, *Full screen* and the three rungs, and nothing else
    of the channel or the party. Nothing about presence changes, the phone is
    not displaced, the roster gains no second entry, and **the room becomes
    unmutable at once**, because nobody's screen and voice are on one device.
    The way back is *Watch on another device* from the second device's view.
12. **Switching mid-film, in both directions, and they are not symmetric.**
    With the room unmuted and the film on the laptop, tap *Watch on this
    device* on the phone. **Nothing should happen until the next pause**: no
    voice is cut, and the room is still audible. Pause and play, and the room
    goes quiet — `enforced` is sampled at `WATCH_PLAY`, and that sampling is
    there so a conversation is never cut off mid-sentence. **Now go the other
    way**: with the film on the phone and the room quiet, hand it to the
    laptop. ***Unmute the room* should come back immediately**, without waiting
    for a pause — `liftSpentEnforcement`, added 2026-09-23, drops enforcement
    one way only, on the argument that giving speech back is never an
    interruption. A button that stays gone for the rest of the film is the bug
    it was written for.
13. **Neither offer where no device of yours has the film.** Since `9b84d1a4`
    there is one offer at a time and never a control that would do nothing —
    *Watch on another device* where the film is, *Watch on this device* over
    *The film is on another device* where it is not, and nothing drawn where
    neither holds. The old switch's inert half is what this replaced, so the
    thing to check is that no third state draws both or neither wrongly.

## C. Rebuilt this week, and walked by nobody

14. **A film with a pre-roll advert in front of it.** The most expensive fault
    this feature has had and there has never been a step for it —
    `decisions/2026-09-23-the-advert-cannot-name-the-film-or-time-it.md`. Put
    on something that runs a spot. The scrubber must show the **film's** length
    and not the advert's, the card must name the film, and pressing Play must
    not run out thirty seconds later and restart. `showingTheFilm` answers on
    the video id the player reports; the length remains as the fallback for an
    embed with no `getVideoData`, **and the circle is still in that fallback**,
    so a player that has to use it is the case worth finding.
15. **Turn the phone sideways mid-film, repeatedly.** Full screen must arrive
    with **no black and no reload** — the picture is mounted once and
    `FullScreen` is the scrim alone; it used to tear down one `WebView` and
    build another, 1.0 to 1.5 seconds of black on the commonest gesture
    anybody makes at a film. The transport must keep answering across the turn,
    and the wrist is the way out, *Exit full screen* not being drawn on a
    turned handheld.
16. **Press play and pause twenty times, on the speaker and on a headset.**
    This is the original *flaky, gets stuck, rotating unsticks it* complaint,
    and what fixed it was `urgent` — patience is owed to the player, not to the
    person. No press should wait out an instruction the room has already
    contradicted, and `watch playing after Nms` in the journal is the number to
    read back.
17. **Background the app mid-film and come back.** A backgrounded `WKWebView`
    has its JavaScript suspended, so the page stops reporting and the follower
    stops reasoning about it. **Nothing should reload**: the silence watchdog
    that rebuilt healthy players on exactly this was removed the day it was
    written, and `onContentProcessDidTerminate` is all that remains. A fresh
    `watch player ready` in the journal after a return is the regression.
18. **Watched before.** Watch two films, stop both, and check the rows —
    newest first, behind one press on an idle card and open behind *Change
    video* on a loaded one
    (`decisions/2026-09-22-the-channel-remembers-what-it-watched.md`). Press a
    row: it should start the party the way the clipboard does, the stored URL
    going back through `parseYouTubeUrl`. **Then the case the design worried
    about**: start a film that is already in the list and stop it within
    seconds, and confirm the nameless entry has not replaced the named one.
    Reach the same video by a share link and by a watch link and confirm it is
    one row, deduplication being by video id.

## Known-unknowns, worth watching for rather than testing

**Nobody has seen what a video whose embedding is disabled does.** The page
says "That video will not play here" and the channel does not learn it, so the
transport goes on saying playing while one screen shows an error; whether that
is tolerable or wants a `WATCH_FAILED` from the page is a decision to make
after seeing it.

**The gate is per screen**: a device that has not been tapped yet is one the
transport believes is watching, which is correct and may still read as a bug to
whoever is looking at it.

**`getVideoData` is not in YouTube's published method list at all**, and now
carries the `video_id` that step 14's whole repair rests on as well as the
title. It has been stable for years and is what every player on the web uses
for this, it is read through a guard so failure is a blank line rather than a
broken page, and it has still never been watched failing.

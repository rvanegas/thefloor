# The watch party has been walked once, and the rest of the walk is outstanding

**Partly done as of 2026-08-23, rewritten 2026-09-23, and rewritten again
2026-10-03**, each time against a subsystem that had been rebuilt underneath
it. The first pass's verdict was *mostly works*, and the one thing it found is
in `decision/archive/DECISIONS-2026-08-23-to-2026-08-24.md` § *A watch party
leaks into the channel through the microphone* — a property of the design, said
in the interface rather than fixed. The reasoning for the feature is the same
volume § *The Floor carries no video, and that is the whole watch party*.

**Why it was rewritten a second time.** Ten days after the first rewrite, three
of its steps described behaviour that had since been reversed — the held
microphone of step 10 (`SCREENING`, deleted 2026-09-26), a claim that left the
film playing (refused while it runs since 2026-09-24), and a drift that "nothing
since has touched" (four changes on 2026-09-28) — and its setup told you to walk
on a `debug` account, which since 2026-09-28 switches off the very drift
correction step 1 is there to judge. And the chimes, the lock screen's Out and
the paste button had shipped with no step at all. **The rule the last rewrite
argued still holds: every fault reported since was in a case the walk had no
step for.**

Two phones and a laptop, all signed in to the same account where a step says
so.

## Before you start, and each of these has cost somebody a walk

**Unmute the room**, which is a deliberate act: parties start muted, so a walk
on the defaults is a walk with every microphone shut and no drift audible at
all. **And do it muted at least once too** — the mute lifting on pause and
returning on resume is the behaviour most likely to feel wrong in use, and a
muted phone is also where three chime and start faults were found on
2026-10-02. Then **use headphones**, or the microphone bleed above dominates
everything and you will be listening to that rather than to what you came for.

**`debug` is two things now, and the walk needs both and not on one device.**
It turns on the journal — every press, instruction, arrival and refusal written
by `recordEvent`, interleaved with the audio session's own lines, which is what
turned three arguments into measurements in
`decision/2026-09-23-the-watch-transport-answers-the-press.md` — and the drift
readout under the transport, which since 2026-10-01 has a line for **every**
screen, relayed only to `debug` sessions. But it also changes the follower:
**a `debug` player corrects no drift on its own** and follows presses only, a
held correction lighting *Correct drift* instead
(`decision/2026-09-28-under-debug-drift-is-corrected-by-hand.md`,
`decision/2026-09-28-under-debug-the-player-follows-presses-only.md`). So
**judge steps 1, 8 and 16 on a screen whose account is not `debug`**, and read
its drift off a `debug` device's readout, where it appears as a line of its own.
Walking every step on `debug` measures a follower no user has.

**Open the audio panel before you start the film**: `startDiagnosticRecording`
installs the route observer when that panel first mounts and never before, so a
session where nobody opened it has no `route` lines and cannot say what iOS
granted — and steps 10, 16, 17 and 19 are read off those lines.

## A. The transport and the clock

1. Paste a link, Start, Play. Both screens should be within a second or two of
   each other — `WATCH_DRIFT_MS` is 1500 — and **stay there for ten minutes
   with no visible correction**, on the non-`debug` screen. The constant is
   unchanged, but what is measured against it is not: since 2026-09-28 the
   follower steers on `app.serverNow()` rather than the device's own clock, a
   correction aims where the room will be rather than where it was, and the
   room's clock starts when a player does
   (`decision/2026-09-28-the-follower-steers-on-the-rooms-clock.md` and its
   two siblings that day). The old follower drove two screens apart by their
   clock skew, so **set one phone's clock a few seconds out by hand** and check
   it still agrees. The readout's seek count is the number to report; a screen
   that seeks with nobody pressing anything is a correction you could see.
2. Seek from one phone; both screens jump. **Then do it from the laptop by
   tapping the bar**: until `39760bdb` every tap on the web app's bar sent the
   whole room back to the start.
3. **Claim the floor from one phone while the film plays: it is refused.**
   `canClaimFloor` asks `watchIsPlaying` (`core/channel.ts`,
   `decision/2026-09-24-the-floor-waits-on-the-film-not-the-party.md`), and the
   floor greys with no reason given, as it always does. Pause: Claim works.
   Let a film reach its end and claim again: it must work there too, since a
   finished film is paused-and-loaded and the old rule refused every claim in
   that channel for good. **A claim confers no control of the film** — the
   floor has not been asked since 2026-09-18, so the other phone's transport
   stays live while you hold it.
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
   doing what its contract says. **Check the outgoing film lands in *Watched
   before* with its name and length**: `rememberFilm` runs on the swap as well
   as on the stop.
8. **Click the video itself**, on the non-`debug` screen. It may pause
   locally, and `useFollow` should undo that within a tick or two
   (`FOLLOW_TICK_MS` is 500) — nothing should reach the other screens.
9. **Let a film run to its end.** It should stop there and say Finished, on
   every screen, and stay stopped. Then press Play: it should start again from
   the beginning on all of them. Fixed in `77834cb3`, so a re-walk: the failure
   it replaced was the first second stuttering endlessly, and the failure the
   fix risks is a screen stuck on Finished that will not replay.

## B. The devices and the microphone

10. **A film on one device.** Watch on the phone you are in the room on. On
    Play you should hear the play chime, then the room go quiet, then the film
    — **in stereo, because this device gives its microphone up**: the session
    falls from `CALL` to `LISTENING` and the `WKWebView` takes it from there.
    That is the 2026-09-26 revert of the held microphone
    (`decision/2026-09-26-the-film-keeps-its-stereo.md`), and the cause it
    finally found is in `decision/2026-09-27-the-film-stops-the-engine.md`:
    a film starting under a held microphone stops the WebRTC engine and
    nothing restarts it. ***Unmute the room* goes off the card entirely rather
    than greying**, the sentence beneath saying why — the only refusal on that
    card that is removed rather than greyed
    (`decision/2026-09-20-an-enforced-mute-has-no-button.md`). Pause: the pause
    chime, the voice comes back, and with it the hands-free profile and mono.
    **What to listen for is the stereo arriving and leaving, and that nobody
    loses anybody after a pause** — two people unable to hear each other after
    one paused is the report that took four attempts.
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
    goes quiet — `enforced` is sampled at `WATCH_PLAY`, so a conversation is
    never cut off mid-sentence. **Now go the other way**: with the film on the
    phone and the room quiet, hand it to the laptop. ***Unmute the room*
    should come back immediately**, without waiting for a pause —
    `liftSpentEnforcement` drops enforcement one way only, on the argument that
    giving speech back is never an interruption. A button that stays gone for
    the rest of the film is the bug it was written for. **The handover itself
    should cost one session change, not three**: build 309 released, retook and
    released again on every Play
    (`decision/2026-09-29-the-film-handover-released-before-it-held.md`), so
    count the `released` lines either side of the press.
13. **Neither offer where no device of yours has the film.** Since `9b84d1a4`
    there is one offer at a time and never a control that would do nothing —
    *Watch on another device* where the film is, *Watch on this device* over
    *The film is on another device* where it is not, and nothing drawn where
    neither holds. The thing to check is that no third state draws both or
    neither wrongly.

## C. Rebuilt since 2026-09-23, and walked by nobody

14. **A film with a pre-roll advert in front of it.** The most expensive fault
    this feature has had —
    `decision/2026-09-23-the-advert-cannot-name-the-film-or-time-it.md`. Put
    on something that runs a spot. The scrubber must show the **film's** length
    and not the advert's, the card must name the film, and pressing Play must
    not run out thirty seconds later and restart. `showingTheFilm` answers on
    the video id the player reports; the length remains as the fallback for an
    embed with no `getVideoData`, **and the circle is still in that fallback**,
    so a player that has to use it is the case worth finding.
15. **Turn the phone sideways mid-film, repeatedly.** Full screen must arrive
    with **no black and no reload** — the picture is mounted once and
    `FullScreen` is the scrim alone. The transport must keep answering across
    the turn, and the wrist is the way out, *Exit full screen* not being drawn
    on a turned handheld. **Then put on a Short**: since 2026-09-29 an upright
    film keeps the phone upright on the card and in full screen alike, turning
    does nothing, and *Full screen* and *Exit full screen* are the only way in
    and out (`decision/2026-09-29-an-upright-film-keeps-the-phone-upright.md`).
16. **Press play and pause twenty times, on the speaker and on a headset**, on
    the non-`debug` screen, **and then twenty more from the other phone** while
    this one shows the film. The first half is the original *flaky, gets stuck,
    rotating unsticks it* complaint, fixed by `urgent`. The second half is the
    room's play, which until 2026-10-01 told the player to play under a session
    still moving and wedged it for 23 seconds
    (`decision/2026-10-01-the-room-s-play-waits-for-the-session-too.md`).
    **The pass mark is `watch playing after Nms` in the journal: 1.0 to 1.5
    seconds is the accepted cost**, about 1.15 of it the `WKWebView` taking the
    session, which is not ours to shorten
    (`decision/2026-10-01-the-transport-stays-quiet-while-the-film-starts.md`).
    **Anything over five seconds is the regression** — seven resumes in
    thirteen did that before the 2026-09-29 fixes. A start that logs
    `watch start` phases ending in `ready` and no `buffering` longer than about
    0.6s is a healthy one.
17. **Background the app mid-film and come back**, three ways.
    - **Showing it, and back within a minute.** A backgrounded `WKWebView` has
      its JavaScript suspended. **Nothing should reload**: the silence watchdog
      that rebuilt healthy players on exactly this was removed the day it was
      written, and `onContentProcessDidTerminate` is all that remains. A fresh
      `watch player ready` in the journal after a return is the regression.
    - **Showing it, into a pocket for five minutes.** Since `2e1d2145` a
      device that gave its microphone up for the film **retakes `CALL` on its
      way out of the front**, because a phone left on `LISTENING` with nothing
      flowing was suspended, dropped by the SFU and went Nearby, taking the
      film off the second device it was being watched on. `capturing CALL`
      against `capture deferred (backgrounded)` in the audio log is the reading;
      only the first is a pass.
    - **Wi-Fi off for fifteen seconds on the screen.** Since `2791aecd` the
      film plays on under a *Not connected* strip while it can, the wall is
      drawn over the rest, and when the socket returns **this device is still
      the screen** — it used to give the role up and reopen on People.
18. **Watched before.** Watch two films, stop both, and check the rows —
    newest first, behind one press on an idle card and open behind *Change
    video* on a loaded one
    (`decision/2026-09-22-the-channel-remembers-what-it-watched.md`). Press a
    row: it should start the party the way the clipboard does, the stored URL
    going back through `parseYouTubeUrl`. **Then the case the design worried
    about**: start a film that is already in the list and stop it within
    seconds, and confirm the nameless entry has not replaced the named one.
    Reach the same video by a share link and by a watch link and confirm it is
    one row, deduplication being by video id.
19. **The two chimes, on every phone, from every phone.** A falling octave as
    the film starts and a rising one as it stops, announcing the room's voice
    going and coming back
    (`decision/2026-09-26-the-film-says-when-it-starts-and-stops.md`). Each has
    been lost at least once for a different reason — played into a session
    that was moving, cut off by the release behind it, or waiting on an engine
    start a muted phone never makes
    (`decision/2026-10-02-the-play-chime-is-held-past-its-samples.md`). So:
    presses on the device showing the film **and** on the other one, muted
    **and** unmuted, and on each phone listen for both. **The play chime on
    the showing device is the one still argued about**: `CHIME_TAIL_MS` was
    added on a theory, and `watch chime at …` says whether it held —
    `finished after Nms` is a chime heard whole, `stopped at x/180ms` one cut
    off. `watch chime dropped after …` is a pause chime that gave up waiting.
    A muted phone must also start the film promptly; `no playback after 2000ms,
    playing anyway` was fifteen times in one run.
20. **The lock screen, mid-film.** Lock the phone while it shows the film and
    while it does not. The card reads channel name, *Open*, microphone, **Out**
    (`decision/2026-09-29-the-lock-screen-carries-a-way-out.md`). Press Out:
    the account steps out, the party pauses if nobody else is in, and **the
    card comes down** rather than lingering with a Mute for nothing. Then let
    the server step a locked, pocketed phone out, and the card should go with
    it (`decision/2026-10-01-the-server-ends-the-lock-screen-card.md`).
21. **Paste, with and without something to paste.** On iOS 16 and later the
    watch card's button is Apple's own *Paste* control and **no *Allow Paste?*
    sheet appears**
    (`decision/2026-09-29-pasting-goes-through-the-system-s-own-control.md`).
    With the clipboard empty it must be the ordinary disabled button saying
    *Copy a YouTube link first* — not a blank slot, which is what a device drew
    and the simulator did not. Copy a link in YouTube, come back, and the
    control should appear without anything else being touched
    (`decision/2026-09-30-an-empty-clipboard-gets-the-refused-button.md`).

## Known-unknowns, worth watching for rather than testing

**Nobody has seen what a video whose embedding is disabled does to the room.**
The phone's player now shows a refusal for each YouTube error code and logs
`watch player refused (N)`, but the channel still does not learn it, so the
transport goes on saying playing while one screen shows an error. `WATCH_FAILED`
exists in `core/` and nothing raises it — the server takes no such report from a
client, deliberately. Whether that is tolerable or wants a server-side check is
a decision to make after seeing it.

**The gate is per screen**: a device that has not been tapped yet is one the
transport believes is watching, which is correct and may still read as a bug to
whoever is looking at it.

**`getVideoData` is not in YouTube's published method list at all**, and now
carries the `video_id` that step 14's whole repair rests on as well as the
title. It has been stable for years, it is read through a guard so failure is a
blank line rather than a broken page, and it has still never been watched
failing.

**A playout-only engine renders nothing, and nobody knows why** —
`backlog/why-a-playout-only-engine-renders-nothing-is-not-known.md`. A muted
phone after a pause is exactly that engine, so silence there during step 19 is
that entry's evidence rather than a new fault.

# The film stops the engine

Measured 2026-09-27 on build 303, and it closes a bug that took four attempts
and three wrong mechanisms. **A `WKWebView` starting video playback takes the
audio session, and the WebRTC engine stops.** Not the configuration write — see
2026-09-27-a-configuration-write-does-not-stop-the-engine.md, which cleared that
earlier the same day — and not the party mute's unsubscription either, which is
what this run was built to separate.

Three reproductions, and the stop lands just before the picture every time:

| | stop after the press | before `watch playing` |
| --- | --- | --- |
| build 296, two phones, `SCREENING` | 1428ms | 316ms |
| build 303, film probe, a track subscribed | 1432ms | 217ms |
| build 303, film probe, **alone** | 1208ms | 298ms |

The third is the one that settles it. Nothing was subscribed — `sub - (0)` was
forty seconds earlier and the rebuilt room reported `0 audio already published`
and `subscribe deferred, nothing published yet` — so there was no subscription to
drop, and the engine stopped anyway.

## The probe, and what it deliberately left out

`filmProbeKeepsMicrophone` in app/src/audio/probe.ts, behind a switch in the
audio panel: it suppresses the one clause `microphoneNeeded` uses to subtract the
film, so a screening device keeps the microphone it would otherwise release. The
session stays `CALL` — `playAndRecord` under `videoChat` — and the route lines
either side of every press confirm it.

**It does not restore `SCREENING`, and that is the whole design of it.** The
obvious probe puts the configuration back and presses Play, which is what
2026-09-23 and 2026-09-26 both did, and it confounds the configuration with the
film. Having cleared the configuration in the morning, the afternoon's probe
removed it from the experiment and changed exactly one thing: whether the engine
is up and capturing when the film's audio arrives.

## The chain, end to end

1. Play is pressed on a device that is **holding its microphone**, which is
   `SCREENING` or this probe.
2. The WebView starts and takes the session. The engine stops **with
   `play=T rec=T`** — both directions still enabled, which is the signature of an
   interruption imposed from outside rather than a teardown this app chose. The
   same shape appears when iOS takes the session from a backgrounded app, which
   is the only other instance of it anybody has logged.
3. **Nothing restarts it**, because holding the microphone is precisely what
   removes the release and retake of the category. A pause re-asserts the same
   category — `why=categoryChange` on an unchanged `PlayAndRecord/VideoChat` — and
   an engine does not come back for that.
4. On the pause the subscriptions return onto a dead engine, and the detector
   says so in words: `playout frozen 6s — subscribed, rendering nothing`, six
   seconds after the `sub +`. That line is the reported bug.

**And this is why the shipped design works.** Releasing the microphone for the
film makes step 3 impossible: the category is released and retaken, and the
retake is what brings the engine up. The second on Play is that repair. It was
never the enemy, and 2026-09-23 spent a fortnight's worth of attempts trying to
remove it.

## What it means for a film in stereo

The task asked for this and the answer has a shape now. *Any design that avoids
the teardown has to say how the engine comes back up* — and the engine has to be
restarted **after** the film has taken the session, since the film will take it
whatever the configuration says. The only mechanism ever observed doing that is a
category release and retake.

**And releasing late works, which was measured an hour later with the same
switch.** Hold the microphone across the press, release it while the film plays,
and the pause's retake brings the engine up in 713ms — the subscription returning
onto a live engine with no freeze behind it. The control in the same session, the
shipped path releasing at the press, retakes in 735ms. So the pause already pays
that beat today and deferring the release adds nothing to it.

**`SCREENING` is not needed for any of that.** `LISTENING` is `playback` under
`spokenAudio` — already a non-voice mode, already 48kHz — so the stereo this was
all about comes from there and always did. The whole available change is *when*
the microphone is released: after the picture rather than before it, which adds
no session state and no configuration.

**What gates it is now a measurement rather than a decision**, and it may take
the work away entirely. This task was written on build 277, where the film
started 1.2 to 3.0 seconds after the press. Build 303 logged `watch playing` at
853, 1443, 1605 and 1793ms — and the slowest of those is the run where the
microphone was never released at all. If the release is no longer in the
picture's way there is nothing here to build. See the task.

## Two things that generalise

**The thing nobody suspected was the thing nobody had instrumented.** The film
is the loudest audio client in this application and the only one outside the
audio stack, and across four attempts at this bug no reading was ever taken of
what it does to the session. Every candidate examined was something this
codebase had written.

**A flag on a stop is worth more than a timestamp.** `play=T rec=T` said
*somebody else did this* from the first log, in August's vocabulary, and was read
past three times. The tally that made it legible — twenty-two stops, none of them
that shape — took one query of the journal and could have been run on any of the
earlier days.

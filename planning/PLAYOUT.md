# Shared playback that cannot be heard

**Temporary, and open.** This is one unresolved investigation gathered in one
place so it can be picked up cold. When it closes, the reasoning that survives
goes to `DECISIONS.md` and this file is deleted; the outstanding half lives in
`BACKLOG.md` § *The engine stops under a healthy room*, which is the entry to
update, not this one. Written 2026-08-24, after a day that produced six builds,
two retracted diagnoses and one bug that was the diagnostic itself.

---

## The symptom

Alone in a channel, play an uploaded track. The transport runs — the position
advances, pause and play both work, the server says `playing` — and **no sound
comes out of the phone**. Stepping out and back in does not fix it. Force-quitting
does not. Historically, only stepping into a *new* channel did.

It does **not** happen when somebody else is in the channel.

---

## What is established

Each of these is measured, not reasoned. Several cost a build to establish.

1. **The server is not at fault.** At the moment of failure the pump is
   producing frames, the media participant is in the room, its track is
   published and unmuted, and no `playbackStalled` line has ever been logged in
   production. Checkable directly — see *Instruments* below.

2. **The client is subscribed.** `sub +` appears with no matching `sub -`. An
   earlier reading of `audible 0` said otherwise and was wrong; see *Retracted*.

3. **The fault is confined to the playout-only session.** With somebody else
   present the session is `CALL` (`playAndRecord`/`videoChat`) and this never
   happens. Alone it is `playback`/`spokenAudio`, and it does.
   `core/micNeeded.ts` is what makes "alone" and "the session is playback" the
   same statement, so the company is not the variable — the session is.

   **Weakened 2026-08-25, and by the instrument rather than by the audio.**
   Until that day the freeze detector summed `totalSamplesDuration` across every
   subscribed track, so a person's track kept the total moving while the
   shared-playback track beside it rendered nothing. The confinement to the
   playout-only session was therefore something the detector could not have
   contradicted: it was blind to the fault for exactly as long as anybody else
   was in the channel. It reads per track now. The half of this that still
   stands on its own is the part established by ear.

4. ~~**A connection either renders from its first sample or never renders at
   all.**~~ **Withdrawn 2026-08-25** by build 94's log. At 18:41:35 a frozen
   playout *recovered* — `playout resumed after 10s` — with no rebuild, no new
   track and no new subscription, 2.7 seconds after the local microphone opened
   and the session went from `playback`/`spokenAudio` to
   `playAndRecord`/`videoChat`. The subscribed count was 1 throughout, so the
   samples that resumed were the shared-playback track's own. **So the fault is
   reversible in place**, which nothing before this had shown, and the thing
   that reversed it was a session write rather than anything to do with the
   connection.

   What the reversal does *not* settle is which half of that write did it. The
   category flip also tore the ADM engine down and restarted it — `engine
   stop` / `engine start play=T rec=T` in the two seconds before the resume —
   and a category write inside `playback` cycles the engine just as well, as
   18:33:11 shows. So *restart the engine under a live subscription* and *be in
   `playAndRecord`* are both still standing, and they are cheap to tell apart:
   rewrite the session without leaving `playback` — `IDLE` ↔ `LISTENING`, which
   differ only in `mixWithOthers` — and see whether the track resumes.

   **`playAndRecord`-when-alone is a diagnostic and never a fix.** On a
   Bluetooth headset it is the A2DP→HFP switch, which the same day's log prices
   at `sr=44100` down to `sr=16000`, mono, with `videoChat`'s echo canceller on
   the music — for the one feature where somebody is listening to music rather
   than to a voice. It would also delete the stereo bloom that STATES.md
   § *Audio Session Configuration* makes carry the meaning *nobody's microphone
   is open*.

5. **Rebuilding the room is not a reliable recovery.** It worked once, on build
   91, and has not worked since. Re-activating the audio session
   (`stopAudioSession` then `startAudioSession`) has never worked at all.

6. **Reading the WebRTC audio device module stops the audio.** Established by
   ear, twice. This was the original reported bug and it was self-inflicted —
   see *The diagnostic was the first bug*.

---

## The current hypothesis

**A track that is already published when the room connects gets subscribed
before playout is ready, and never renders. A track that arrives afterwards
renders normally.**

The evidence is build 92's first shipped run: eight connections, of which every
one that had time to report froze — except the single connection where the
media participant had not yet joined and the subscription landed seventeen
seconds after connecting rather than half a second.

It accounts for every otherwise-stubborn fact:

| fact | under this hypothesis |
| --- | --- |
| only a *new* channel restores audio | a new channel has no track; the participant joins after you do |
| re-entering a channel fails | the participant is already sitting in the room |
| stepping out and back in fails | same |
| rebuilding the room fails | same — it is the immediate-subscribe case by construction |
| the one rebuild that worked | luck, not mechanism |

**Build 94 gave it its first controlled test, and it passed.** Two connections
to the same channel fifty seconds apart, on 2026-08-25, differing in the
variable and in nothing else:

    00:19:45  room connected, 0 audio already published
    00:19:56  engine start / sub + media:chan_uM63…   → 36s, no freeze
    00:20:35  room connected, 1 audio already published
    00:20:35  sub + media:chan_uM63… (42ms later)
    00:20:43  playout frozen 6s

The server says why `N` was 0 the first time: the track was `POST`ed at
00:19:52, seven seconds *after* that connect. So the pair is the two arms of
the hypothesis, produced by hand, and they came out the way it predicts.

**It is still not sufficient, and the counter-example is fact 4's withdrawal
above** — a freeze that ended without the connection changing at all. Whatever
the connect-time ordering does, there is a second variable that can undo it in
place, and the ordering hypothesis has nothing to say about that one.

**Timing is a proxy and must not be mistaken for the variable.** Build 93 logs
the variable itself: `room connected, N audio already published`, counted at the
instant `connect` resolves and before anything subscribes.

**If it holds, the fix is an ordering never tried here**: connect with
`autoSubscribe: false`, then subscribe once the session is known to be active,
rather than letting the subscription land on the same tick as the socket.

---

## Retracted, and worth knowing so it is not re-derived

Three confident readings were wrong. Each was wrong in a way that is worth
recognising, because the same shape will recur.

**`IDLE` → `LISTENING` does not stop the engine.** Cleared, then un-cleared,
then cleared again. The clearing rested on there being no `engine stop` after
the category write. The kill turned out to be *silent* — audio was heard and
lost with no stop event anywhere near it — because the delegate reports stops
the ADM initiates, and a session reconfigured underneath a running engine is not
one of those. **Absence of an event is not evidence when the mechanism does not
produce that event.** Build 90 removed the write anyway, and the symptom
survived, so the write was at most a contributor.

**`audible 0` did not mean "not subscribed".** The panel's `audible` row is
`asked.othersAudible`, recorded when the session was last *written*. Build 90
made both closed states identical, so a subscription stopped writing the
session, so the field froze at its connect value of zero. A whole diagnosis of
"lost subscription" was built on it. Fixed in build 92.

**`settleEmpty` was not the explanation for step-out/step-in.** It does pause
playback when the last person leaves, deliberately and by design — but a paused
transport reads *paused* and freezes its position, and the reported transport
was advancing.

**The lesson that generalises**, and it caught the same person twice in one day:
*a change that removes a write can remove an observation*. Build 90 collapsed
two audio-session states to stop a write racing the engine, and in doing so
silently deleted both the log line and the panel field that reported
subscriptions.

---

## The diagnostic was the first bug

The originally reported symptom — walk to Home, come back, silence — was the
diagnostic panel reading the audio engine.

`AudioDebugPanel` took a reading in a lazy `useState` initializer, which runs on
**every mount**, and the panel mounts with `ChannelView`. So returning to the
channel screen read the engine, and reading the engine stops it. Confirmed by
setting `debug = 0`, which removes the panel from the tree entirely: the Home
round trip stopped failing.

`engineState.ts` claimed of its readers that *"a snapshot costs nothing… not a
theory about what moves, but a reading of what is."* **That claim is false.**
`RTCAudioDeviceModule.h` marks five of the six engine flags *"For testing
purposes"*, which is not a promise of safety under a once-a-second poll.

Which of the nine readers is destructive is **not known**. They are properties
on a prebuilt binary and LiveKit's WebRTC fork is not a public repository — only
the header ships. `app/src/audio/probe.ts` exists to bisect it by ear and has
never been run to completion, because the panel fix made it non-urgent.

Since build 89 the panel reads nothing until *Read now* is pressed.

---

## Instruments

**The log now ships to the server.** This is the important one: it survives a
force-quit and needs nobody to copy anything.

    ssh -i ~/.ssh/lightsail-ubuntu ubuntu@44.241.121.49 \
      'journalctl -u thefloor --since today' | grep "audio diagnostics"

Each line is JSON with a `lines` array of `{at, text}`. `POST /diagnostics`,
gated on the `debug` column, written to the journal rather than a table — the
route's own comment says why. Batched every thirty seconds and on backgrounding.

**What the lines mean:**

| line | meaning |
| --- | --- |
| `room connected, N audio already published` | **the hypothesis's variable** (build 93) |
| `sub +` / `sub -` | a subscription arrived or went, with the running count |
| `engine start` / `engine stop` | WebRTC's own delegate, playout and recording flags |
| `playout frozen Ns — <identity> subscribed, rendering nothing` | the fault itself, naming **which** track (build 95) |
| `playout resumed after Ns — <identity>` | that track recovered without a rebuild (build 95) |
| `room disconnected (reason)` | why a rebuild happened (build 93) |
| `foreground rebuild (was …)` | the other way one happens (build 93) |
| `reconnect in Nms (attempt k)` | the backoff |
| `screen channel` / `screen home` | navigation, invisible to every other signal |

**`playout frozen` is the detector**, and it is deliberately **log-only**.
`app/src/audio/playout.ts` polls `totalSamplesDuration` from standard
`inbound-rtp` statistics — the one measurement available that does not touch the
ADM and therefore cannot itself be the fault. It does **not** trigger a rebuild:
a rebuild is the failing case, so acting on the detector would have the app
answer the fault by re-entering it.

**It clocks each track separately, since build 95, and the two bugs that
correction fixed are both worth recognising rather than just fixed.** The first
was the sum: one count across every subscribed track, on the reasoning that
what matters is whether *something* is rendering rather than which. A person's
track advancing hid the shared-playback track standing still, so the detector
could not see the fault whenever anybody else was present — which is precisely
the condition the fault was believed not to occur in. **An instrument that
cannot observe the case it is being used to rule out will agree with whatever
it was built to confirm.**

The second was quieter and is the same shape as everything else in this file.
The watch lived inside a `useEffect` keyed on `state.othersAudible`, so every
arrival and departure rebuilt it and cleared `reported` — and `playout resumed`
only fires for a watch that has reported a freeze. The recoveries were
therefore being deleted by the very events most likely to cause one. It cost a
wrong reading the day it was found: 20:03:41's freeze had no resume line after
the session flipped to `CALL`, which looks like *it did not recover* and is in
fact *somebody joined two seconds earlier and reset the clock*. Both watches now
live across the whole connection and are keyed by track sid — by sid rather than
by identity because the count belongs to the receiver, and a republished track
starts again at zero, which under identity keying reads as a freeze.

**The server side**, to confirm it is not at fault:

    journalctl -u thefloor --since today | grep playbackStalled     # expect 0
    journalctl -u livekit-server --since today | grep "chan_<id>"

and `bin/health` for what is actually deployed.

**Watch the detector's false-positive rate** before ever letting it act. A
backgrounded app renders nothing on purpose. The poll is guarded on
`AppState.currentState === 'active'`, but that guard is untested against real
data.

---

## What to do next

1. **Measure again on build 95, now that the detector reads per track.** Every
   reading taken while somebody else was present was taken through the sum and
   is worth nothing; the whole with-company half of this investigation is
   unmeasured rather than clean. The first question the new log can answer that
   the old one could not is whether the shared-playback track freezes in a
   `CALL` session too, unheard because a voice is arriving over the top of it.
2. **Tell the two candidate mechanisms apart, by ear, before writing either
   fix.** Frozen and alone, rewrite the session without leaving `playback`
   (`IDLE` ↔ `LISTENING`, which differ only in `mixWithOthers`). If the track
   resumes, the operative thing is the engine restarting under a live
   subscription, and the fix costs no sound quality. If only `playAndRecord`
   revives it, the category is the variable and `autoSubscribe: false` is the
   way, because it avoids the freeze rather than paying HFP to escape it.
3. **Then** try `autoSubscribe: false` at connect with an explicit subscribe
   after activation. Still a real behaviour change, still wants its own build
   with nothing else in it.
4. **Do not wire the freeze detector to `reconnect()`** on the strength of
   anything currently known.
5. **The bisection in `probe.ts` is still unrun.** It was *started* on build 94
   at 18:18 — all nine readers fired and returned — but in a `CALL` session,
   which is the one condition where the fault does not show and, before build
   95, could not have been seen if it did. That run establishes nothing. Run it
   alone.

**And the standing rule this subsystem keeps re-teaching:** measure before
writing code. `engineState.ts`'s own header records three mechanisms reasoned
from source, three builds, no change. This day added four more wrong readings,
every one of them plausible, every one of them settled by an instrument rather
than by an argument.

---

## Where the code is

| | |
| --- | --- |
| the session's three states and the flag collapsing two | `app/src/audio/session.ts` |
| connection, subscription, engine and the log lines | `app/src/audio/useSessionAudio.ts` |
| the freeze detector | `app/src/audio/playout.ts` |
| shipping the log off the phone | `app/src/audio/shipping.ts` |
| the panel, which now reads only on demand | `app/src/ui/AudioDebugPanel.tsx` |
| the ADM readers, and the warning on them | `app/src/audio/engineState.ts` |
| the unrun bisection | `app/src/audio/probe.ts` |
| where the log lands | `POST /diagnostics` in `server/src/app.ts` |
| the server-side pump and its heartbeat | `server/src/playback.ts` |

Related reading: `BACKLOG.md` § *The engine stops under a healthy room* (the
live entry), `DECISIONS.md` § *A channel that cannot be heard, and nothing that
could tell* (the server-side half, which was a real defect and not this bug),
`POSTMORTEM-echo.md` (the audio session's three writers), `STATES.md`
disagreements 1, 4, 5, 8 and 11.

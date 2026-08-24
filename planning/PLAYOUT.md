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

4. **A connection either renders from its first sample or never renders at
   all.** There is no observed case of audio running for a while and then
   stopping on its own. The one case that sounded like it — a fraction of a
   second after a rebuild — is a start that died immediately, not a run that
   ended.

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
| `playout frozen Ns` | subscribed and rendering nothing — the fault itself |
| `playout resumed after Ns` | it recovered without a rebuild |
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

1. **Read a failure's `room connected, N …` line.** `N > 0` on every freeze and
   `N = 0` on every clean render confirms the hypothesis. Mixed, and it is
   wrong and the next suspect is whatever else separates those connections.
2. **If confirmed**, try `autoSubscribe: false` at connect with an explicit
   subscribe after activation. That is a real behaviour change and wants its own
   build with nothing else in it.
3. **Do not wire the freeze detector to `reconnect()`** on the strength of
   anything currently known.
4. **The bisection in `probe.ts` is still unrun**, and knowing which reader is
   destructive is what would let the panel read the other eight safely.

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

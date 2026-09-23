# The phone holds a microphone in order to hear

Closed 2026-09-23, on fixes confirmed 2026-09-05 and widened to everybody the
same night. **This absorbs `PLAYOUT.md`, which was the investigation's own file
and is deleted with this entry**, and it closes `BACKLOG.md` § *The engine stops
under a healthy room* — a 536-line log that stopped at build 93 and had been
overtaken by the file it pointed at. What is still not known is one question,
and it has a backlog entry of its own: *Why a playout-only engine renders
nothing is not known*.

The investigation ran from 2026-08-24 to 2026-09-05, across roughly fifty
builds, and produced three retracted diagnoses and one bug that was the
diagnostic itself. It is written up at length because almost none of it is
inferable from the code: what is in the tree is two small settings and a
detector that deliberately does nothing.

## The symptom

Alone in a channel, play an uploaded track. The transport runs — the position
advances, pause and play both work, the server says `playing` — and **no sound
comes out of the phone.** Stepping out and back in did not fix it. Force-quitting
did not. Only stepping into a *new* channel did.

It never happened when somebody else was in the channel, which is the fact that
turned out to contain the answer and was read as company for a fortnight.

## What it was: the microphone, not the category and not the room

**A receiver renders for as long as this device's own microphone is held open,
and stops when the engine is restarted underneath it while the microphone is
released.** Isolated 2026-09-05 with a second person on build 142 — the first
claim in the whole investigation that rested on holding a variable fixed rather
than on a correlation.

| state | category | microphone | result |
| --- | --- | --- | --- |
| `released IDLE` | `playback` | released | frozen |
| `released CALL` | `playAndRecord` | released | **frozen** |
| `capturing CALL` | `playAndRecord` | open | renders |

**`released CALL` is the row that settles it**, and it is the row no earlier run
had: the category held constant at `playAndRecord` and the fault happened
anyway. The category varies and the outcome does not; the microphone varies and
the outcome follows it. That is why the fault was only ever reported when alone
— alone, nobody speaks, the microphone is released, the engine restarts with
`rec=F`, and the pump plays to a device that will not render it.

**A held microphone is enough; it need not be capturing.** `holdMicrophone`
keeps the device without transmitting, because `stopMicTrackOnMute` is false.
That is what made the fix cheap enough to ship.

**There are two ways into the fault and they needed different fixes.** The
freeze above has no connect in it at all. The other arm does: **a track already
published when the room connects is subscribed before playout is ready and never
renders; a track that arrives afterwards renders normally.** That one was given a
controlled test on build 94 and a second on 2026-09-05 — two connections to the
same channel a minute apart, `0 audio already published` rendering and `1 audio
already published` freezing within eight seconds. It accounts for every
otherwise-stubborn fact: only a *new* channel restored audio because a new
channel has no track, so the media participant joins after you do; re-entry,
stepping back in and rebuilding the room all fail because all three arrive at a
room where the participant is already sitting.

Neither fix reaches the other's arm. A hold cannot help a connection that has
never published a microphone, and reordering a subscription cannot help a freeze
with no subscription in it.

## What was built

1. **The hold.** `holdForPlayout` in `app/src/audio/useSessionAudio.ts` keeps the
   microphone device open, muted, for as long as a track is subscribed. Scoped to
   a subscribed track rather than to being in a channel, so an idle channel still
   releases the device.
2. **The deferred subscribe.** Connect with `autoSubscribe: false` and subscribe
   once the session is known to be active, rather than letting the subscription
   land on the same tick as the socket. `deferSubscribe`, same file.

**The cost is chosen and is real: HFP rather than A2DP for media playback under
all conditions.** Holding the device means `playAndRecord`, which on a Bluetooth
headset means the mono two-way profile — mono, 16kHz, with `videoChat`'s echo
canceller on the music — and a lit microphone indicator for as long as anything
is subscribed. For the one feature where somebody is listening to music rather
than to a voice, that is a worse product than the one on paper and a far better
one than silence. It also spends the stereo bloom that `STATES.md` § *Audio
Session Configuration* makes carry the meaning *nobody's microphone is open*.

## The standing rule, which outlives the fix

**Do not wire the freeze detector to any recovery that stops the engine.** That
covers `reconnect()` and the subscription rebind both, and it is the rule
`app/src/audio/rebind.ts` and `app/src/audio/playout.ts` cite.

The reason is that every such recovery *re-enters the failing state*. A rebuild
reconnects into a channel whose media participant is already sitting there, which
is the arm that has never once rendered. Dropping the only remote subscription
stops the engine outright, and alone the retake restarts it with `rec=F`, which
is the state that renders nothing. **The repair reconstructs the fault.**

`app/src/audio/playout.ts` is therefore log-only on purpose. It was built as a
detector and shipped without an action, and that decision is the only reason the
connect-ordering arm was found by reading a log rather than by a reconnect loop
running in other people's conversations.

## Retired: rebinding the subscription

`audio/rebind.ts` shipped 2026-09-04 to test the idea that a receiver binds to
the playout instance that is live when it attaches, so a fresh receiver would
have nothing stale to be bound to. It was tried three times that evening — twice
automatically, once by hand — and every attempt reached the SFU, produced a
`sub -` and a matching `sub +` about 350ms later, and left the track silent. It
could not have worked, for the reason above.

**The call, the panel button and the bounds are left in place** — they are the
apparatus that produced the reading — but the automatic half is hard `false` in
`App.tsx` rather than `app.debug`. Do not turn it back on.

## The diagnostic was the first bug

The originally reported symptom — walk to Home, come back, silence — was the
diagnostic panel reading the audio engine.

`AudioDebugPanel` took a reading in a lazy `useState` initializer, which runs on
**every mount**, and the panel mounts with `ChannelView`. So returning to the
channel screen read the engine, and reading the engine stops it. Confirmed by
setting `debug = 0`, which removes the panel from the tree entirely: the Home
round trip stopped failing. Since build 89 the panel reads nothing until *Read
now* is pressed, and two tests pin the absence of a reading — a thing a test can
see and a person cannot.

`engineState.ts` claimed of its readers that *"a snapshot costs nothing… not a
theory about what moves, but a reading of what is."* **That claim is false**, and
it was the licence for polling nine ADM properties once a second.
`RTCAudioDeviceModule.h` marks five of the six engine flags *"For testing
purposes"*, which is not a promise of safety under a poll. Which of the nine is
destructive is still not known and is bisectable by ear with
`app/src/audio/probe.ts`, which has never been run to completion.

## Three retractions, kept because the shapes recur

**`IDLE` → `LISTENING` does not stop the engine.** Cleared, un-cleared, then
cleared again. The clearing rested on there being no `engine stop` after the
category write — but the kill was *silent*, audio heard and lost with no stop
event near it, because the delegate reports stops the ADM initiates and a session
reconfigured underneath a running engine is not one of those. **Absence of an
event is not evidence when the mechanism does not produce that event.**

**`audible 0` did not mean "not subscribed".** The panel's row was
`asked.othersAudible`, recorded when the session was last *written*. Build 90
made both closed states identical, so a subscription stopped writing the session,
so the field froze at its connect value of zero. A whole diagnosis of "lost
subscription" was built on it.

**`settleEmpty` was not the explanation for step-out/step-in.** It does pause
playback when the last person leaves, deliberately — but a paused transport reads
*paused* and freezes its position, and the reported transport was advancing.

**The lesson that generalises**, and it caught the same person twice in one day:
*a change that removes a write can remove an observation.* Build 90 collapsed two
audio-session states to stop a write racing the engine, and silently deleted both
the log line and the panel field that reported subscriptions.

**And one about method.** Three hypotheses died here of being plausible, and the
one that held was the first to hold a variable fixed. Two phones produced
`released CALL` in ninety seconds after three builds of single-armed tests had
not. **Reach for the second person earlier.**

## Two states in this write-up no longer exist

`IDLE` and the build-90 collapse are all over the reasoning above and are
history. `session.ts` deleted `IDLE` on 2026-09-08 and restored `LISTENING` —
for interrupting other apps, which is now the intent rather than the defect.
A reader who finds "the third state" here or in any document of this period
should check which one it means.

## The instruments, which stay

**The log ships to the server**, which is the important one: it survives a
force-quit and needs nobody to copy anything.

    ssh -i ~/.ssh/lightsail-ubuntu ubuntu@44.241.121.49 \
      'journalctl -u thefloor --since today' | grep "audio diagnostics"

Each line is JSON with a `lines` array of `{at, text}`. `POST /diagnostics`,
gated on the `debug` column, batched every thirty seconds and on backgrounding,
written to the journal rather than a table — the route's own comment says why.

| line | meaning |
| --- | --- |
| `room connected, N audio already published` | the connect-ordering variable |
| `engine start play=T rec=F` | playout enabled, microphone released — the state that renders nothing |
| `sub +` / `sub -` | a subscription arriving or going |
| `playout frozen Ns` / `playout resumed after Ns` | the per-track freeze detector |

| | |
| --- | --- |
| the session's states | `app/src/audio/session.ts` |
| connection, subscription, the hold, the log lines | `app/src/audio/useSessionAudio.ts` |
| the freeze detector | `app/src/audio/playout.ts` |
| shipping the log off the phone | `app/src/audio/shipping.ts` |
| the panel, which reads only on demand | `app/src/ui/AudioDebugPanel.tsx` |
| the ADM readers, and the warning on them | `app/src/audio/engineState.ts` |
| the unrun bisection | `app/src/audio/probe.ts` |
| the retired rebind | `app/src/audio/rebind.ts` |
| the server-side pump and its heartbeat | `server/src/playback.ts` |

Related: `POSTMORTEM-echo.md` (the audio session's three writers), `STATES.md`
disagreements 1, 4, 5, 8 and 11, and `decisions/` § *A channel that cannot be
heard, and nothing that could tell* — the server-side half, which was a real
defect and not this bug.

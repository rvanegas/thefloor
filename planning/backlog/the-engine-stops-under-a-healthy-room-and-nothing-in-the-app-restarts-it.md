# The engine stops under a healthy room, and nothing in the app restarts it

**The open half of TASKS § *Stepping Back In*, which is why that entry has gone
from TASKS and this is here instead.** The server half shipped on 2026-08-24 —
decisions/ § *A channel that cannot be heard, and nothing that
could tell* — and the bisection it existed to run came back within the hour,
against build 87, pointing at the phone.

**What the reading says**, taken from the panel with the audio dead and the
transport still running:

    asked           LISTENING playback/spokenAudio
    actual          playback/spokenAudio
    run/rec/play    F F T
    audible         1
    out             Speaker(Speaker)
    other playing   F

Everything is right except the one thing that makes noise. The session is
exactly what was asked for, so this is **not** the asked-versus-actual bug class
the panel was built for. The track is subscribed, the route is the speaker, the
output is available, and no other app holds the session. `engineRunning` is
false while `playing` is true: playout is enabled and the engine that would
render it is stopped. Server-side at the same moment the media participant was
publishing an unmuted track into a room the phone was active in, and no
`playbackStalled` line was ever logged.

**What is structurally wrong regardless of what stops the engine.**
`AudioSession.startAudioSession()` is called in exactly one place — inside the
connect effect in `useSessionAudio`, once per connection — and nothing else in
the app ever re-activates the session. The foreground listener that would
rebuild the room opens with `if (state.status === 'connected' || …) return`. So
when the engine dies under a *healthy* room, the socket is fine, `status` stays
`connected`, `Disconnected` never fires, and the one mechanism that could
restore sound is gated on the room being broken. There is no path back.

That is the same shape as the server fault it was mistaken for — state
perfectly correct, the thing that makes noise stopped, nothing measuring it.

**It does not, however, explain why only a new channel helps, and the
explanation first written here was wrong.** It said that only a changing
`mediaRoom` re-runs the connect effect. Stepping out makes `live` null, which
makes `mediaRoom` null, which is a dependency of that effect — so stepping out
tears the connection down and stepping back in rebuilds it, `startAudioSession()`
and all. A re-entry is *not* distinguishable from a new channel by that
mechanism, and any reasoning resting on it starts from a false premise.

What does differ between the two is **when the `LISTENING` edge lands relative
to activation**, and that is a hypothesis rather than a finding. Re-entering a
channel that already has a track means the media participant is already in the
room, so its track subscribes almost immediately after `connect` and the
category write lands on top of `startAudioSession()`. A brand-new channel has
nothing loaded, so the session sits in `IDLE` for as long as it takes to upload
and the same write lands seconds later, well clear of activation. The engine
transition log is what would confirm or kill it.

**Others present and it does not happen at all** — reported 2026-08-24, and
the sharpest narrowing yet. With somebody else in the room, stepping out and
back in leaves the audio playing. `core/micNeeded.ts` is what makes that a
statement about the audio session rather than about company: another occupant
makes `microphoneNeeded` and `anyMicrophoneOpen` both true, so the intent is
`capturing` and the session is `CALL` — `playAndRecord`/`videoChat`. Alone,
both are false, the intent is `released`, and the session is `LISTENING` —
`playback`/`spokenAudio`.

So **the fault is confined to the playout-only session.** Every reproduction has
been in `playback`; no reproduction has been in `playAndRecord`. That is
consistent with a playout-only engine being the thing that stops, and it is
consistent with the `IDLE` → `LISTENING` edge being what stops it, since that
edge exists only in the alone case. It does not separate those two.

**Build 88's log answered it on 2026-08-24, and the answer was not the
suspect.** Two results, and the first is a clean negative.

**The `IDLE` → `LISTENING` write does not stop the engine.** Four occurrences in
one session, and the event after it is never a stop — it is `screen home`, `app
inactive`, an `engine start`, and the end of the log. Every stop in that session
is accounted for by something else: a connection being torn down, the
transition to and from `CALL`, or the app being backgrounded. So the edge this
was pinned on for a day is cleared, and the fallback written against it in the
entry above would have fixed nothing.

**What fails is the playout-only engine start.** `willStartEngine` fires with
`play=T rec=F` at 12:22:29.501, **no stop ever follows it**, and six seconds
later the panel reads `run/rec/play F F T` — playout enabled, engine not
running. `willStartEngine` is a *will*: it announces an attempt, so a start that
fails leaves exactly this, an announcement with no engine and nothing to report
stopping. The one start in the session that carried `rec=T` — 12:15:03.704, the
`CALL` case, somebody else in the room — is the configuration that works.

That lines up with everything else: the failure is in `playback`, the working
case is `playAndRecord`, and the difference between them at the engine is
whether recording is enabled.

### The instrument was the fault

**Reported 2026-08-24, from a device, and it reframes every reading above.**
After a reinstall the audio played; the panel was opened; *the audio cut
immediately*. The panel's only job is to read the audio stack, and reading it
is what stops it.

It read in two places, and the first is the one that matters:

    const [reading, setReading] = useState(() => readDiagnostic(asked));  // on mount
    useEffect(() => { … poll once a second while open … }, [open]);

A lazy `useState` initializer **runs on every mount, expanded or not**, and the
panel mounts with `ChannelView`. So entering the channel screen took a reading.
That is the original symptom exactly: walk to Home, come back, silence.

It accounts for all of it, including the parts nothing else could:

| symptom | why |
| --- | --- |
| Home → back kills it | `ChannelView` remounts, panel remounts, one read |
| force-quitting does not help | relaunch, enter, panel mounts, reads again |
| **only a new channel restores it** | on entry nothing is loaded, so the mount read hits an idle engine harmlessly; you upload, play, the engine starts — and nothing reads again until you leave and return |
| others present is fine | that is `playAndRecord`, which survives the read |
| stepping out and back in does not restore it | it does rebuild — and an open panel's poll kills it again within the second |

`engineState.ts` says of its readers: *"a snapshot costs nothing… not a theory
about what moves, but a reading of what is."* **That claim is false**, and it
was the licence for polling nine ADM properties from the JS thread once a
second. `RTCAudioDeviceModule.h` marks five of the six engine flags *"For
testing purposes"*, which is not a promise of safety under a poll.

**Which of the nine cannot be reasoned out.** They are properties on a prebuilt
`RTCAudioDeviceModule` and LiveKit's WebRTC fork is not a public repository —
only the header ships. So it is measured, which is where `audio/probe.ts` comes
in.

### What build 89 carries

**The panel no longer reads anything on its own.** No mount read, no poll; one
press of *Read now* is one pass. *Copy all as text* copies the last reading
rather than silently taking a new one. Two tests pin the absence of a reading,
which is a thing a test can see and a person cannot.

**A bisection harness**, ordered by suspicion, one native call per button, with
a log line either side: `engineAvailability` (a computed struct, likeliest to
query the engine), `isEngineRunning`, `recordingAlwaysPrepared` (whose *setter*
rebuilds the input path), `voiceProcessingEnabled` (documented as live OS
readback), `voiceProcessingBypassed` (declared `assign`, not `readonly`), then
the remaining four, then `routeSnapshot` as a control that touches
`AVAudioSession` and never the ADM. Group buttons halve the list, because each
hit costs re-establishing audio.

**Two ways back from a dead engine**, because the alternative was reinstalling
the app between iterations: *Restart audio session* (`stopAudioSession` then
`startAudioSession` — also the fallback this file has carried unadopted for a
week) and *Rebuild the room* (`SessionAudio.reconnect`, the same generation bump
the backoff uses).

### The protocol, and the second axis

Alone, fresh track, audible. Press one probe. **The ear is ground truth** —
every API that could confirm it is itself a suspect. If the sound stops, that
call is the fault; confirm twice.

Then force `CALL` while still alone by **starting a recording** —
`microphoneNeeded` is true whenever a recording is active — and re-run the
culprit. If it does not kill there, the fault is specific to the playout-only
engine, which is what the others-present data point already suggests.

### Confirmed with the panel removed, and the leftover is not a fault

`debug` was set to 0 on 2026-08-24, which takes the panel out of the tree
entirely. The recipe was then run again:

- **Home and back into the channel no longer cuts the audio.** That is the
  symptom TASKS § *Stepping Back In* was written about, and it is gone the
  moment the reader is gone. **The panel was that bug.** No ordinary user was
  ever affected, because nobody without the `debug` column renders it.
- **Stepping out and back in still stops the sound** — and that one is
  `settleEmpty` in `core/channel.ts`, which is deliberate. Stepping out while
  alone empties the channel, an empty channel pauses playback, and *nothing
  resumes on the way back in*: the reducer does not record why playback paused,
  and a channel that starts making noise at whoever walks in is worse than a
  press of Play. The comment on that function has said so since it was written.

**And the transport reads *playing*, with the time advancing** — reported
immediately after the above, which **rules the `settleEmpty` explanation out**.
`playbackPositionMs` returns the banked position the moment status leaves
`playing`, and `pause` nulls `startedAt`, so a time display that advances means
the server state genuinely says playing. An emptied channel would read paused
and frozen. Whatever is cutting the sound here, it is not the designed pause.

**Answered the same hour: it read paused, Play was pressed, and then the time
advanced with no sound.** So the empty-channel pause worked exactly as designed,
and what is left is the real fault:

> **A playout-only engine does not survive a teardown and rebuild.** Step out,
> step back in, press Play: the server plays, the pump produces frames, LiveKit
> carries them into a room the phone is active in, and the phone is silent.

Stepping out tears the connection down — `room.disconnect()` and
`AudioSession.stopAudioSession()` — and stepping back in builds a fresh one,
`startAudioSession()` included. Something in that cycle leaves nothing
rendering. It has nothing to do with the panel: this was reproduced with
`debug` at 0 and no panel in the tree at all.

**This is a symptom this codebase has already met once, from the other side.**
`c2f5039`, 2026-08-11, explaining why `startAudioSession()` is called
explicitly rather than left to the SDK: *"after a party left and rejoined, the
other side's playback never resumed: subscribed to the new track, reporting
healthy, and silent."* The explicit activation fixed it for the `CALL` case.
The alone case is `playback`, and there the same activation is evidently not
enough — which fits every other narrowing in this entry, all of which say the
fault lives in the playout-only session.

### The recovery buttons answered it, and reopened the suspect I had cleared

Build 89, 2026-08-24. *Restart audio session* — `stopAudioSession()` then
`startAudioSession()` — took **31ms, produced no engine events at all, and no
sound**. So re-activating the session does not revive a dead playout engine, and
the fallback this file has carried unadopted for a week would not have worked.

*Rebuild the room* did restart the engine, and **produced a fraction of a second
of audio before going silent again**. That fraction is the finding. Lining the
two events up at every connect in the session:

| connect | which came first | the other, after |
| --- | --- | --- |
| 20:17:32 | `released LISTENING` | engine start +12.2s |
| 20:17:58 | `released LISTENING` | engine start +9ms |
| 20:20:18 | `released LISTENING` | engine start +16.0s |
| 20:21:17 | `released LISTENING` | engine start +21ms |
| **20:23:10** | **engine start** | **`released LISTENING` +1ms** |

The rebuild is the one connect in the whole session where the engine started
*before* the category write — and it is the only one where anything was heard.
It played until the write landed and then stopped.

**So the `IDLE` → `LISTENING` write is the suspect again, and the reason I
cleared it was a mistake.** The clearing rested on there being no `engine stop`
after the write, in four places. But the rebuild proves the kill is *silent*:
audio was heard and then lost with no stop event anywhere near it. The delegate
reports stops the ADM initiates; a session reconfigured underneath a running
engine is not one of those. **I required an event that this mechanism does not
produce, and read its absence as evidence.** That is the exact failure this
subsystem's instruments were built against, committed by the person reading
them.

Both orderings then say the same thing. Write first, engine starts after:
nothing is ever heard. Engine starts first, write lands 1ms later: a fraction of
a second, then nothing. The write and the engine start interfere, and which one
loses depends only on which got there first.

### What to build next, and it is an experiment that doubles as the fix

**Stop making the transition at all while the microphone is closed.** Have
`sessionFor` return one configuration for both closed states, so `IDLE` and
`LISTENING` stop being two things and the only remaining category change is the
one at the microphone boundary — which is `CALL`, and which demonstrably works.

It is a fix and a measurement in the same change: if audio then plays and keeps
playing, the transition was the whole of it. If it still dies, the write is
exonerated and what is left is the engine start itself.

**What it costs is real and should be stated.** `e3991fe` added `LISTENING` so
that shared playback interrupts another app's audio rather than mixing with it
— *"Other Audio Output"*, a deliberate feature. Collapsing the two closed states
gives that up: a podcast would play on underneath a shared track. That is a
worse product than the one on paper and a better one than the one that exists,
where the shared track cannot be heard at all. **And the entry above this one
says the feature was never confirmed to work on a device anyway.**

Do not reach for `stopAudioSession`/`startAudioSession` bracketing, which is
what this file recommended for a week: the *Restart audio session* result is
direct evidence that it does not bring a playout engine back.

**Built as build 90.** `EXCLUSIVE_WHEN_AUDIBLE` in `app/src/audio/session.ts`,
off, one word to reverse. `IDLE` survives rather than `LISTENING` and that is
the point of the change rather than a taste: `IDLE` is what the connect path
applies *before* `startAudioSession`, so the session is configured once, before
anything is active, and never written again until a microphone opens. Keeping
`LISTENING` would have left a write landing exactly when a track subscribes,
which is when the engine starts — the collision being removed.

**What to look for.** Alone, fresh track, press Play: does the sound arrive, and
does it stay through a step out and back in, and through Home and back? If it
holds, the distinction was not worth what it cost and `LISTENING` should be
deleted along with the flag. If it still dies, the write is exonerated, the flag
goes back on, and what is left is the engine start itself — at which point the
next question is what a *new channel* does that a rebuilt room does not, since a
new channel is the only thing that has ever restored audio.

**Also worth one listen on the way past:** whether another app's audio now plays
on underneath a shared track. That is the feature being spent, and nobody has
ever confirmed it worked. It doubles as proof the flag took effect at all: if a
podcast is still interrupted, the build under test is not build 90.

### Build 90 made it rare rather than gone

Reported 2026-08-24: the failure was seen once, and then could not be
reproduced systematically. **That is a change of kind, and it is evidence
rather than a fix.** Before, it was deterministic — every walk to Home and
back, every step out and back in. A cause that was removed and left the
symptom occasional was a real cause; a symptom that survives at all means it
was not the only one.

**What is left that can still write the session at an engine transition, and it
is the one writer this app does not control.** `setupIOSAudioManagement`
installs the SDK's native policy observer, which applies its playout
configuration *from inside the engine transition itself*, on the audio thread,
with no JavaScript in the path. It is handed `policyFor(...)`, so it now writes
`IDLE` — the same value already in force — but a write of the same value is
still a write, and the collision this entry is about was a write landing on a
starting engine. Nothing in JS can observe it: the two delegate slots that
would see it are the two that *replace* the policy when a handler is
registered, which is forbidden for the reason `engineState.ts` gives.

So the next suspect cannot be watched, only removed — and removing it means
`setupIOSAudioManagement(false, …)`, which also gives up the SDK's activation
handling. That is a bigger change than build 90 and should not be made on the
strength of one unreproduced failure.

### `audible 0` was an artefact, and the entry below it is wrong

**Retracted 2026-08-24 the same evening it was written.** The panel's `audible`
row is `asked.othersAudible` — the count recorded *the last time the session was
written* — and build 90 stopped the session being written when a track
subscribes, because both closed states now return the same configuration and the
effect returns early on an identity comparison. So `asked` freezes at connect,
where `othersAudible` is zero by construction, and the row reads 0 for ever
after however many tracks arrive.

Build 91's own log proves it in the same reading: `sub + media:chan_uM63vyGruvbO
(1)` at 21:44:29.244, **no `sub -` anywhere**, and `audible 0` ten seconds later.
The client was subscribed the whole time.

**This is the same regression as the missing log line, and I drew a conclusion
from it before noticing that.** The lesson was already written down one section
below — *a change that removes a write can remove an observation* — and it was
applied to the log line and not to the field beside it. Both come from the same
early return. `asked` should be updated when `othersAudible` changes even where
the configuration does not, which is a fix build 92 should carry so the panel
stops asserting something false.

So the fault is **subscribed and silent**, which is the engine fault of every
earlier reading after all, and not a lost subscription.

### The old entry, retracted: `audible 0`

Caught 2026-08-24, 21:10, on build 90, with the panel open and reading nothing.
`run/rec/play` reads `F F T` again — but **`audible 0`**, where every earlier
reading said 1. The client was not subscribed to anything.

The server was fine throughout, and this is checkable rather than inferred:
`media:chan_f8kjILkZrQ_X` joined the room at 21:05:54, published its track, and
**never closed** — it was still there, unmuted, when the room was queried
afterwards. No `playbackStalled`, no media errors. So the phone sat in a room
with an unmuted audio track in it and was subscribed to none of it.

**An engine that is not running is then correct rather than faulty.** There is
nothing to render. Every earlier reading in this entry had `audible 1`, which
is what made "the engine died" the right reading of them; this one is a lost
subscription, and treating it as the same fault would be reasoning from a
symptom two mechanisms share.

Neither *Restart audio session* nor *Rebuild the room* recovered it, and the
server log says why the second could not: LiveKit answered the rebuilds with
`could not handle new participant` / *could not restart participant*, which is
what it says when an identity is already in the room and the resume is refused.
The rebuild was racing its own predecessor's teardown.

**Build 90 removed the instrument that would have dated this**, which is worth
stating as a lesson rather than a mishap. A subscription used to be legible by
accident: it moved `othersAudible` off zero, which moved the session from
`IDLE` to `LISTENING`, which was written and logged. Collapsing those two
states to stop the write racing the engine took the only evidence of a
subscription with it. **A change that removes a write can remove an
observation**, and nothing in the log said when the track went.

Build 91 restores it directly rather than by accident: `sub +`/`sub -` lines on
every subscribe and unsubscribe, and log lines for `Reconnecting`,
`SignalReconnecting`, `Reconnected` and `TrackSubscriptionFailed` — the states a
room passes through while reporting healthy. It also acknowledges every press
in the panel, because a probe that did nothing and a probe that never ran had
been indistinguishable to whoever was pressing them.

### A rebuild restores it, and that is the first recovery that has ever worked

Build 91, 21:44. Stepping out and back in produced the failure. **Restart audio
session did nothing; Rebuild the room brought the audio back.** Every previous
attempt at recovery had failed, including the one this file recommended for a
week.

That is enough to build a fix on **without knowing the mechanism**, and it is
the same shape as the server-side fix that opened this whole investigation: a
thing that stops being audible, a measurement that notices, and a correction
that rebuilds. The server got a heartbeat on the pump. The client needs one on
playout.

**And there is a non-destructive way to take it.** `RemoteAudioTrack.
getReceiverStats()` returns `totalSamplesDuration` — standard WebRTC
`inbound-rtp`, never the ADM, so unlike every reader in `engineState.ts` it
cannot be the thing that stops the audio. The ADM pulls 10ms frames from the
jitter buffer to render them; no pull, no samples counted. So the value
advancing means the client is rendering, and the value frozen while a track is
subscribed means it is not.

**Build 92 measures and does not act**, deliberately. It polls that on the
subscribed remote track every two seconds and logs a freeze once when it starts
and once when it ends. It does **not** call `reconnect()`, even though a rebuild
is known to restore the sound: what is not known is how often the counter
freezes *legitimately* — a backgrounded app renders nothing on purpose — and
acting on an untested detector would put a reconnect loop into other people's
conversations. The count comes first and the decision to act is made against it.

It also fixes the stale `asked`, since a panel reading `audible 0` through a
subscription that plainly happened is a diagnostic asserting something false,
and that cost a wrong diagnosis before the log line beside it gave it away.

### The log goes to the server, because a ring dies with the process

**The container was wrong and it took being said plainly.** The log was forty
lines in memory, then two hundred, copied out by hand — which is right for a
fault somebody is watching happen and useless for one that appears once in ten
minutes of stepping in and out. It does not survive a force-quit, a crash or an
app update, and those are the three things a person does when the audio has
stopped and they want it back. If the point is to collect and compare across
days, it cannot live inside the thing being debugged.

`POST /diagnostics` takes it, gated on the same `debug` column that gates the
panel producing the lines, and writes it to the journal:

    ssh … journalctl -u thefloor --since today | grep "audio diagnostics"

**The journal rather than a table**, which is a trade rather than laziness: a
table would be queryable and would also want a migration, a sweep, and a line in
`erase` so deleting an account takes its diagnostics with it — three standing
obligations for data whose value expires in a day. `journalctl` already rotates
and is already how every other question about this box is answered.

The client batches every thirty seconds and on the way to the background, keeps
what it could not send, and **drops what was refused** — a 403 is the ordinary
answer for every other account, and a batch that comes back after every attempt
is a loop that grows until the cap eats it.

**Deploy the server before the build**, which is the ordinary two-step: the
client is the new speaker here, so the endpoint has to exist before anything
calls it. Nothing breaks in the other order — an old server 404s and the client
treats that as worth retrying — but the lines would sit in the backlog until a
deploy caught up.

### The variable is probably *what was already there when we connected*

Build 92's first shipped run, 2026-08-24 22:15–22:18, eight connections. Read
honestly — three of them had no chance to report, because *Rebuild the room* was
pressed every seven or eight seconds and the freeze detector needs about eight —
it comes to this:

| connect | connect → engine start | outcome |
| --- | --- | --- |
| 22:16:03 | **16.81s** | **rendered**, 31-second window |
| 22:16:34 | 0.72s | froze |
| 22:17:33 | 0.51s | froze |
| 22:17:42 / 51 / 58 | ~0.5s | window too short to say |
| 22:18:06 | 0.46s | froze |
| 22:18:36 | 0.46s | froze |

**Every connection that had time to report froze, except the one that waited
seventeen seconds for its track.** And `connect released IDLE` is logged before
`startAudioSession` and before `room.connect`, so that gap spans activation,
connection and subscription — seventeen seconds means the media participant
*was not there yet*, and half a second means it was already publishing.

So the hypothesis is not about timing, which is only a proxy: **a track already
published when the room connects gets subscribed before playout is ready and
never renders; a track that arrives afterwards renders normally.**

It accounts for every stubborn fact in this entry. Only a *new* channel restores
audio — a new channel has no track, so the media participant joins after you do.
Re-entry, stepping back in and rebuilding all fail — all three arrive at a room
where the participant is already sitting. And **rebuilding stopped working**,
reported the same evening: a rebuild is the immediate-subscribe case by
construction, so the one time it worked was luck rather than mechanism.

**That retracts the fix this file was about to recommend.** Wiring the freeze
detector to `reconnect()` would have made the app respond to the fault by
re-entering the case that causes it. Build 92 shipping the detector without the
action is the only reason that was found out by reading a log rather than by
shipping a reconnect loop into other people's conversations.

**Build 93 measures the variable itself** rather than the proxy: `room
connected, N audio already published`, counted at the instant `connect` resolves
and before anything subscribes. With it come the two lines that would have
explained a `connect` appearing from nowhere — `room disconnected (reason)` and
`foreground rebuild (was …)` — plus the backoff's own line, since a rebuild has
two causes and neither wrote anything down.

**If it holds, the fix is an ordering this app has never tried**: connect with
`autoSubscribe: false` and subscribe once the session is known to be active,
rather than letting the subscription land on the same tick as the socket.

**What is needed first is the log from a failure**, which is now worth having
in a way it was not before: the panel reads nothing on its own, engine
transitions are stamped, and the screen markers are there. When it next fails,
**copy the diagnostics before touching anything** — the ring is forty entries
and it survives everything but a force-quit. Two things to check on that paste:
the header says `build 90` (a failure on 89 would explain itself), and where
the `engine start` falls relative to everything around it.

### What survives either way

**Build 89's panel fix stands regardless.** Reading the audio engine stops it —
that is now established by ear, twice, and it is not conditional on what else
was going on. An instrument that has to be kept away from the thing it measures
is still worth having, and the one that reads only when asked is the version
that can be trusted.

The **bisection is no longer urgent, and is still worth running** — knowing
which of the nine is destructive is what would let the panel read the other
eight safely, and this is the only debugging surface this subsystem has.

The **recovery** — notice a dead engine under a live room and re-activate — was
written off here an hour before the reading above arrived, on the grounds that
the fault had turned out to be self-inflicted. That was too quick. If reading 2
holds, an engine does die on its own across a teardown and rebuild, and the
recovery is exactly the fix. Build it on the strength of that reading and not
before.

**Build 88 was instrument-only and that is what made the negative worth
having.** It logs engine transitions — `willStartEngine` and `didStopEngine`,
the two delegate slots the SDK's own policy does not use — and stamps which
screen you are on. Had it carried the fallback as well, the fallback would have
shipped, the symptom would have been unchanged, and the day would have ended
with a fourth mechanism eliminated by guesswork instead of a suspect eliminated
by evidence.

The recovery half — notice a dead engine under a live room and re-activate —
still holds whatever the cause turns out to be, because it is driven by a
measurement rather than by a theory about the cause. It is the one part of this
worth building before the mechanism is known, and it is what build 89 should
carry if the reading above confirms the engine is genuinely stopped.

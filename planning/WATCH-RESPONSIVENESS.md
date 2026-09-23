# Why the watch transport sticks, and how to find out

**Temporary.** This is a live investigation: it says what was measured, what is
still a guess, and what each outcome licenses next. When it resolves, whatever
survives moves to `decisions/` and this file goes.

The complaint, 2026-09-22: *play/pause on the watch player is flaky; after
repeated use the player gets stuck and will not resume from a pause, and
rotating to full screen unsticks it — as does rotating back when it sticks in
full screen.*

## The clue is the cure

Rotating is the one gesture in the application that **builds a fresh player**.
A handheld may turn only at the film (`watch/orientation.ts`); turning it
mounts `FullScreen`, which mounts its own `WatchPlayer` while `Picture` stands
down, and turning back reverses that. Either way the `WebView` is new.

So the channel state is not the stuck part, and neither is the transport, the
server or `core/watch.ts` — all of those survive a rotation unchanged. What is
stuck is the mounted player or the channel to it. That narrows a vague
complaint to four candidates, and it is why this was worth instrumenting rather
than guessing at.

## The four candidates

1. **The iOS audio session interrupts WebKit's media session.** The leading
   one. `isScreening` in `core/micNeeded.ts` closes this device's microphone
   while a party plays and opens it again when it pauses — its own comment
   names the price as *a profile handover at every pause*. Follow it through
   `app/App.tsx:183` → `micNeeded` → `wantFor` → `sessionFor`: **every play and
   every pause rewrites the process-wide `AVAudioSession` category**, `CALL`
   (`playAndRecord`/`videoChat`) ⇄ `LISTENING` (`playback`/`spokenAudio`), and
   on a Bluetooth route that is an A2DP↔HFP handover taking a second or more.
   The `WKWebView` showing the film rides the same session. A category change
   under it reaches WebKit as a media interruption, which pauses the element
   and latches it; `playVideo()` on a latched media session does nothing, and
   the latch lifts on an interruption-*ended* that may never arrive when the
   interruption was caused from inside the same process. A new `WKWebView`
   gets a new media session, which is exactly the rotation cure.

   This also explains the parts a simpler story does not: why it is *resume*
   that sticks (that is the transition that both needs the session granted and
   closes the microphone), why it is intermittent (the follower fires blind
   into a session that is mid-move), and why it worsens with use.

2. **The content process was taken.** iOS kills a `WKWebView`'s content
   process under memory pressure; the view keeps its last frame, no error is
   raised, and every command evaluated into it succeeds at doing nothing. A
   long party with a video embed is a plausible victim. Handled as of this
   branch, and distinguishable in the log.

3. **Low Power Mode**, which blocks playback without a user gesture whatever
   `mediaPlaybackRequiresUserAction` says. Fits *after repeated use* by way of
   the battery — but a rotation would not cure it, so probably not this.

4. **A top-frame navigation.** `onShouldStartLoadWithRequest` permits
   `PAGE_ORIGIN` and `about:blank`; if the document ever actually goes there
   the listener is gone and commands land in a page with no handler. Unlikely
   with pointer events off, but it is a live path.

## What was built, and why each half is both cure and probe

Everything here is local to the app: no wire change, no deploy ordering, and
nothing in `core/`.

- **The follower is woken by the press** (`watch/drive.ts`). Its loop was keyed
  on the interval alone, so every play and pause carried up to a
  `FOLLOW_TICK_MS` window on top of the round trip for no reason. This is the
  responsiveness half and is worth having whatever the rest turns out to be.
- **A reading has an age** (`watch/WatchPlayer.tsx`). It used to be cleared
  only when the film changed, so a page that stopped reporting left the
  follower reasoning about a corpse — and a corpse says `paused`, which is a
  state a follower will happily believe it has arrived at.
- **A player that hears and does not act is rebuilt**, after three ignored
  instructions (`DEAF_AFTER`). A stalling player cannot reach this, because
  `followInstructions` says nothing at all while a buffer fills.
- **A page that has stopped talking is rebuilt**, after `SILENT_FOR_MS`, and a
  terminated content process at once. Rationed by a cooldown, and never while
  the film is refused.
- **The whole path writes to the audio log** — `recordEvent`, the same ring
  that ships to the journal via `POST /diagnostics`. The watch lines and the
  audio session's lines interleave, **and that interleaving is the
  measurement.**

## Reading the log

Every line below is new. They are quiet on a healthy party: nothing is said to
a player that is where it should be.

| Line | What it means |
| --- | --- |
| `watch press play` / `pause` | A finger, timestamped. `(not sent)` means the socket did not write it — see backlog § *A channel action that never lands*. |
| `watch tell play+seek (player … want …)` | The follower issuing instructions, with both sides of the disagreement. |
| `watch playing after 820ms` | How long the player took to obey. **This is the number the exercise is about.** |
| `watch ignored play x2 (player paused)` | An instruction spent and not acted on. |
| `watch rebuilding the player` | Three of those: the rotation cure, automated. |
| `watch player silent for 7s` | The page stopped reporting. |
| `watch player process gone` | iOS took the content process. |
| `watch player refused (150)` | YouTube's own refusal. Not our bug. |

And the ones that were already there: `capturing CALL`, `released LISTENING`,
`route …` with iOS's own reason code, `app active`.

**The decision table**, once a stick has been captured:

- `watch tell play` repeatedly, readings still flowing, **and a session or
  route line in the same second or two** → candidate 1. The cure is to stop
  the transport moving the category, or to sequence the two.
- `watch player silent` or `process gone` → candidate 2. Already cured by the
  rebuild; the log says how often it was needed.
- `watch press play (not sent)` and no `watch tell` at all → not the player.
  The socket dropped it, and the fix is the acknowledgement in the backlog.
- `watch playing after …` consistently large with nothing else odd → ordinary
  latency, and the answer is a local echo of the press rather than a watchdog.

## What the first log said — build 276, 2026-09-23

**Candidate 1 is confirmed, with timestamps.** 93 lines off the phone, on the
built-in speaker. Both resumes in the run look like this:

```
+41.81  watch press play
+41.89  released LISTENING                       <- the session starts moving
+41.89  watch tell play                          <- the same millisecond
+42.74  route ... why=routeConfigurationChange
+42.90  route ... Playback/SpokenAudio why=categoryChange   <- it finishes
+43.13  watch playing after 1241ms               <- the film starts, 230ms later
```

The play command and the category change are issued **in the same
millisecond**, and the player does not start until the category change has
completed. The other resume in the run is the same shape: told at +57.61,
category change lands at +58.67, playing at +59.17 — 1560ms.

**The asymmetry is the proof.** Pausing took **106ms and 379ms**, and finished
*before* the session had moved at all. Resuming took **1241ms and 1560ms**, and
finished *after* the session had finished moving. Pausing does not need the
media session; starting playback does, and it is held off for exactly as long
as the category takes to change.

Two things follow that were not obvious beforehand:

- **It is not the Bluetooth handover.** This run is on `Speaker(Speaker)`
  throughout, and the gate is still 1.2–1.6s. The profile handover would be
  *additional*, so a Bluetooth route should be worse, not the cause.
- **The gate pays for itself twice.** The transport's wall clock runs during
  those 1.2s, so the follower then owes a correction: every resume in the log
  is followed by `watch tell seek` and another 500–1000ms. Press to settled is
  nearer 2.5s than 1.2s.

For reference, a rotation — the cure that prompted all this — costs 1.0–1.5s
to get playing again, which is the price of a fresh player.

**Still outstanding: no permanent stick was captured.** Everything above is the
gate in its ordinary, recoverable form. Whether the hard stick is the same
mechanism latched — WebKit marking the media session interrupted and never
seeing the end of it — is untested, and the thing to watch for now is a
`watch rebuilding the player` line, which is the watchdog curing one unaided.

### What it corrected in our own code

`watch ignored paused x1 (player unstarted)` at +9.87, and `x2 (player
buffering)` at +23.08 — on a party that was working perfectly. `hasArrived` is
false for both of those states, and neither is a refusal: a cued player has not
begun and a buffering one is on its way. Worse, the 1.2–1.6s gate above means a
routine resume regularly outlives the 1500ms obedience fuse, so resumes were
scoring against the count too. Three would have rebuilt a healthy picture in
front of somebody who had just pressed Play. Fixed: only a settled `playing` or
`paused` that contradicts the instruction counts.

## Expanding stopped rebuilding the player — 2026-09-23

The log measured the other thing rotation costs. Every `watch player ready`
in it is followed by `watch tell seek+play (player unstarted at 0s …)` and
then a second of catching up: **1517ms and 1001ms**, twice, because a turn of
the wrist tore one `WebView` down and built another.

That was never a necessity. `Dock` already moved the picture between docked
and floating by changing a style object, and says that being structural
rather than cosmetic is what reintroduces the reload. Full screen was the one
place still doing it structurally: `ChannelView` returned `FullScreen` with a
player of its own inside it, while `Picture` stood its own player down.

Full screen is a third `Place` now. The player is given the whole window and
never moves; `FullScreen` is the scrim alone, drawn by `Picture` over the
picture — it has to be, since nothing below the picture in the tree can be
painted above it. What the channel screen contributes is three booleans and a
way out, because an element cannot be handed to an ancestor.

**This removes the accidental cure, deliberately.** Rotating no longer hands
the `WebView` a fresh media session, so it will no longer unstick a latched
player — the watchdog does that now, on purpose and with a line in the log.
It also removes a confound: every rotation was silently resetting the thing
under investigation, so the stickiness that remains is now visible instead of
being healed behind a gesture nobody meant as a repair.

## The protocol

1. **Open the audio panel once** at the start of the session, on any channel.
   `startDiagnosticRecording` installs the route observer when the panel first
   mounts and never before — so a route change before that is simply not in
   the log. This is the step that is easy to skip and expensive to skip.
2. Start a party and use the transport normally until it sticks. Bluetooth if
   that is where it usually happens; it is worth doing a run on the speaker
   too, because *sticks on Bluetooth and not on the speaker* is on its own
   most of the way to candidate 1.
3. When it sticks, **note the wall-clock time** and whether the button label
   flipped — a label that did not flip is the socket, not the player.
4. Give it ten seconds before rotating. The rebuild should now cure it
   unaided, and whether it does is itself a result.
5. The log ships on its own every 30s to the journal for an account with
   `debug`. Copy it out of the panel as well if the app might be force-quit.

## What each outcome licenses

- **Candidate 1 confirmed.** Two cures, and they are a real trade rather than
  a tidy-up. *Sequence*: hold the `play` until the session has settled, which
  changes no behaviour and needs a signal out of `useSessionAudio`. *Hold*:
  stop flipping the category on the transport at all — keep one configuration
  for the party's length — which collides head-on with the mute following the
  transport, so that *pause, and everybody has their voice back* would have to
  give. There may be a middle: hold `playAndRecord` and mute the track rather
  than closing the device, which keeps the category still at the cost of the
  stereo `isScreening` was written to buy.
- **Candidate 2 confirmed.** Already cured. Worth knowing how often, since a
  content process taken every few minutes is a memory problem and not a
  watchdog's job.
- **Neither, and the presses are merely slow.** Echo the press into the local
  player at once and reconcile on the next snapshot. It does not reintroduce
  what `controls: 0` removed — the input is the press, not the player's bar.

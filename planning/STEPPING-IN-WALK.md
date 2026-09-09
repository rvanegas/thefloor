# Stepping in, and stepping in nearby: the walk

**Temporary.** The device walk for the 2026-09-08 redesign, written the day it
was built and before any of it had been heard. Delete it once the walk has been
done, folding what it found into
`decisions/2026-09-08-stepping-in-and-nearby.md` — which is the design, the
reasoning and the nine lab readings, and is what to read first if any step here
does not make sense.

**The suite is green and that is evidence about the reducer, the hook and the
socket. It is no evidence about what a phone does with an audio session.**
Everything below needs hardware, and about half of it needs two people.

---

## What is already settled, and by what

| | settled by |
| --- | --- |
| both core predicates, including the guest case | `core/__tests__/micNeeded.test.ts` |
| `DECLARE_NEARBY` from inside and outside a channel, and the clock | `core/__tests__/nearby.test.ts` |
| the arrival rule — arrivals, non-arrivals, the foreground, whose declaration, and that nothing enters the room | `app/src/state/__tests__/nearby.test.tsx` |
| the three configurations, and that nothing mixes | `app/src/audio/__tests__/session.test.ts` |
| `deactivateOnStop` reaching the observer | same file |
| the deferral, and the release firing on teardown | `app/src/audio/__tests__/backgroundCapture.test.tsx` |
| the action crossing the wire and landing in `waiting` | `server/__tests__/ws.test.ts` |

**What no test can settle**, and what this file is for: whether another app
actually stops and actually comes back, what a Bluetooth headset does at each
edge, whether a self-mute moves the route, and whether any of it survives
LiveKit. Three writers share the iOS audio session and the suite mocks all
three.

---

## Prerequisites

- **The server first.** `DECLARE_NEARBY` is a wire addition, and a client that
  sends it to a server that has never heard of it gets an error and stays
  standing where it was. Deploy `master` with this change on it, confirm with
  `bin/health`, and only then put a build on a phone. AGENTS.md § *Never ship a
  wire change to a server before the client can speak it*.
- **A debug account**, which is the `debug` column on the box. It gates the
  `AudioDebugPanel` at the foot of the channel screen and the shipping of the
  audio log to the server journal, and every "what settles it" below reads one
  or the other.
- **Labs on**, in Home settings → *Show experimental features*. It is
  account-scoped, so it follows to a second phone, which is right for this. Off
  is a test of its own — step 12.
- **A development or TestFlight build**, not the App Store one. `APNS_ENV` is
  the trap for step 9: a token from `expo run:ios` is only valid against
  `api.sandbox.push.apple.com`, and the deployed server defaults to
  `production`. Cross them and the notification simply never arrives, which
  looks exactly like the rule being wrong. See AGENTS.md.

## The rig

- **Phone A** — the one under test. Signed in on the debug account, Labs on.
- **Phone B** — a second account, in a channel with A. Any build.
- **A podcast**, or anything with a play button that is not this app. It is the
  instrument for every claim-and-release step, and it must be **playing** when
  the step starts.
- **A Bluetooth headset** for steps 3, 4 and 11. Rows 5–9 of the lab run were
  taken on `wachowskis`; anything that does HFP will do.
- **`journalctl -u thefloor -f`** on the box, which is where A's audio log
  lands about thirty seconds behind the event. `grep 'released\|arrival\|
  capturing\|LISTENING'` is most of what this walk cares about.

---

## The two with real risk, which is why they are first

### 1. The claim

**Alone, and it is the reversal.** Start the podcast. On A, step into a channel
with nobody in it.

**What settles it.** The podcast stops. Not ducks — stops. The panel's *asked*
row reads `CALL`, and *actual* agrees: `PlayAndRecord/VideoChat`. The log line
is `connect capturing CALL`.

**What a failure looks like.** The podcast carrying on is the old rule still in
force somewhere — check that `App.tsx` is passing `microphoneNeeded` rather
than something narrower. Ducking rather than stopping is `videoChat` doing what
row 3 of the lab measured and the *category* not being exclusive, which would
mean `mixWithOthers` has come back from somewhere.

### 2. The release, which is the half nothing in the SDK does

**Still in the channel from step 1**, with the podcast stopped. Step out.

**What settles it.** The podcast **resumes, by itself, at full rate.** The log
reads `released` and, in a debug build, the category it saw. Then repeat twice
more, because the three exits take different paths to the same teardown:

1. **Step out** — the tap.
2. **Nearby** — the Labs button in the *Step out* card. Same release, and the
   card must now read *Nearby*.
3. **Force-quit the app** while stepped in. The session dies with the process;
   nothing releases it and nothing has to.

**This is the step most likely to fail, and it is worth knowing why in
advance.** Neither `AudioSession.stopAudioSession` nor the SDK's observer
passes `notifyOthersOnDeactivation` — both are a bare `setActive(false)` — so
`releaseSession` in `app/modules/audio-route` was added to say it. But it runs
*after* the SDK has already deactivated, and iOS may treat a second
deactivation of an inactive session as a no-op and post nothing. **If the
podcast does not come back on its own, that is what happened**, and the fix is
ordering rather than the option: release before `stopAudioSession` rather than
after. Say so in the decision record either way — a confirmed *yes* is worth as
much here as a *no*, because the whole promise of being nearby is that it gives
somebody their audio back.

### 3. The route, at both edges

**On the headset**, with nothing else playing. Step in, then step out.

**What settles it.** In: the route goes to HFP in both directions, mono, and
the panel's sample rate drops to **24000** — not 16000, which older comments
say and which this device disproved. Out: back to A2DP at 48000. `onRouteChange`
should carry a reason for each crossing.

**Read the rate after the input is running, not at apply.** At 01:15:53 in the
lab the same configuration read 48000 at apply and 24000 a moment later; the
route settles asynchronously and the first number is not evidence.

---

## The gating question

### 4. Does a self-mute move the route?

**The one that decides the most**, and the one no bench in this repository can
answer, having no LiveKit in it. **Two phones and a mute.**

A and B both stepped in, on the headset, B talking continuously. A steady voice
is the instrument; silence measures nothing. On A: mute, wait ten seconds,
unmute. Twice.

**What settles it.** B's voice must not change in A's ears at either edge, and
`onRouteChange` must report **nothing**. A route line at a mute is the failure.

**Why it might.** If self-mute disables the *recording engine*, the SDK's native
policy observer sees playout-only and applies `LISTENING` — `playback`, a
category change, therefore a profile handover. That is the 2026-08-19 route loss
arriving from a new direction, and `holdForPlayout` may or may not be what
prevents it.

**If it does move**, the answer is not to re-introduce a mixing configuration.
It is that `holdForPlayout` stays and the reason it stays is now measured — at
which point remove the "inert, kept pending a device check" hedging in
`useSessionAudio` and say what it is really doing.

**If it does not move**, `holdForPlayout` can be deleted, and its parameter and
`App.tsx`'s positional `true` go with it.

---

## The offer

**Promotion was removed on 2026-09-08**, before any of this was run — a nearby
phone offers a step in rather than taking one. See
`decisions/2026-09-08-the-arrival-is-offered.md`. What was the riskiest step in
this walk is now the cheapest, and it is no longer an audio test at all.

### 5. Nearby, and somebody arrives

On A, with the channel screen open and the phone in your hand: tap **Step in
nearby** (or step in and then tap **Nearby**). Confirm the roster on B says A is
*Nearby*. Now B steps in.

**What settles it.**

1. A does **not** step in. Nothing about A's audio changes — a podcast keeps
   playing, a headset stays in stereo at 48000, and the log carries
   `nearby arrival offered` and no `capturing` line at all. **The absence is the
   assertion**, and it is the whole point of the reversal.
2. A card appears on A's screen naming B — *Dana stepped in.* — with **Step
   in** and **Stay nearby**.
3. **Step in** works from there: A becomes audible, B hears them, and A hears B.
   That is the ordinary claim, already tested as step 1, and what is being
   checked here is only that the button is wired to it.
4. **Stay nearby** puts the card away and leaves A nearby. B steps out and back
   in; the card comes back. An offer answered is not a declaration ended.

**What a failure looks like.** No card at all is the declaration not being this
device's (`nearbyIn`), or the channel screen not being open — the offer is drawn
on the screen of the channel declared in. A card naming somebody who has since
left is the roster filter not working; leave B stepped out for a moment and the
card should go by itself.

### 6. Somebody already there raises no offer

**The common case, not a corner.** B steps in first and starts talking. *Then*
A declares nearby.

**What settles it.** A stays nearby, with no card. A hears nothing — and,
correctly, **sees nobody speaking**: the speaking indicator is the visual
accompaniment to audio and the two are absent together, since `audio.speaking`
is the room's active speakers and there is no subscription. The roster still
shows B as present, which is honest — it says B is there, not that A can hear
them.

**The next arrival raises the offer, and B can be their own.** The rule is a
diff against the roster last seen, not a headcount, so B stepping out and back
in is an arrival and a third person is not needed. Run it that way if there are
only two of you.

### 7. The offer waits at the foreground

A declares nearby, then switches to another app — do not lock the phone. B steps
in. Bring The Floor forward.

**What settles it.** The card is there when A comes forward, naming B. **The
arrival is not consumed by the background**: the roster is not recorded while
the phone is away, so the comparison happens against what A last saw on screen.
A card that never appears means it was consumed — the arrival counted as *seen*
while nobody could act on it.

The old reason for this rule was iOS refusing a backgrounded app a *new*
microphone (measured on build 146: four minutes, no engine start). Nothing asks
for a microphone here any more, and the foreground gate was kept for the
sentence above instead.

**A pocketed nearby phone is expected to lapse, and that is not this test
failing.** Nearby holds no session, so iOS suspends the process within about a
second, the socket goes, `lastPresentAt` freezes at the last thing actually
heard, and fifteen minutes later A reads *Stepped out*. Nearby is deliberately
mortal; the ping is what reaches somebody there.

---

## The rest, in the order they are cheapest

### 8. Nearby claims nothing

Start the podcast, on the headset. On A, **Step in nearby** from a channel you
are not in.

**What settles it.** The podcast keeps playing, untouched. The headset stays on
A2DP at 48000, in stereo. **Being nearby is how you keep stereo**, and this is
that sentence being true. Nothing in the log configures a session at all.

### 9. The arrival notification reaches somebody nearby

**The narrowing, and the reason the pair exists.** A declares nearby, then
leaves the channel screen — Home is fine, another channel is better. Keep the
app **open and in front**. B steps in.

**What settles it.** A gets the arrival notification. Under the old rule it was
suppressed for anybody with the app open anywhere, which silenced exactly the
person who had asked to be told.

Check the deliberate half too: A stepped *into* the channel gets no notification
about B arriving in it, because A is an occupant and is going to hear it.

**If nothing arrives, suspect `APNS_ENV` before suspecting the rule.** See
*Prerequisites*.

### 10. Nearby lapses

A declares nearby and puts the phone down for fifteen minutes.

**What settles it.** B's roster reads *Nearby* and then *Stepped out*, and the
countdown is measured from the last sign of life rather than from the
declaration — so a phone that suspended straight away lapses fifteen minutes
after it suspended. One clock, three ways in.

### 11. A watch party holds the claim

**The clause that left both predicates**, on the grounds that the film is on
another *device*. Start a watch party with the video on a laptop. Both stepped
in, room muted, video playing.

**What settles it.** The film keeps playing — an exclusive claim on the phone
does not touch it. A's session stays `CALL` and the headset stays mono for the
length of it. Nobody hears anybody while it runs, and pausing gives every voice
back with no tap.

**What would falsify the reading this rests on** is the film stopping when
somebody steps in, which would mean it was coming out of an app on the same
phone after all.

### 12. Labs off means the declarations do not exist

Turn Labs off on A.

**What settles it.** No *Step in nearby*, no *Nearby*. And the inferred kind is
untouched: put A in the channel and kill its connection, and B's roster still
says *Nearby* with a ping. That kind is not an experiment and predates all of
this.

### 13. Android, if there is a build

The platform's whole share of this is the release, `ANDROID_RELEASED` —
`manageAudioFocus: false`, `audioMode: 'normal'` — because Android has no policy
observer and nothing gives the focus back on this app's behalf.

**What settles it.** Steps 1 and 2 with a podcast, and `adb logcat` against
`AudioManager` in place of the route module, which is iOS-only. Confirm the
foreground service still drops when the room goes — it is keyed on `mediaRoom`,
so a nearby phone should never start one. planning/ANDROID.md is the standing
document.

### 14. Does any of this survive LiveKit?

**The question the bench never answered**, every reading having been taken
outside a channel with only iOS writing the session. There is no separate walk
for it: it is the panel's *asked* against *actual* row, read at every step
above while a real connection is up. Three writers mutate this session and the
last one wins.

Any step where they disagree is the finding. Record it verbatim — `category`,
`mode` and `categoryOptions` off the live session — because reading back the
value you asked for is the only evidence worth having here, and a panel that
agrees proves nothing except at that instant.

---

## One thing you cannot test on a phone

**`LISTENING` is almost unreachable in the app**, and that is worth knowing
before somebody spends an evening trying to see it. It is the configuration for
somebody in the room who cannot publish — a **guest with no speech grant** — and
guests are the browser page, which has no iOS audio session at all. On a phone
it is reached in exactly one way now that nothing promotes itself: a device
with no microphone. The other — a promotion deferred while backgrounded — went
with promotion.

An iPad or a Mac with no input is the only way to sit in it and listen. If one
is to hand, step in with it while B talks: B should be audible, nothing should
be published, and the log should read `LISTENING` rather than `CALL`.

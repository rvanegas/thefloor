# The screen is the app

**Written 2026-09-17, as a design. None of it is built.** When it ships, what
survives moves to `decisions/` and this file goes.

It answers `tasks/watch-party-on-one-device.md` — *explore options for doing it
without a second device* — and it absorbs `tasks/app-as-watch-party-player.md`
entire, that task's second session being one case of the rule below rather than
a feature of its own. It does **not** touch
`tasks/two-video-streams-in-a-channel.md`, which is about the channel carrying
video; nothing here does.

## What changes, in one paragraph

Today a watch party is a transport clock and the picture is
`server/src/watch-page.ts`, a browser page at `/watch/:channelId#<token>` on
some other device. After this the picture is **the app** — a WebView on
native, an iframe on web — and a screen is always a signed-in session of the
**same account**. One device and two devices stop being different features:
they are the same feature, and the difference is only which of your own
instances is showing it. The watch token, the follower page and the
watch-scoped socket all go.

## Contents

- *The rule* — what withholds, and when it is decided
- *What a screen is* — and why it is never borrowed
- *The two buttons* — and the picker behind the second
- *Device names* — the entitlement, and what to do until it arrives
- *Watching here stops capturing* — the exception, and what it costs
- *What leaves* — and why nothing is shimmed
- *What this does not change*
- *Order of work*

---

## The rule

The mute stays a default that can be lifted, and gains a second term that
cannot:

```
partyWithholds = playing && (mutedAll || somebodyIsWatchingHere)
```

`mutedAll` remains the **intent** — that is what `partyMuteRequested` already
means, and why it outlives a pause. What is new is the second term:
**whoever is watching on the device they are in the room on.**

**The predicate is `microphoneNeeded(state, id) && watchingHere(id)`**, not
presence and watching. A guest with no speech grant has no microphone to be a
problem: `microphoneNeeded` is false for them, they hold `LISTENING`, which is
already a non-voice session, and their film plays properly whatever anybody
else does. One silent guest on a laptop must not mute a room for no benefit.
Reusing `microphoneNeeded` rather than writing a second version of it is also
what keeps this rule and the audio session reading the same sentence.

**A self-mute still counts**, deliberately. A muted microphone is *held* open
rather than released — `intentFor` returns `muted`, and `holdMicrophone` keeps
the engine running — so the session is still `CALL` and the film is still
degraded. *Self-mute is not an input to the audio session* is a standing rule
with an afternoon behind it, and this design is not the thing that reopens it.

The clause returns to `core/micNeeded.ts`, whose header currently says the
watch clause left on 2026-09-08 because *"a watch party's film plays on another
device"*. That sentence is what this design falsifies, and the header is to be
rewritten in the same commit rather than left to contradict the code.

### Enforcement is sampled when a run starts, not evaluated continuously

Somebody switching to one device in the middle of a playing, unmuted film must
not cut every voice in the room mid-sentence. The fix is not a deferral with a
latch: **crossing into `playing` is what asks the question.** `WATCH_PLAY`
looks for anybody watching here, and if it finds one the run starts muted and
unmuting is refused for its duration.

That needs no pending state and no new clock, because the mute only ever
asserts over a running film anyway. At a pause everybody may talk regardless,
so the moment enforcement begins is invisible; it shows up when the film
resumes, which is exactly what *quiet while the video plays* already meant.

The cost is accepted: between somebody's switch and the next pause, their own
device is film-first — it has stopped capturing, so they are inaudible while
the room still believes otherwise. **That is why `watchingHere` is drawn on the
roster** and is not merely an input to a predicate. `isWithheld`'s header
forbids a device deciding it is audible when the room was told otherwise, and
this is the same fault mirrored; stating it is what makes the silence read as
*watching* rather than as a dropped call.

### The guard, and where it is said

`canUnmuteRoom(state)` in `core/channel.ts`, read by the reducer to refuse
`SET_WATCH_MUTE { muted: false }` and by the Watch tab to grey the button, with
a sentence under it — the same division that stops a greyed control and a
refused action disagreeing, and the same shape Record already uses.

### What was considered and not built

**Per-person enforcement** — the one-device watcher's microphone closes and
everybody else goes on talking. Technically straightforward, since each device
already decides its own capture, and it costs the room less. Refused because a
party mute withholds everybody and confers nothing, and that symmetry is what
keeps it from being read as the floor; it is why the interface says it once
under the roster instead of six times on six cards. Per-person enforcement
makes an asymmetric room where one person is inaudible and the rest are not,
which is the floor's shape wearing the mute's name — and it silences the one
person least able to explain why, mid-film. The cost of the rule as adopted is
that somebody else's hardware decides whether you may speak; the sentence under
the button is what makes that legible rather than arbitrary.

**Making the mute unconditional** — every party, every device, no unmuting at
all. It reverses the 2026-08-23 decision explicitly (*"If it is ever built it is
an offer, never automatic"*, where *never automatic* is named as the half that
survived), and it is more than this problem requires: two people each on two
devices have no reason to be silenced. The conditional rule keeps the offer and
removes it only where it cannot be honoured.

### One correction this design rests on

Withholding has **never** stopped anybody capturing. `Channels.assertSilence`
says it — *"Nothing is ever done to a silenced person's own publishing"* — and
the app's only microphone input is `live.selfMuted[me]`. A room mute is a
*subscription* fact: every microphone stays open and publishing into an SFU
that forwards it to nobody.

So "the room is muted, therefore nothing is capturing" is false today, and this
design is what makes it true. Declining to capture during an enforced mute
hides nothing, because the mute is already the channel's stated fact; all it
stops is paying for a publication that is discarded.

**`isWithheld`'s header is wrong about this** and should be fixed in the same
commit: it claims "the app closes its own microphone from it", which is true of
neither reason for withholding.

### What it costs, on the record

`useSpeakingReport` and `useSilencedNudge` both read the local capture, and the
report exists precisely because *"the one participant the SFU still reports a
withheld speaker to is that speaker"*. With no capture anywhere during an
enforced mute, **a withheld speaker can no longer report itself for the length
of the film** — which is the case that decision was written for. The need
shrinks with it, the condition now being categorical and said under the roster
rather than a claim somebody might not have noticed, but
`decisions/2026-09-13-a-withheld-speaker-reports-itself.md` wants amending when
this ships.

---

## What a screen is

**Any signed-in instance of your own account, and never a borrowed device.**

Three facts already in place make this cost nothing:

- **Several sessions per account**, since 2026-08-24. `issueToken` stopped
  revoking; a phone and a laptop signed in at once is ordinary.
- **Watching a channel is not being in it.** `watch.channel` says so, and
  reporting `CONNECTED` there was removed on 2026-09-08 as a bug.
- **Displacement fires on `ENTER`**, not on holding a snapshot. So a second
  instance can render the channel without taking the room away from the phone.

Together those give the second device the best configuration in the design:
signed in, not stepped in, so `channelHasAudio` is false, so it holds **no
audio session at all** and plays the film through an unclaimed audio system
while the phone keeps the voice. Two devices is not a compromise to be
tolerated — it is the configuration that sounds best, and the interface may say
so.

**Being a screen is a role an instance takes, not a consequence of
navigation.** Opening a channel you are not in does not start playing a film at
you. This is what *only those stepped in may watch* means: it governs whether
**you** are in the room, while a screen is declared.

---

## The two buttons

On meeting a party — at `START_WATCH` for whoever starts one, and on arriving
at a running one for everybody else — the Watch tab offers exactly two:

- **Watch here** — this instance becomes the screen. Sets `watchingHere`.
- **Watch on another device** — one of the account's other live instances does.

**Not "Play here".** *Play* is the transport's word — `WATCH_PLAY`, and the
Play/Pause control inches away on the same card — and two acts sharing one word
on one screen is the drift GLOSSARY.md exists to prevent. *Watch* is the
feature's word and matches the state being set.

The picker appears **only behind the second button, and only when there is more
than one other instance to choose from.** One other device plays there
immediately and says which — so a name is usually used to confirm rather than
to choose. No other device shows an informational banner: open the web app and
sign in there.

**The banner stays prose in v1.** The obvious nicety is a handoff link or a QR
from the phone, and that mints a **full session** — a strictly wider credential
than the six-hour, one-channel watch token this design retires, and the exact
swap the original decision rejected on the grounds that a URL pasted into a
chat would become a credential for the whole account. It is buildable and it is
its own decision, not a detail riding along in this one.

**A live socket is not a screen anybody can see.** A chosen device may be
signed in, connected and face-down on a table. The screen confirms it is
actually showing — the player's ready report carries it — and the picker offers
confirmed instances rather than merely connected ones.

---

## Device names

The server can enumerate an account's live instances by `deviceKey`, and has
**no name for any of them**. `DEVICE_ID` is minted at module load, never
written down, not a credential and not persistent — one per JavaScript context,
which makes a browser tab a device. That is the right meaning for displacement
and for this.

So a display name is a new field the app sends at connect, and a new fact the
server has never held. **It is shown only to its own account and never to
another member**, which is worth stating where it lands: device names routinely
carry a person's real name.

**Request the entitlement.** `Device.deviceName` is `UIDevice.current.name`,
and on iOS 16 and newer that returns a generic "iPhone" unless the app holds
`com.apple.developer.device-information.user-assigned-device-name`, which is a
request to Apple with a lead time. Ask for it. An entitlement reaches three
artifacts that must agree — `app.json`, the App ID and the provisioning profile
— so RELEASING.md § *What the app requests, what it gets, and how to check* is
the procedure, and a build signed against a profile that does not carry it
fails at signing rather than at runtime.

**Degrade to generic until it arrives, and if it never does.** The fallback is
`Device.modelName` — "iPhone 15 Pro", "iPad Pro" — which distinguishes
different models and not two of the same. On web there is no device-name API at
all: `navigator.userAgentData` where it exists, UA-derived otherwise, giving
"Chrome on macOS". Two tabs on one machine will carry the same label; last-seen
time is the disambiguator, and letting somebody rename a device is a later
feature, not this one.

---

## Watching here stops capturing, which is an exception

**While this device is the screen and the film is playing, it does not
capture.** The session is `playback` rather than `playAndRecord`, so the film
plays in stereo at full rate with nothing ducking it and no voice processing in
its path. At a pause the microphone comes back and the session returns to
`CALL`, which is what makes pause-to-talk work.

**Name it as an exception, because it is one.** `core/micNeeded.ts` carries one
rule — *you hold the audio system if and only if you are stepped in* — and this
is the first thing to qualify it since the 2026-09-08 redesign that made it one
rule. A clause that is not written down as an exception is a clause somebody
deletes as an inconsistency.

Two things make it safe, and both are properties of a watch party rather than
general licence:

- **Nothing wants a stem from this microphone.** `canStartRecording` requires
  `state.watch.party === null` — a *loaded* party refuses a recording whether
  it is playing or paused, and regardless of where anybody is watching it. So
  the capture that is being declined is feeding nothing: not a recording, and
  not a subscription either, since the mute is enforced for the length of the
  run. The reason recording is refused is the same one that makes this
  harmless: **the video would not be in the recording anyway**, so a recording
  made beside a party is missing the thing everybody was reacting to.
- **The reacquisition happens in the foreground.** iOS refuses a backgrounded
  app a *new* microphone — the deferred promotion in STATES.md — so a device
  that has given up capture must be in front when it asks for it back. A film
  playing on this screen is what puts it there.

**That second one needs stating precisely, because nothing can prevent
backgrounding.** What is prevented is the *automatic* case: the idle timer
locking the phone under a film nobody is touching. That wants
`expo-keep-awake` on native and `navigator.wakeLock` on web, neither of which
this app has yet. A person deliberately swapping away is still possible, and it
is already handled — the app stays `LISTENING`, takes `CALL` at the next
foreground, and that is the machinery the deferred promotion already is. It
should also stop being the screen, since a suspended WebView is showing nobody
anything.

### What it costs: a profile handover at every pause

Stereo is available **only** with the category change. HFP follows a category
that carries an input, which is why STATES.md describes crossing `CALL` ↔
`LISTENING` as a Bluetooth profile switch, stereo to mono and back. So the hope
recorded earlier in this design — that dropping the voice *mode* while keeping
`playAndRecord` would buy good audio with no churn — is dead on the project's
own readings: the mode costs the ducking, the category costs the profile, and
stereo needs the category.

The bloom is the thing being bought, so the handover is the price rather than a
defect. What is not yet known is whether its gap is tolerable **at every pause
of a film**, which is a different question from tolerating it at the edge of a
room. That is a walk question and not a bench one — nothing in this repository
can answer it, and one evening with a headset can.

The STATES.md row *Stepped in, watch party, while the video plays → `CALL`*
becomes two rows: the screen's, which is `LISTENING`, and everybody else's,
which is unchanged.

**A WebView's audio plays into the host app's session**, which is what makes
any of this bite on native — and with the exception in place, the session it
plays into is the right one. The claim is still worth one measurement rather
than one assertion: *a design's claim about a path it does not touch is a
hypothesis*.


---

## What leaves, and why nothing is shimmed

The watch token has no remaining job, so the deletion is: `/watch/:channelId`
and `server/src/watch-page.ts`, the `watch_tokens` table, `issueWatchToken`,
`watchTokenFor`, `canOpenWatchScreen`, the `{ kind: 'watch' }` socket scope
with its one-action allowance in `ws.ts`, both copy buttons and the share on
the Watch tab. `SET_WATCH_MUTE` stays on the wire — the intent survives — but
its refusal is new.

**No shim, and no floor raise.** `bin/health` on 2026-09-17 reads `minBuild 80`,
`oldestBuild 80`, `silentBuilds 0`: everybody in the wild is exactly at the
floor, so the only exposure is between the release and each person updating.
Watch is behind Labs and every boolean setting defaults to false, so an
un-updated build is affected only if its owner turned Labs on or is in a
channel where somebody starts a party. What they meet: the screen link 404s,
*Unmute the room* is refused, and a party plays with no picture and their
microphone shut. Nothing outside the Watch tab changes.

The general argument, which is the one worth keeping: **a shim here cannot
preserve the feature for an old build, only its buttons.** An old build has no
in-app player, so it is in a party with no screen either way, and keeping
`/watch/:id` alive would preserve a second-device experience this design has
just replaced. That is worse than an honest break.

Raising `MIN_SUPPORTED_BUILD` in the same release was the alternative and is
refused as disproportionate: it replaces the app with an update screen for
everybody, including the majority who never turned the feature on.

**The ordering dependency, which is the thing most likely to be forgotten:
this must land before `tasks/watch-leaves-labs.md`.** That task takes Watch out
of *Show experimental features*, which is the shelter making this break cheap.
Landing them the other way round turns a Labs-only annoyance into a
default-on one.

---

## What this does not change

- **The Floor still carries no video.** Nothing is fetched, decoded, published,
  recorded or stored here; it is a link, YouTube's own player, unmodified and
  unobscured. What moves is which window that player is in.
- **Recording is still refused in both directions**, and for the same reason
  — a loaded party refuses one whether it is playing or paused, and wherever
  anybody is watching. That is what makes the capture exception above safe.
- **The floor still confers control without pausing anything.**
- **`WATCH_DRIFT_MS` and the seek-storm guards are unchanged.** The correction
  arithmetic should be extracted into `core/watch.ts` as a pure function so
  that the native and web players cannot fork the clock — the `parseYouTubeUrl`
  precedent, where a greyed control and a refused action must agree about what
  a link is.
- **No new wire for the player itself.** The channel snapshot already carries
  `watch`, and `WATCH_READY` is already in the member-allowed action list in
  `server/src/channels.ts`. What *is* new is `watchingHere`, the device name,
  and telling a chosen instance to become the screen — the last of which has a
  precedent in how `displaced` reaches one specific other session.
- **`watchingHere` is volatile**, beside `present`, `waiting` and
  `disconnectedAt`: it describes a process rather than a channel, stays out of
  `durableOf`, and a restart drops it along with the presence it depends on.
  `revivedWatch` still brings a party back paused with nobody watching, which is
  true — every screen in the world disconnected.

### App Review

Section 6 of the review notes opens *"A watch party is behind Labs and carries
no video"* and offers the no-video argument — never fetches, decodes, stores or
shows a frame. **The second half of that sentence stops being true**: the app
will show frames, in YouTube's own player, inside a WebView. The argument
survives the rewrite and the claim does not, so whoever ships this writes the
paragraph. `tasks/watch-leaves-labs.md` is already queued to rewrite the same
section, and the two rewrites should be one.

---

## Order of work

1. **Request the device-name entitlement**, which has a lead time and nothing
   else waits on it.
2. **Keeping the screen awake** — `expo-keep-awake` on native,
   `navigator.wakeLock` on web. Small, independent of everything else, and the
   capture exception leans on it.
3. **Extract the correction arithmetic into `core/watch.ts`**, with the
   follower page as its second caller while it still exists.
4. **The rule** — `watchingHere` on the state and the roster, the predicate,
   `canUnmuteRoom`, sampled enforcement at `WATCH_PLAY`, and the `micNeeded.ts`
   header rewritten.
5. **The web player**, which needs no native module, no rebuild and no review.
6. **The native player** — `react-native-webview` 13.15.0, which SDK 54
   bundles, autolinked with no config plugin. A `prebuild` and a rebuild, with
   RELEASING.md's `DEVELOPMENT_TEAM` trap on the way.
7. **The two buttons, the picker, the banner.**
8. **The deletion** — the follower page, the token, the table, the scope — and
   the review-notes rewrite in the same release.

**And then the walk**, because the suite has never watched anything: the
outstanding steps in
`backlog/the-watch-party-has-been-walked-once-and-the-rest-of-the-walk-is-outstanding.md`
are still outstanding, and this design adds three of its own — a film watched
on one device, a film watched on two, and somebody switching between them
mid-film. **The handover at each pause is a walk item and the only unsettled
thing left** — whether the stereo bloom is worth its gap when a film is paused
and resumed a dozen times in an evening.

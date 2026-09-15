# The room says who came and went — 2026-09-14

Closes `tasks/audio-announcement.md`: *"When member steps in or steps out,
there ought to be an audible announcement, such as two inverse distinguishable
subtle chimes."*

Two notes rising when somebody steps in, the same two falling when they step
out. Everybody present hears it except the person it is about.

## It is not in the media room, which was the first design

The obvious reading of *announcement* is one sound in the room, published into
LiveKit the way shared playback is, heard by everybody at once. That was
designed in full before it was dropped, and the reasons are worth keeping
because the design was attractive:

- **The publisher would have to be open whenever anybody is present.**
  `media:chan_<id>` opens on the *first track* today and is released the moment
  the room empties — a deliberate fix, after `bin/usage peak` found one channel
  nobody had been in for hours still connected and still pumping. A chime has
  to be connected and subscribed *before* the arrival it announces, so it would
  need a standing SFU connection and a 10ms frame loop per occupied channel
  where today an ordinary conversation costs neither. The measured peak is a
  handful of channels, so the cost is small — but it is a new standing cost for
  a cue, and cues are extras.
- **It would be in the recordings.** `pumpOnce` writes every frame to the stem
  encoder before the sink, on the stated principle that what a recording
  contains is what was heard. Door noise would land in exports and in
  transcripts, where the `media` stem is transcribed by name.
- **It could not have said the one thing the request is clearest about.** A
  sound in the room reaches the room. *The person arriving should not hear
  their own arrival* — they know they walked in — and a shared sound has no way
  to exclude one listener.

So each device makes its own sound about other people. Nothing crosses the
wire, nothing reaches the server, and the whole change is the app plus a dozen
lines of Swift.

## What it narrows, and this is the part to read

`archive/DECISIONS-2026-08-21-to-2026-08-23.md` § *The buzz reaches a locked
phone, so the tone is not built* says a tone "must not be built", and
`cue.web.ts` and `useSilencedNudge.ts` both repeat it as standing instruction
to whoever reads them next. This work builds a tone. It is not a reversal.

**That entry is about the silenced-speaker cue and remains correct about it.**
Its two reasons were that the buzz already reached a locked phone, so a tone
bought nothing, and that a tone would have played over the very voice it was
announcing. Neither transfers here:

- An arrival has no voice of its own to talk over.
- **A buzz carries no bit.** There one thing had happened and the cue had only
  to say *something*. Here there are two things and the whole job is telling
  them apart, which no amount of vibration does. That is why the sounds are
  *inverse* rather than merely two sounds: the same notes reversed, so the
  second is recognisable from the first without being learned.

The instruction in those two files has been left where it is and now names the
case it governs. **What was taken from that entry is its transferable lesson**,
which is stated there as the thing that would have collapsed three builds into
one: *ask what suppresses this before asking when to send it.* That question is
answered below, and it was asked first.

## What suppresses it

**`setAllowHapticsDuringRecording`, and it was already being asserted.** iOS
mutes haptics *and system sounds* for the duration of any session using audio
input, which is most of when this cue has anything to say; the default is off
and build 70 was silent for exactly that reason. `useSessionAudio` turns it on
unconditionally on every configuration write, so the chime inherits a property
somebody else paid three builds for. It is named in `AudioRouteModule.swift`
beside the new function, because a future session removing that call would
silence this with no other symptom.

**The delivery is `AudioServicesPlaySystemSound`**, the same as the buzz, and
the argument already in that file settles it: *a system sound starts nothing.*
`AVAudioPlayer` and `expo-audio` both configure `AVAudioSession` themselves,
which would make a fourth writer to the process-wide configuration
POSTMORTEM-echo.md is about — the build-17 echo bug's exact shape. It also
means the chime is not gated on `UIApplication` state, so it reaches a locked
phone for the same reason the buzz does, which matters because presence is not
a screen.

**The sounds are synthesised, not shipped.** `AudioServicesCreateSystemSoundID`
wants a file, so the Swift half renders a WAV per direction into the temporary
directory once per process and keeps the ids. No binary in the repository, no
asset pipeline, and no decode on the path of a cue that has to land at the
moment somebody walks in.

## Only a departure somebody chose

`core/channel.ts` § `Exit` has four ways to stop being present, and two of them
are clocks rather than decisions. A chime for those would announce something
nobody did — a phone that died in a pocket did not leave the room.

The table there makes this answerable from two snapshots, and the discriminator
is not the one it first looks like:

| | `lastPresentAt` | `waiting` | `declaredNearbyAt` |
| --- | --- | --- | --- |
| `chosen` — a tap | stamped now | cleared | cleared |
| `nearby` — declared | stamped now | added | stamped |
| `dropped` — grace ran out | left alone | added | left alone |
| `inattentive` — attention ran out | left alone | cleared | cleared |

**`lastPresentAt` is the bit.** It is written when somebody decides something
and left alone when a clock decides instead, which is exactly the distinction
wanted, and it is the only field that separates the top two rows from the
bottom two. A rule written around `waiting` — the obvious one, and the one this
work started with — gets `inattentive` wrong, because an attention expiry
clears `waiting` exactly as a tap does. The `waiting` test survives as a second
opinion on the one case that can fool the stamp: a `dropped` user's last
heartbeat could in principle land between the two snapshots the hook compares.

A **declaration from outside** is an arrival and rises, mirroring
`server/src/channels.ts`, which makes the same distinction before announcing to
the absent. One from inside is somebody stepping out to the rung below, and
sounds as the departure it is. The stamp is restamped in place when the lit
rung is tapped, so the rule keys on the id *appearing* in the map and never on
its value — otherwise a renewal chimes.

## Smaller things, decided

- **Above the channel screen**, in `App.tsx` beside `useKnockNudge`, for its
  reason: walking back to Home leaves you in the conversation, so a cue mounted
  in `ChannelView` would go quiet for the people with no other way to know.
- **One chime per direction per snapshot.** Two people arriving together is one
  arrival sound. Two copies of the same 180ms tone overlapping is mud, and the
  count is on the roster for whoever the sound made look.
- **No fallback to `expo-haptics`**, where the buzz has one. A cue that cannot
  say which of the two things happened is worse than silence: it would train
  somebody to check the screen every time. Android and jest get nothing, as
  `vibrate` degrades there.
- **The web twin is the stronger one for once.** `cue.web.ts` had to give up
  the buzz for a mark on the tab because a browser has no vibration motor; Web
  Audio synthesises two notes from nothing. Its paragraph forbidding a tone is
  about the silenced-speaker case and the same narrowing applies.
- **No setting.** Neither existing cue has one. When somebody asks, it is named
  for the departure and defaults false, per
  `2026-09-07-every-boolean-setting-defaults-to-false.md`.

## What is not established

**Nobody has heard it.** Everything above is reasoning and a green suite; the
scheduling is pinned by sixteen tests and the sound by none, because the sound
is a native path jest cannot reach — `__stubs__` refuses the whole module. The
measurements that matter are on a device, and the entry this work narrows is
itself the record of what happens when a cue is shipped on the strength of its
scheduling layer being correct: three builds, each one green throughout.

To take before trusting this: audible while stepped in under `CALL`; audible
with the phone locked and the app backgrounded; what the ring/silent switch
does to it; what it sounds like over Bluetooth HFP; and whether the two are
distinguishable by ear, which is the actual requirement and the one thing no
test here can fail on.

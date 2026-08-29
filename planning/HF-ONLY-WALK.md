# The hands-free-only walk

**Temporary.** This is the device check for the second audio-session rule added
on 2026-08-27, which lives behind the **Headphones → Keep the connection
steady** setting. Delete it once the walk has been done; what it establishes
belongs in decisions/DECISIONS.md § *Hands-free only, because fidelity had
exactly one real claimant*, which is already written and already says the walk
is outstanding.

**Because it is a setting, this walk is not a merge gate.** The default is
unchanged, so nothing here has to pass before anything lands. What the walk
decides is **which setting to keep, and what to recommend** — so a step that
cannot change that answer is not in it.

It exists because this subsystem has a documented habit of being reasoned from
source, shipped, and written up as fixed before anybody listened — STATES.md
disagreement 5 is an entry that says exactly that about itself. The suite being
green is evidence about the reducer. It is no evidence at all about a Bluetooth
profile.

## Reduced to six cases, 2026-08-29

It was thirty-six steps, grouped by how many people each needed. Most of them
could not distinguish the two rules at all, and several of the ones that could
were measuring the mechanism rather than the trade. **The full version is
`git show 0346b16:planning/HF-ONLY-WALK.md`** and is worth going back to if
something here comes out strange, because it carries the regression guards this
one drops.

What was cut, in three groups:

- **Nineteen steps where the two rules provably agree** — the old 1–6, 9, 15,
  16, 18, 19, 20, 22, 23, 24, 25, 30a, 34, 35. Every one is a regression guard
  or a mechanism check, and none of them can come out differently under the two
  settings. Two still matter for other reasons and have not been thrown away:
  **old step 30a** is the honest measurement for TASKS.md § *The Foreground
  Interruption*, precisely because the setting is a control there rather than a
  variable, and **old step 23** is the one that says whether the timing
  argument this change rests on is sound. Both are now questions about the
  change rather than about the setting, and belong to whoever picks those up.
- **Steps that discriminate without deciding anything** — the old 26, 27, 28
  and 30b. They separate the rules, but every outcome they can produce leaves
  the choice where it was. 28 survives here folded into case 4, as the flip
  that makes the comparison possible at all rather than as a step of its own.
- **Old step 17, which was simply wrong.** It claimed that pausing a watch
  party alone asks `CALL` under the setting and `IDLE` under the default.
  `START_WATCH` clears the track (`core/channel.ts`), and `partyWithholds` is
  false once paused, so alone with a paused party `channelHasAudio` is false:
  no other occupants, no recording, `playback` idle. Both rules ask `IDLE`, and
  there is nobody to talk to anyway. It read as if somebody else were present,
  and it sat in the part that needed nobody.

## Where the two rules actually differ

Subtract them and almost everything cancels:

    anyMicrophoneOpen (default) = ∃ occupant: microphoneNeeded && !selfMuted
    channelHasAudio   (setting) = !partyWithholding
                                  && (others in room || recording
                                      || playback ≠ idle)

Three situations survive, and the six cases below are those three met from both
sides:

- **A quiet room.** Somebody else is present and every microphone is shut. The
  setting holds the call; the default hands the route back. Cases 4, 5, 6.
- **Your own audio, alone.** A track loaded, playing, paused or finished, with
  nobody else there. The setting holds the call; the default does not. Playback
  stops discriminating the moment a second person arrives — both rules are true
  then — so this is a solo case by construction. Cases 1, 2.
- **A solo recording while self-muted.** Case 3, which is new and which nobody
  has looked at.

## What you need

- **A Bluetooth headset that can do HFP** — AirPods are the reference device,
  having been what the build 72 check was done on. **And a Bluetooth speaker
  with no microphone**, which is case 2 and is not optional here the way it was
  optional before.
- **Another app making sound** over the same route.
- **`accounts.debug` set**, so `AudioDebugPanel` renders. **Read `steady
  headset` before anything else in the dump** — two pastes of the same case
  under the two settings are otherwise identical in their provenance, and a
  pair you cannot tell apart is not a pair.
- **A second phone and a person for cases 4 and 5**; a third for case 6.
- `idevicesyslog -m "Native auto-config"` if `asked` and `actual` ever
  disagree. That is the shape every bug in this subsystem has taken.

Every case is **run under both settings, back to back, on one route** — that is
what the setting is for, and it is a comparison this subsystem has never once
been able to make. Copy the panel at each half. Do not run one half today and
the other tomorrow on a different headset.

---

# Alone

## 1. Shared playback, alone in a channel *(old 10–14)*

Alone in a channel with music playing in another app: load a track, play it,
pause it, clear it, then leave and come back with it loaded.

**The last leg changed under this walk on 2026-08-29** and is worth doing
attentively rather than as a formality: since `e800c4f` the media participant
is released when `roomOccupants` empties and reopened when somebody arrives,
so walking back in alone now *reopens* it rather than finding it already
published. The track file and the paused status survive — `releasePlayback` is
`closePlayback` minus the deletion — so `channelHasAudio` is unchanged and both
rules ask what they asked before. What is new is that the thing being asked
about has to be built again first.

**Under the setting** the route drops to mono at the **load**, the other app
stops, and `asked` is `CALL` from then until you clear the track. **Under the
default** none of that happens: nobody present is capturing, so it stays `IDLE`
and stereo throughout.

**What it decides.** The build 89/90 fault was shared audio being inaudible to
somebody alone in a channel, and the suspicion was a category write landing on
the engine's start. This rule moves that write earlier, to the load. **Audible
under the setting and not under the default** makes the setting a fix for a
live fault rather than a preference, which is close to decisive on its own.
**Audible under both** exonerates the timing argument, puts the engine start
back in the frame, and leaves the setting to be judged on cost alone.

## 2. The same track on a mic-less Bluetooth speaker *(old 21)*

Repeat case 1's load on a Bluetooth speaker that has no microphone.

`playAndRecord` makes such a speaker an ineligible output, so **under the
setting the speaker is evicted and the track comes out of the phone's own
loudspeaker**; under the default it stays on the speaker. Not subtle, and the
eviction is the 2026-08-21 fix working correctly rather than a bug.

**What it decides.** This is case 1's cost, and it is the sharpest one here:
the setting can make shared playback audible in the channel and in the same
move put it on the worst speaker in the room. If case 1 comes out in the
setting's favour and this comes out badly, the honest recommendation is
narrower than "turn it on" — it is about which route you are on, not about the
setting.

## 3. A solo recording, self-muted *(new)*

Start a recording alone, then self-mute yourself. `canSetSelfMute` permits it;
only the floor-holder is refused.

`channelHasAudio` stays true because the recording is running.
**`anyMicrophoneOpen` goes false** — `microphoneNeeded` is true but `selfMuted`
is set — so the default should ask `IDLE` with a recording still in flight.
Watch `asked`, and then **listen to the recording afterwards**.

**What it decides.** If the default closes the device mid-run and the recording
comes back silent or truncated, that is a **failure mode in the default rather
than a trade**, and it is the one kind of finding here that decides the
question without reference to anybody's ear. Nobody has looked at it; it fell
out of comparing the two predicates rather than from any sitting.

---

# With one other person

## 4. The quiet room, under your own thumb *(old 7, 8, 28, 29)*

In a channel with one other person, both of you self-muted. **Flip the setting
off and on** and listen: off, the route blooms to stereo and the other app
comes back; on, it drops to mono and the other app stops. The log should show a
`steady headset` line at each flip with the session write beside it. *If this
does nothing, the setting is not reaching `App.tsx` and every case here is
measuring one rule twice.*

Then, from that state under each setting in turn, **have them unmute and speak
immediately**. Under the default that first word lands inside an HFP handover.
Under the setting the link never moved.

**What it decides.** Everything. This is the trade in one sitting: whether the
clipped syllable is audible enough to be worth a mono link. **If the first word
survives under the default, the setting buys nothing**, and the rest of this
document is about a cost with no benefit. It cannot be reasoned to, and it is
why this shipped as a setting rather than as a replacement.

## 5. An afternoon of it *(old 31)*

Sit in a channel for an afternoon with the setting on. Battery, and whether a
mono link for hours is something you stop noticing or something you resent.

**It needs somebody in the channel with you** — alone and quiet the setting
asks `IDLE` and there is no mono link to resent, so a solo afternoon measures
nothing. A loaded paused track is a solo approximation and is not the same
thing.

**What it decides.** Case 4's cost, on the only timescale that can show it. A
handover you hear once is a curiosity; four hours of HFP is the thing people
actually turn a setting off over.

---

# With two other people

## 6. The third person *(old 32, 33)*

All three present. One self-mutes, then a second, then the third. **Under the
default the route should not move until the last microphone closes**; under the
setting it never moves at all. Then, all three muted, have one unmute and speak
immediately under each setting in turn — case 4's comparison in the room where
it is rarest.

**What it decides.** How wide the recommendation is. `anyMicrophoneOpen` is a
claim about the whole room, so the chance of every microphone being shut at
once falls sharply as the room grows: in a two-person channel one person muting
is half the room, in a three-person channel a third. **So the trade is at its
sharpest in the smallest room this app has**, and a verdict reached on case 4
alone is a verdict about that room and no other. If the first syllable survives
here under the default, the setting is worth recommending to people whose
channels have two people in them, rather than being stated flat.

One regression to watch for while you are there: **if the route moves on the
first of the three mutes**, `anyMicrophoneOpen` is being evaluated against
something other than the room — the roster, or your own microphone — and the
2026-08-19 route loss is back by a new path.

---

## What would falsify this

- **`actual` disagreeing with `asked` anywhere**, and especially at a
  foreground or a rebuild. That is the shape of every bug this subsystem has
  had; it means a second writer won a race, and `idevicesyslog` names which.
- **Case 4's flip doing nothing audible.** The setting is not reaching the
  session, and no other case here means anything.
- **Case 1 audible under both settings.** The category write was not the build
  89/90 mechanism, and the setting is a preference rather than a fix.
- **Case 4's first syllable surviving under the default.** The handover was not
  what cost it, and the quiet room's mono link buys nothing.
- **Case 6's route moving on the first of three mutes.** The default is not
  asking about the room, and everything case 4 concluded about it was measured
  against a rule that does not exist.

## What this walk cannot tell you

Whether the trade is worth it for anybody but you. Case 5 is one person's
afternoon on one headset, and the reason this shipped as a setting rather than
a decision is precisely that the answer is not expected to be the same for
everybody. A walk that comes out clean argues for **recommending** the setting,
not for making it the default — and a walk that comes out badly on your
hardware is not by itself an argument for removing an option somebody else may
want.

Case 6 is the closest this gets to escaping that, and it does not escape it: it
says the trade is smaller in a larger room, which is a fact about the rule
rather than about a person. It does not say whose room.

**Case 3 is the exception**, and it is the only one here that can settle
anything without an ear: a rule that silences a running recording has a failure
mode rather than a cost, and that is one of the two things
decisions/DECISIONS.md names as grounds for removing an option outright. The
other is nobody turning it on, which is not visible from here.

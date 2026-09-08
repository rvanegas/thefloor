# The audio-and-presence review, surveyed but not done

> **Superseded in part, 2026-09-08. Read this after the other two, or not at
> all.** `AUDIO-PRESENCE-DESIGN.md` is the design that answers it and
> `AUDIO-LAB-FINDINGS.md` is the evidence — nine configurations measured on a
> device.
>
> **What is falsified here**: everything below that treats a call-shaped
> session as necessarily exclusive, including *"there is no configuration that
> both holds the call route and lets another app play"*. `playAndRecord` mixes
> perfectly well; the voice-chat **mode** was what stopped other apps, and the
> 2026-09-06 experiment could not see that because it held `videoChat` fixed.
>
> **What is moot**: § *`otherAudio`, a three-value flag wearing a boolean's
> name*, § *Two keep-alives, not one*, and the solo-wait material. The design
> deletes `otherAudio`, `waitingAlone` and the keep-alive outright.
>
> **What still stands, and is the reason this file is kept**: § *The naming,
> which is the main thing to fix*, and § *The latent hazard: four positional
> booleans*. Those are unaffected by any of it and are still worth doing.


**Temporary. A survey for unbuilt work**, written 2026-09-07 at the end of a
session that changed the attention rules and deliberately changed no names.
Delete it when the review ships; whatever survives moves to `decisions/`.

What was *decided and built* that day is
`decisions/2026-09-07-a-phone-alone-is-the-only-thing-worth-retiring.md`. This
file is the other half: what the session found while reading, agreed was
confusing, and left alone. **Nothing here is a defect in behaviour.** It is all
legibility, and one class of latent hazard.

Read `STATES.md` § *Mic Open* and § *Audio Session Configuration* beside this.
They are correct and they are not the problem.

---

## Start here: the one fact that explains the shape of everything else

`hasAudio` has **three jobs, and only two of them look like its job.** It picks
the audio session's category. It contributes to whether the microphone opens.
And — undeclared anywhere in its name — it decides whether the process survives
being backgrounded, and therefore whether presence survives.

The hook states it, once, in the keep-alive effect:

> *"`IDLE` is the configuration this app takes when no audio is flowing, and no
> audio flowing is precisely the condition under which iOS suspends a process
> holding the `audio` entitlement. The two have always described the same
> moment; until now only one of them acted on it."*

**So presence is not something this app manages. It is a downstream side effect
of the audio session.** That is why two changes made for audio reasons —
`holdForPlayout` for the frozen-playout bug, `waitingAlone` so an arrival can be
answered — silently rewrote what presence means, and why nothing noticed until
somebody was stepped out of a live conversation.

Any simplification that does not keep this visible will let it happen again.

### And one clause decides which world you are in

```ts
roomOccupants(channel).some((id) => id !== me)
```

It appears in **both** core predicates. The moment a second person is in the
room it is true, so `hasAudio` is true, so the microphone opens, so the process
is immortal, so presence never expires on its own.

- **Alone** — false. The process is mortal and suspension is a real terminator.
  This case can be fixed by *removing* artificial life support.
- **Two or more** — true, unconditionally, regardless of mute, silence or
  attention. Suspension will never come. Only a rule can end it.

That asymmetry is not a quirk. It is why the solo bound is a deletion and the
two-person bound has to be a judgement, and it is why Rule B is now scoped to
solo.

---

## The naming, which is the main thing to fix

**Seven names, four levels, one collision.** The levels are real and sound; they
are simply not visible as levels.

| level | name | what it is |
| --- | --- | --- |
| 1 rule | `microphoneNeeded` / `channelHasAudio` | pure, `core/micNeeded.ts` |
| 2 asked | `micNeeded` / `hasAudio` in `App.tsx` | rule + `recordingAsked` |
| 3 concluded | `micNeeded` / `hasAudio` in the hook | + `holding`, `waitingAlone`, `inputAvailable` |
| 4 published | `SessionAudio.micOpen` | concluded `&& !selfMuted` |

**Levels 2 and 3 share names, and level 3 is strictly wider.** That is the whole
confusion. The hook already has a good convention — `xAsked` is what the caller
asked for, `x` is what the hook concluded — and it holds for `selfMutedAsked`,
`hasAudioAsked`, `micNeededAsked`. `App.tsx` is the file that breaks it, naming
its locals `micNeeded` and `hasAudio` when by that convention both are *asked*
values.

Renaming those two locals to `micNeededAsked` / `hasAudioAsked` is inert, is two
lines plus two call arguments, and removes the only true collision.

Also loose, in ascending order of how much they matter:

- `STATES.md` calls level 4 `micOpen`, a fifth name for the family.
- The file is `core/micNeeded.ts`, but its exports are `microphoneNeeded` and
  `channelHasAudio` — named after one of its two exports, abbreviated
  differently from that export.
- **`GLOSSARY.md` has no entry for any of them.** Not `micNeeded`, not
  `microphoneNeeded`, not `channelHasAudio`, not `hasAudio`. Per AGENTS.md the
  glossary is the source of truth for the vocabulary, and this is four names for
  three concepts with one collision — precisely what it exists for.

### Three options, in ascending size

1. **Name the levels only.** Apply the `Asked` convention in `App.tsx` and stop.
   Two production call sites change; core, tests and prose keep their names.
2. **Also rename the core predicates**, after what each *decides* rather than
   what it describes, so the pair stops sounding alike. Only two production call
   sites, but roughly thirty test and prose references follow.
3. **Collapse to one call, two fields** — `audioWanted(channel, me) -> { publish,
   call }` — so the senses are fields that cannot be mistaken for one another and
   are always computed from the same state.

**The constraint on all three**, from `STATES.md` § *Mic Open*: *"There are two
senses of this state and they are both wanted… Do not collapse them."* That
forbids merging the two **questions**, not computing them in one place — so
option 3 is compatible with it, and arguably serves it better than two
similarly-named functions do.

### The two senses, since the phrase is easy to misread

`microphoneNeeded`/`micOpen` decides whether **we publish**. `channelHasAudio`
decides what configuration **everyone's session is in**. They diverge in exactly
three places:

| situation | `channelHasAudio` | `microphoneNeeded` | `micOpen` |
| --- | --- | --- | --- |
| two people, I am self-muted | true | true | **false** |
| guest with no speech grant | true | **false** | false |
| alone, playback playing | true | **false** | false |

Collapse toward *publish* and a guest, or a solo listener with playback, gets
`IDLE` — an arriving voice then lands on the media volume rail, which the
`WAITING` decision of 2026-09-05 exists to prevent. Collapse toward *has audio*
and you open a device microphone for a guest whose token cannot publish — the
full call-profile handover, paid to publish nothing.

---

## The latent hazard: four positional booleans

`useSessionAudio` ends with **four consecutive optional booleans**:

```ts
recoverPlayout = false,
deferSubscribe = false,
holdForPlayout = false,
handBack = false
```

`App.tsx` passes them bare — `false, true, true, <expr>`. **A transposition
would be completely silent**, and three of the four change audio behaviour in
ways that took builds to diagnose the first time.

Worse, the JSDoc is not a reliable guide to the order: it documents them as
`holdForPlayout, deferSubscribe, recoverPlayout`, the reverse of the signature.

Two of its `@param` names do not exist at all — it says `@param micNeeded` and
`@param selfMuted` where the parameters are `micNeededAsked` and
`selfMutedAsked`. `hasAudioAsked` is documented correctly, which is what makes
the other two read as deliberate rather than as drift.

**An options object for the trailing flags would end the whole class.**

---

## `otherAudio`, a three-value flag wearing a boolean's name

Set from `AVAudioSession.isOtherAudioPlaying`. Four things about it, all
measured, none guessable:

- **The name lies.** It does not report other apps — it reads true only while
  *this* app is the active one. Asking it on every app-state change made build
  150 flip configuration five times in thirty seconds and kill a podcast a
  fraction of a second after its play button.
- **It is honest in one window only** — a foreground with no connection being
  made. The connect path activates our own session, after which iOS reports no
  other audio. Build 153 took a silent wait with music plainly playing. This is
  why the read is keyed on `[foreground]` and deliberately **not** on
  `mediaRoom`, unlike the `inputAvailable` read a few lines below it.
- **Backgrounded it is never read**, so the last foreground value is frozen for
  the whole background period.
- **`null` means never asked and is not `false`.** A phone launched straight into
  the background has had no honest moment.

**Consequence to carry into the review:** `waitingAlone` requires `otherAudio ===
false` strictly, so a phone launched into the background never takes a solo wait
and falls through to the silence path instead. The solo case has two sub-cases,
not one, and they use different mechanisms.

---

## Two keep-alives, not one

Easy to conflate, and the difference decides whether a bound does anything:

- **`startSilence`** (`modules/keep-alive`) plays silence when `hasAudio` is
  false. Its own `WAITING_WINDOW_MS` timer was deleted in `c9685cd`. Because
  `waitingAlone` feeds `hasAudio`, this path is suppressed during a solo wait and
  is now a narrow fallback for the never-asked case above.
- **`waitingAlone`** holds the *microphone* open, and is what actually keeps a
  solo phone alive. It has never had a timer.

**Rule B is the bound on both**, which is why the keep-alive's own window could
stay deleted. Anyone proposing to lengthen or remove Rule B has to restore a
bound here first — and note that the other-app-audio defect accepted on
2026-09-06 is bounded by exactly this window, so lengthening the window
lengthens that defect silently.

---

## Open questions worth answering before simplifying

- **Is a backgrounded phone actually capturing?** An unmuted publication is not
  proof of live capture, and the keep-alive comment claims iOS grants a
  backgrounded app no microphone. If that is general rather than specific to the
  ducking case, then "your own voice never counts" is moot on a phone and one of
  the arguments in `attention.ts` needs restating.
- **Should presence be describable rather than binary?** The alternative to
  evicting an idle occupant is saying they are idle. `idleMs`, `lastPresentAt`
  and the `waiting`/Nearby rung already carry the data. That is a vocabulary
  change and wants a `GLOSSARY.md` entry before any code.
- **Two pocketed phones with open microphones are never retired**, and a
  recording in such a room never ends. Accepted deliberately on 2026-09-07; the
  eventual bound is the battery. Revisit with new evidence, not new reasoning.

## Related, already recorded elsewhere

- `BACKLOG.md` § *`mediaRoom` is the channel id everywhere* — the same kind of
  cleanup, already surveyed, gated on the compatibility floor.
- `BACKLOG.md` § *Presence follows the websocket, not the room* — the cause all
  of the above is downstream of.

---

## A method note, which is the cheapest thing here

Three separate accounts of the 2026-09-06 step-outs were produced by inference
from server usage spans and mute states, and **all three were wrong** — each
corrected by somebody who had been in the channel. One line written by the phone
settled it in a minute, and settled the frozen-timer question with it.

The facts that decide these outcomes exist only on the device: who was in its
active-speaker set when a look ran, whether it was frontmost, and how long since
the previous look. **Add the log line first; reach for `bin/db` and the spans
second.**

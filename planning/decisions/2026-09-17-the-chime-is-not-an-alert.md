# The chime is not an alert

The chimes were reported inaudible — in a channel and in the audio lab alike.
The phone was in silent mode. Nothing was broken.

That is worth writing down because a day had already gone into the renderer on
the strength of the same symptom. The peak was swept, the lead-in was swept, a
cold first play was found and fixed, the loudness was made a setting and then
withdrawn, and the samples were compiled and measured off-device at a real 15dB
spread. Every one of those readings was correct and none of them was about the
fault. `AudioServicesPlaySystemSound` plays an *alert*, and a phone with the
ringer switch thrown does not play alerts — so the cue was being discarded
whole, downstream of everything anybody thought to measure.

## Two changes, and only one of them is the silent switch

**The path.** The app now plays its chimes through `AVAudioPlayer` — the
`player` arm that `2026-09-15-the-chime-has-no-volume-because-of-the-path.md`
built as a comparison and left unchosen. It plays into the session this app
already holds and writes nothing to it, and in a channel that session is
`playAndRecord`, which ignores the ringer switch. So no flag had to be set and
no fourth writer was added to the configuration POSTMORTEM-echo.md is about:
the audibility follows from the session that is already there.

**The beat, which is unrelated and arrived in the same breath.** Two chimes a
beat apart could hardly be told from one sound. The 90ms rest was reasoned from
the note length rather than heard, and the reasoning missed the envelope — each
note decays as `exp(-t * 18)` and is still at a fifth of its peak when the next
is due, so a rest the length of a note is filled by the tail of the note before
it. It is 300ms now, which is longer than a whole two-note chime and is
therefore the only gap in the sequence longer than any gap inside a chime,
which is what makes an ear group notes into figures.

## The argument for overriding the switch

Not loudness. A cue that a great many people have silenced by default is not a
quiet cue, it is an absent one, and *subtle* was never meant to mean *off*.

The switch is a statement about being interrupted by things you did not ask
for. A chime can only fire when you are already present in a channel, listening
to a voice through the same speaker at the same moment — so it is part of a
conversation you are having rather than an interruption of one. Suppressing it
silences the explanation while leaving the thing it explains audible: somebody's
voice appears and nothing says whose. That is worse than either consistent
choice.

Outside a channel the app holds no such session and the same call respects the
switch, which is correct there and is why the audio lab can still be silent with
the switch thrown. The behaviour is not an override; it is the ordinary
consequence of a call session, which is what this is.

## What it cost, and the shim that can bring it back

`CHIME_STALE_MS` in `app/src/audio/chime.ts` was a flat second and is now
derived from the beat. A second held the four chimes one tick can declare at a
90ms beat and stopped holding them at 300ms: the fourth would have waited
1440ms and been dropped — the recording chime, in the moment both hooks fire at
once. A constant beside `CHIME_BEAT_SECONDS` is one that has to be remembered;
one computed from it cannot drift. `chimeSpacing.test.ts` pins it against the
constants rather than a number.

The trap that remains is in SHIMS.md: `via` is the first argument `chime`'s
arity negotiation drops, so a bundle running ahead of its binary plays down the
alert path and is silent in silent mode again — the original fault wearing the
fix's clothes. `chimeArity()` reading less than four is what tells them apart,
and the answer is a rebuild.

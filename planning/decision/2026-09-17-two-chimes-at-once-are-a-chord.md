# Two chimes at once are a chord

Chimes asked for in the same tick are now played one after another with a beat
between them. Until today they were played **simultaneously**, which is worse
than the crowding it looks like.

**`AudioServicesPlaySystemSound` starts a sound and returns.** So
`fire('out'); fire('nearby')` — two statements, one tick — does not mean *these
two sounds, in this order*. It means *both of these sounds, now*. Every rule
the presence hook had about narrating a busy snapshot was written as though the
order of those calls were audible, and it was not: a room that lost somebody
and gained a nearby declaration in one snapshot heard a single unidentifiable
noise, from which neither event could be recovered, let alone both.

The ordering comment in `usePresenceChime` — *the order the room would narrate
them in* — was therefore describing something nobody could hear. It is true
now.

## The beat

One note long, `CHIME_BEAT_SECONDS`, matching `chimeNoteSeconds` in the Swift.
It is the shortest gap that still reads as a gap: each chime is itself two or
three notes at that spacing, so a rest of exactly one note is heard as the
space between two figures rather than as a missing note inside one. Longer
would start to feel like two unrelated events, which is the opposite error —
they *are* one tick's worth of news.

## Where it lives, and why not in the hook

In `chime.ts`, as a cursor saying when the speaker is next free, and every
audible call goes through it.

**Because the overlap is not one hook's problem.** `usePresenceChime` and
`useRecordingChime` are mounted side by side and know nothing about each other,
so a room that gains somebody at the moment a recording starts gets two chimes
from two hooks in one tick — and a queue inside either one could not have seen
the other. Putting it in the sound layer also keeps the hooks honest: they say
what happened, in the order it should be narrated, and are not made to care
when the speaker is free.

**The first chime is never delayed.** A cue that waits for a queue it is at the
head of is a cue that arrives late for nothing, and the overwhelmingly common
tick carries exactly one chime.

**A chime more than a second behind is dropped rather than played late.** The
queue only holds what one tick can declare, so a wait that long is not a busy
room — it is a backlog that has stopped describing the present. The roster is
already right by then, and a sound a second behind it sends somebody looking
for a change that has been on screen the whole time.

## The two halves do it differently, and that is not drift

The native side keeps the cursor against `Date.now()` and uses `setTimeout`,
because a system sound takes no start time — it plays when you call it.

`chime.web.ts` keeps the same cursor in the `AudioContext`'s own clock and
passes it straight to `oscillator.start(at)`, which is what those arguments are
in. Web Audio has been the easier half twice now, for the same reason it was
with the peak: it is asked when to start a note, where the alert path is only
ever told to start one. The cursor resets with the context, a fresh one
starting its clock at zero.

## How the beat gets judged

`AudioLabView` has a *Chimes together* section, added with this change: five
rows, each a snapshot the app can really produce — `in·out`, `out·nearby`,
`in·out·nearby`, and the two that cross the hooks, `in·recording` and
`out·recording`. No row repeats a kind, because a kind sounds once however many
people moved.

**They play through `chime.ts` rather than the native module**, which is the
whole point — the queue is what is being listened to, and `ring` beside them
calls the module directly and would play a pair as the chord this entry is
about. The consequence is that the path and lead-in rows do not apply to them,
the queue asking for the shipping ones; the peak does. The screen says so,
because a dial that silently stops applying is worse than one not offered.

The question for the ear is whether one note of silence is enough to hear two
events as two, and whether three kinds in a tick can be followed at all — if
they cannot, the rule that plays all of them is what is wrong, not the gap.

## What is not solved

**The order two hooks fire in is still their declaration order in `App.tsx`.**
Spacing them means that order is now audible, where before it was inaudible and
therefore harmless. `usePresenceChime` is above `useRecordingChime`, so a room
hears who arrived before it hears that recording began — which is the right
sentence, but it is true by line order rather than by anything that would
notice being changed.

# 2026-09-08 — The arrival is offered, not taken

Promotion is removed. **A nearby phone that sees somebody arrive now says who
arrived and offers a step in; it does not step itself in.** Everything else
about being nearby is unchanged.

This reverses the `## Promotion` section of
`2026-09-08-stepping-in-and-nearby.md`, written the same day. Nothing in it had
been heard on a device — the reversal happened at the top of
`STEPPING-IN-WALK.md`, before step 1 was run.

## What was specified, and what was built

**Automatic promotion was Rodrigo's, stated with the rest of the design** in
`98ea115`, and in that statement the trigger was speech:

> Nearby, **foreground**, other occupants begin to publish → the phone takes
> the exclusive `playAndRecord` and **the user becomes audible.**

**What shipped keyed on the arrival instead**, substituted during the build so
that the media connection had the seconds between somebody stepping in and
somebody speaking. Defensible on its own terms, and it made the automatic entry
strictly more frequent: every arrival, whether or not anyone ever spoke.

**The design document raised the objection against itself** and left it open,
under *Open, and blocking nothing yet*:

> Under this design it stops being something a person does occasionally and
> becomes something that happens automatically, mid-conversation, the moment
> somebody speaks. **The riskiest operation in the stack becomes the most
> frequent.**

That was closed by building it rather than by answering it. This is closing it
the other way.

## Why an offer

**Entering a room is not a thing the phone may do on somebody's behalf.** The
symmetry with `useAttention` is the tempting argument and it does not hold:
that hook ends a visit nobody is attending, and a departure taken wrongly costs
somebody a room they can walk back into. An entry taken wrongly opens a
microphone in whatever room the phone is in. The two are not the same risk and
do not deserve the same automation.

**The declaration already said the opposite of what promotion did.** Stepping
in nearby is somebody choosing not to claim the audio system — that is the
whole of what the word means here, and it is why another app goes on playing
and a headset stays in stereo. Undoing that choice without a tap is the design
answering a question the user had just answered.

**And the promise survives the change.** What nearby offers is that you find
out the moment the room changes. The arrival notification is what does the
reaching — this same 2026-09-08 redesign fixed it for exactly this case, having
previously suppressed it for anybody with the app open anywhere, which silenced
the one person who had asked to be told. An offer on the screen and a
notification off it are the whole of the promise; the microphone was never part
of it.

## What is left, exactly

**The detection is unchanged.** `somebodyArrived` in `app/src/state/nearby.ts`
is the same set difference over `channel.present` between consecutive websocket
snapshots — no media room, no subscription, no speech, no audio of any kind. Its
three gates are unchanged and each still earns its place:

- **`nearbyIn`** — this device declared it, so the inferred kind and a
  declaration made on another phone raise nothing.
- **`waiting`** — read back from the snapshot, so a declaration the server
  refused or one that has lapsed to *Stepped out* offers nothing.
- **The foreground** — kept, though the reason it was introduced is gone with
  the microphone. What it still buys is the second half of that behaviour: the
  roster is not recorded while the phone is away, so **the arrival is not
  consumed by the background** and the offer is there when somebody picks the
  phone up. Recording it anyway would count the new person as *seen* and the
  offer would never appear.

**`whoArrived` is the addition**, the same rule naming the people rather than
answering yes. It is held to returning empty exactly when `somebodyArrived` is
false, since two answers that could disagree would be a card naming nobody.

**The offer is state, not a screen's local memory.** `nearbyArrival` sits in
`AppProvider` beside `nearbyIn` and is cleared by everything that clears it —
entering, stepping out, being displaced, signing out — because an offer outside
a declaration is an offer about nothing. `who` accumulates while the offer
stands, so two people arriving in quick succession are one card naming both.

**It expires against the roster rather than on a clock.** `ChannelView` filters
the named people against `channel.present`, so somebody who arrived and has
since left stops being a reason to step in. A card that outlived the arrival
would be the screen contradicting the roster directly above it.

**It is not behind `controlCards`.** That setting decides whether the footer's
controls are repeated in the body. This is not a repeated control but the answer
to a question the app has just asked.

**A second button, *Stay nearby*, puts the offer away without ending the
declaration.** Answering an offer is not answering the declaration: you remain
nearby, and the next arrival offers again.

## What this deletes from the walk

`STEPPING-IN-WALK.md` step 5 was the promotion — a media reconnect made
automatic, described there as "the transition with real risk". It is gone, and
with it the reason step 7 existed: a deferred promotion at the foreground is now
a card that was already going to be drawn. Step 6 keeps its point — somebody
already there does not raise an offer — and gains a cheaper way to run it, since
B stepping out and back in is an arrival by the same rule and a second person is
not needed.

**The riskiest operation in the stack is no longer the most frequent. It is no
longer performed at all**, which is worth saying plainly: nothing in the app now
starts a media connection that nobody asked for.

## What is not decided here

**Whether the offer should reach a channel whose screen is closed.** Detection
reads the snapshot of the channel declared in, and the card is drawn on that
channel's screen; somebody looking at Home is reached by the notification
instead. The alternative — an arrival remembered so the offer is waiting
whenever that channel is next opened — was considered and declined for now as a
larger change than the reversal warranted. If the walk finds the notification
does not carry it, that is the design to write.

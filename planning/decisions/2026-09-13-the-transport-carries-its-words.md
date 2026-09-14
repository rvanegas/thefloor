# The recording transport carries its words, and the prose under it is gone

2026-09-13. Amends `2026-09-13-the-transport-is-the-player-s-row.md`, which
shipped earlier the same day and is otherwise unchanged — the row, the
variants, the order and the `icon` affordance all stand. The sentence in it
that no longer holds is *the words are still not drawn*.

## What changed

Two halves of one change, on the *Recordings* tab of a channel.

**The three transport buttons draw their word under the glyph**, as
`Button`'s `sublabel`: *Record* — *Resume* when a run is paused — *Pause* and
*Stop*. The `accessibilityLabel` is untouched and is still the longer phrase
(*Pause recording*), which a screen reader hears instead of the sublabel.

**The muted prose under the row is gone**, all four paragraphs of it: what the
previous run saved, that the channel records itself and what it is waiting for,
that you must step in to record, that you must stop the watch party to record,
and that a silenced person's microphone is still being captured.

What stays under the row is failure, in both tenses and in `styles.warning`: a
capture that stopped for a reason nobody asked for, and — new — the previous
run when it ended early. The line that reported *every* finished run went with
the rest.

## Why

The bare-glyph argument was that a shape which has meant one thing since tape
does not need a caption. That holds for a shape somebody may press, and stops
holding the moment the shape is `disabled` — which two of these three are most
of the time, by design, since pause and stop mean nothing until a run is
going. An inert grey square says neither what it does nor why it will not do
it, and what used to answer the first half of that was prose.

So the caption is not decoration for the glyphs; it is what made the prose
removable. One word apiece costs a line of the row's height and takes *what
does this do* away from the paragraphs, leaving them only *why is it grey* —
and that question turned out to be answered elsewhere in every case worth
answering:

- **What the last run saved** is the recordings list immediately below,
  which names it and gives its length. The line was the same fact in the same
  screenful.
- **That the channel records itself** is a switch in that channel's settings,
  set by somebody who was there when it was set, restated on every visit to
  the tab.
- **Step in to record**, **stop the watch party**, **silenced** — three
  refusals of the same control, each a paragraph, none of them true for more
  than a moment. The floor, presence and the party are all reported on the
  screen the person is standing on.

Four paragraphs under three buttons is a wall: read once, skipped from the
second recording onward, and in the way of the list the tab exists for.

Failure is the exception because nothing else on the screen reports it. A
recording that was not kept is not a thing to find out later — somebody spoke
on the strength of the indicator — and a run that ended early is invisible in
the list below, where it is just a short recording.

## What this costs, and what was considered

**It contradicts a standing rule in STYLE.md**: *a disabled control is
accompanied by a sentence saying why*. The rule now carries a second
exception, worded to be narrow — a row where being refused is the ordinary
condition, of which the transport is the only instance. Refusals a rule can
enumerate are still worth a sentence; a permanent condition of a row is not.

**The glyph-with-its-word-beside-it rule is intact.** Beside is still refused;
this is beneath, which is the footer's shape — a 22px glyph over its label —
and the footer is the other place in the app where several states sit in one
row and half of them are refusals. `Button`'s doc comment carries the
distinction, since `sublabel` is now doing two different jobs.

**The screen reader hears the phrase, not the word.** `accessibilityLabel` is
set whenever `icon` is, and it suppresses the sublabel line. Deliberate here:
*Pause* and *Pause recording* are the same act said twice, and reading both
would stutter. The tests that press these by name now use the on-screen word,
since `findButton` prefers drawn text to the label — which is the right
preference and is left alone.

**Considered: keeping the refusal sentences and dropping only the status
ones.** Refused. The refusals are the paragraphs that appear when a control is
grey, so they are exactly the ones somebody meets on the way to their first
recording, and they were the bulk of the wall. The greying is itself the
statement, and the word under the glyph is what makes the greying legible.

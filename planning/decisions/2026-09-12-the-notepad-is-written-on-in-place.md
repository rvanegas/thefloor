# The notepad is written on in place

2026-09-12. Supersedes the read-only half of
`2026-09-12-the-channel-screen-is-six-tabs.md`; everything else in that file
stands.

## What changed

The channel description's **editable field** — the `Field`, its markdown
preview, its help text and its character counter — moved off `ChannelSettings`
and onto the *Notepad* tab, where the rendering of it already was. The section
there is labelled **Notepad**, the same word as the tab. Settings keeps the
channel *name*, the recording setting and the ways a membership ends, and has
no description section at all: there is one place to write this, not two.

The wire is unchanged. It is still `SET_DESCRIPTION` and still `description` in
`ChannelState`, and renaming that would be a wire change for a word — see
AGENTS.md on never shipping one ahead of the client. GLOSSARY.md carries the
mismatch as an entry rather than a bug.

## Why, having decided the other way this morning

The six-tab decision moved the description onto the tab as a **read-only**
card, on the reasoning that changing it is a settings act, and Settings is a
tap away in the pinned header. That reasoning was sound about a *description*
and did not survive the tab being renamed a few hours later.

Three things converged:

- **The word.** A notepad is a thing you write on. A notepad you may read but
  must open another screen to write on is a poster. The rename was argued for
  on the grounds that the tab is *one surface the channel keeps, written over*
  — which describes the act, not just the object.
- **The neighbour.** The clipboard sits directly under it on the same tab and
  is replaced in place by anybody present, with buttons. Two sections of the
  same declared kind, one of which sends you elsewhere to change it, is the
  asymmetry a reader notices before anything else on the tab.
- **The gate travels.** The whole force of "it is a settings act" was that
  editing is guarded. It is — by `canEditChannel`, which is `hasTheRoom` — and
  that guard is a function of the channel and the viewer, not of the screen it
  is asked on. Nothing about the protection depended on the location.

**What was actually asked for, twice.** "Move channel description into notes
tab and rename it notepad" was read as satisfied by the rendering having
already moved, because it had; the session that did the rename said so and was
not contradicted. It was the field that was meant. Recorded here because the
misreading is the instructive part: *move X to Y* said of a thing that has both
a rendering and an editor is ambiguous, and the half that was already done is
the half that makes the answer look finished.

## How it behaves

**The draft is local state, and the snapshot is adopted only when there is
nothing unsaved to lose.** This is the one thing the move actually cost. On the
settings screen a `Field` could be seeded from `channel.description` once and
left alone — the screen is a modal somebody opens, edits and closes. A tab is
somewhere a person sits while snapshots land continuously; the floor's clock
alone redraws it. A field bound straight to the snapshot loses a keystroke to
each.

So `ChannelView` holds `notepad` (the draft) and `notepadSaved` (what the
channel is known to hold). An arriving snapshot replaces the draft **only if**
the draft still equals `notepadSaved`; otherwise the person typing keeps what
they typed, and writes it on blur. `notepadSaved` moves either way, so the next
comparison is against what the channel actually holds. Two tests pin it:
somebody else's edit landing mid-sentence does not steal the field, and the
same edit landing after a blur does update it.

**Saving is on blur**, as it was in Settings — where tapping *Close* straight
out of the field persisted it, which is the trap the old pair of Save buttons
set. There is no Close here, so blur is the whole of it.

**Somebody without the room reads it rendered**, rather than as markup in a
greyed box. That is a small improvement on what Settings showed them and is
what a sheet of paper does; the sentence under it says to step in. The empty
case says *Nothing on the notepad* rather than *Nobody has described this
channel*, a heading with nothing under it reading as a failure to load.

## The wrinkle that was left alone

The tab is called *Notepad* and its first section is called *Notepad*, which
reads as a stutter in the rendered text. The alternatives were worse: dropping
the section label leaves bare prose above a labelled *Shared clipboard*, which
is the "text come loose from something" the six-tab decision already rejected,
and inventing a third word for the thing the tab is named after puts the
vocabulary back where the rename found it. Left as is, deliberately, and noted
here so the next person to see it knows it was looked at.

# The channel header names Home

The channel screen's header drew a cross labelled *Close*, like every other
screen that can be opened. It now draws a house labelled *Home*.

## Why the exception is only here

*Close* is the word everywhere for a reason that is written out at the top of
`HomeSettingsView`: above the width breakpoint a screen sits in the *detail*
pane with nothing underneath it, so all its way out can do is empty the pane.
Naming a destination there would name something that is not happening.

The channel screen is the one place where a destination is a fact. Since the
tier above both lists landed on 2026-09-01, *Home* is the frame the whole
application sits inside: on a phone leaving a channel reveals it, and in a
split it is the *list* pane, already beside you and never going away. Either
way what you are looking at afterwards is Home. So the cross was saying less
than the screen knew.

## Why this is not the thing 2026-09-01 removed

That change deleted a *Home* from this header, which reads like a reversal and
is not. What it deleted was one of two labels chosen by layout — *Home* on a
phone, *Close* in the pane — with a third case where the control was withheld
altogether, because closing into a contact list that could not show a live
room would have left somebody in a call with nothing on screen saying so. The
objection was to the pair and the cases, and the fix was the tier's live bar.

There is one control now. It says the same word, draws the same shape and does
the same thing in both layouts, present or not. Nothing that argument ruled out
has come back.

## What changed

- `HomeIcon` in `app/src/ui/icons.tsx`, from `lucide/house`, vendored from
  `lucide-static@1.38.0` like the rest of that file.
- The header's `IconButton` in `ChannelView`, label and glyph. `onClose` is
  untouched: this is navigation, it does not unwatch, and it does not give up
  presence.
- The two tests that asserted no *Home* in that header now assert no *Close*.
  What they are for is unchanged — two ways out of one header is the bug they
  were written against, by whatever names.

GLOSSARY.md § *Close* and § *Home* carry the exception.

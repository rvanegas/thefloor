# The ghost button is retired

`Button` has four variants: `default`, `primary`, `floor`, `danger`. The fifth,
`ghost` — transparent fill, `textMuted` label, 40pt instead of 48 — is gone,
and its forty-seven call sites across ten screens are now `default`. The
`buttonGhost` style went with it, so every button in the app is the same height.

## Why the most-used variant was the one to remove

It was by far the most used, which was the argument for keeping it and turns
out to be the argument against. Cancel, dismiss, every alternative, most chrome:
a variant that two thirds of the app's buttons reach for is not a variant, it is
the default wearing a name — and the real `default` had become the marked case,
used where somebody had a reason to insist.

What it bought was a third way for a control to be quiet, on top of two that
were already there and are better at it: a button with its padding taken in,
sitting in a row of text (`cardPing`, `reachAction`), and `IconButton`, which is
a glyph on nothing. Both say *this is not what the screen is for* by size and
place rather than by fill, and neither needed `ghost` to do it — the rule in
STYLE.md even said "a `ghost` at those numbers", where the numbers were always
the half doing the work.

## What changed at the call sites

Most were the prop and nothing else. Four were conditional — `gone ? 'primary' :
'ghost'` and its kin — and became `'default'` in the same shape. One,
TranscriptView's *Remove from transcript*, had a variant that flipped with its
own label; with both branches now `default` the prop is gone entirely, and the
label carries it, which it was always doing better.

**`IconButton` keeps the transparent tone and did not come with the retirement.**
It is not a `Button` variant and never was: a header control is chrome, and
chrome in a filled rectangle is a second button competing with the screen's own.
Its own component holds its own tone.

## What it costs

Buttons that were 40pt are 48. The two tightened in-row shapes keep their height
— `minHeight: 0` is in their own style, which wins — but they now carry
`surfaceRaised` where they carried nothing, so a *Ping* or a *Copy* at the end
of a row of text is a visible chip rather than a bare word. That is the change
somebody will notice first, and it is the intended one: those controls are
tappable, and a bare word that happens to be tappable was the ambiguity
HomeView's cards had already been moved off `ghost` to avoid.

No behaviour changes and nothing is renamed, so no shim and no wire concern.
GLOSSARY.md loses *Ghost* in both halves, the term having stopped existing.
Two decision files still describe controls as ghost buttons; they are dated
history and were left as written.

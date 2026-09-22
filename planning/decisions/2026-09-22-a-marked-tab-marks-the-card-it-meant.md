# 2026-09-22 — A marked tab marks the card it meant

When an answered help question puts a dab on Home's *Support* tab, the *Help*
card behind that tab now wears one too. Same disc, same word — a screen reader
hears "Support, answered" on the tab and "Help, answered" on the card — and
both are drawn from one condition, `useAnswerWaiting` in `HomeView`.

**The mark stopped being enough when the tab stopped holding one card.** A dab
says *go and look*, which is all a tab can say and is a complete instruction
while there is one thing to look at. Support holds four cards now — Help, Chip
in, the standings and the audio bench — and three of them are plausible things
for a mark to have been about. So the tab was sending people to a screen where
nothing was marked, and turning a direction into a search. The tab points at
the tab; the card points at the answer; `HelpView` clears both by being opened.

**Two marks for one fact, never two facts.** The `answered` the switch draws
from is the `answered` the card draws from, so nothing new is remembered and
the read that takes the tab's mark off takes the card's off in the same frame.
The failure this rules out is the one that would make the marks worth less than
nothing: a marked tab opening onto an unmarked screen, or a marked card under
an unmarked tab. A button wearing a dab of its own, about something no tab is
marked for, would be this mark meaning a second thing — it is not available for
that.

**`Button` gained `badge`, which is `Segmented`'s prop with `Segmented`'s
contract**: a string rather than a boolean, so the mark cannot exist without
the words a screen reader is given, an `!` being a shape rather than a
sentence. The disc itself moved into one `Dab` in `components.tsx` that both
callers render, and `segmentLabelBox` is `dabAnchor` now — the geometry is the
same because the two labels are the same shape, a word centred with whitespace
on its leading side. A badged `Button` spells its `sublabel` back into the
announcement, since naming the button would otherwise silence the line under
it; no caller does both yet, and the day one does it would have failed
silently.

**The contact mark is untouched and stays asymmetric.** A request to answer is
live state on the Home snapshot and clears itself, and the Contacts tab leads
to a list where the requests are enumerated by a section of their own — there
is nothing behind it to mark. Only the Support mark needed a second half. See
`state/helpSeen.ts`, which argues the watermark, and STYLE.md § *Dots, pills
and rules*.

**The debug override covers all three marks**, which is the half of this that
could have rotted quietly: *Show every dab* has to show every dab, so it sits
inside `useAnswerWaiting` rather than beside the tab's badge. A preview that lit
the tab and not the card would be a preview of a state the app never has, and
the override is the only way anybody looks at these marks at all.

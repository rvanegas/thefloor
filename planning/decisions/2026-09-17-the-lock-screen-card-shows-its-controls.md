# 2026-09-17 — The lock screen card shows its controls

The same day as *The lock screen carries two controls*, and a correction to how
it drew them. The card now reads: **channel name, *Open*, microphone glyph.**
It used to read: channel name, "Your microphone is muted", *Mute*.

## The word was the most expensive thing on it

A lock screen card is about four inches of a row. The old one spent it on a
sentence and a label that were the same fact twice — *muted* under the name and
*Unmute* on the button — leaving the card with no room for the control that was
actually missing.

The glyph is what the app already leads with: `FooterAction` puts `MicIcon`
above the word, and a struck-through microphone is the one piece of this
vocabulary a new reader arrives already holding. So the button is the glyph
alone, the sentence is gone, and the word survives as the button's
`accessibilityLabel` — which is STYLE.md § *Accessibility*'s standing rule that
a glyph's label is the word it replaced, not a concession.

Nothing about the derivation changed: the glyph strikes through on *you are not
being heard*, folding in a device with no input, exactly as the label flipped.

## Open was always there and could not be seen

`widgetURL` has made the whole card a way back into the channel since the card
existed, and the previous decision names that tap as the thing that stands in
for the sentence a disabled button cannot carry. That argument only works if
somebody knows the tap is there. *The whole card is a button* is a convention
you have to have been taught, and the reader who most needs a way back into the
app is the one who has used it least.

So the card carries a `Link` to the same deep link, labelled *Open*, and the
card-wide tap stays. Two affordances for one destination is the ordinary
arrangement for a surface whose primary gesture is invisible — the button is
not a second way in, it is the first one made legible.

**A `Link` rather than a second `widgetURL`**: a card has one of those and it is
the tap on everything else. The link is also the only control that works below
iOS 17, needing no `Button(intent:)`.

## The glyph is transcribed, like the palette and unlike a symbol

`MicShape` is `lucide/mic` and `lucide/mic-off` written out as a SwiftUI `Path`
on the same 24-unit box and 2-unit stroke `icons.tsx` uses. `mic.slash.fill`
was sitting right there and is the thing this deliberately does not use: the
palette is transcribed rather than imported for want of any other option, and
an icon is the part of a surface read without being read, so a second
microphone shape would have been the most visible of the drifts this file keeps
warning about. Same rule as the colours — change one, change both.

The one Swift detail worth keeping: the SVG arcs are `addRelativeArc` sweeps, a
signed delta, rather than `addArc(clockwise:)`. The flag's sense is inverted by
SwiftUI's y-down space, and getting it backwards draws the reflex arc — a bug
that is invisible in review and obvious on a phone. A delta cannot be read two
ways.

## The Dynamic Island followed

Both controls moved into the expanded `.bottom` region, in the card's order,
with the name above. They were `.leading` and `.trailing`, which is where an
island puts an icon and a badge rather than a pair of buttons — and the leading
one was a third microphone glyph, drawing what the trailing button already
drew. Compact and minimal are unchanged in substance: one `floor`-tinted
microphone, now the transcribed glyph rather than the SF Symbol.

## What was checked

`swiftc -typecheck` against the iphoneos SDK at `-target arm64-apple-ios17.0`,
over the three widget sources with `LOCKSCREEN_WIDGET_EXTENSION` defined, which
is the extension's own view of the code. The geometry itself is unverified
short of a build on a device: the arc centres and sweeps are computed from the
lucide path data rather than eyeballed, and each one's radius was checked
against its endpoints, but nobody has yet looked at the card.

`Palette.muted` is gone with the sentence that spent it, per the rule that only
the tokens the card spends are transcribed.

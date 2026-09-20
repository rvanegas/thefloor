# The look of it

What this application looks like, and why — the tokens, the controls, the
shapes a screen is built out of, and the handful of rules that keep six
screens reading as one thing.

**Standing rather than temporary.** It describes what is built, so it is
maintained alongside the code the way GLOSSARY.md is: when a control changes,
this changes in the same commit, and when the two disagree one of them is a
bug. GLOSSARY.md is the source of truth for *what a word means*; this is the
source of truth for *what a thing looks like*. Neither settles the other.

**Read a section, not the file.** The index below says what each answers. The
common ones are § *Colour* and § *Controls*; the one most often wanted and
least often found is § *The rules that are actually load-bearing*, at the end,
which is the eight things somebody breaks by accident.

The authority for every number here is the code, and the code says why: the
style blocks in `app/src/ui/` carry the reasoning in comments, at length. This
file is the map over them, so a session can find the rule without reading
seventeen thousand lines of view. Where a number appears here it is repeated
from `app/src/ui/theme.ts` or a named style block, and **that file wins**.

## Contents

| § | Answers |
| --- | --- |
| *Where it all lives* | which file to open for what |
| *Colour* | the seventeen tokens, the two palettes, which colour may mean what |
| *Type* | the six roles, and every place something departs from them |
| *Space, shape and width* | the 8pt grid, the radii, the measure, the breakpoint |
| *Controls* | Button, IconButton, Field, Checkbox, Segmented, FooterAction — and when a set of choices stops being a row |
| *Cards and rows* | the card, its tinted states, packed rows against spread ones, when a card that repeats the footer stops earning its place |
| *Dots, pills and rules* | the small marks, and what each diameter means |
| *The shape of a screen* | Screen, the keyboard, the pinned header, the pinned footer, the film that is pinned or floating, the two shapes of the watch body, split panes, the one screen that overlays its chrome |
| *Icons* | vendored Lucide, the one grid, the one stroke |
| *Feedback and motion* | why there is no animation, and what stands in for it |
| *Words on controls* | labels, busy states, confirmations, empty states |
| *The lock screen card* | the one surface outside the app, and what it transcribes |
| *Accessibility* | the roles, the targets, the states not spelt into labels |
| *The rules that are actually load-bearing* | the nine things to not break |

---

## Where it all lives

Everything visual is under `app/src/ui/`. There is no stylesheet, no theme
provider, and no component library.

- **`theme.ts`** — the two palettes, `spacing`, `radius`, `measure`, `type`,
  and the two clock formatters. The one file that defines a colour.
- **`cssVariables.web.ts`** — the same palettes, emitted as CSS custom
  properties. Generated from `theme.ts`, never written by hand.
- **`appearance.ts`** — light, dark or system, applied to the window.
- **`components.tsx`** — `Button`, `IconButton`, `Field`, `Checkbox`, `Screen`,
  `Card`, `SectionLabel`, `Segmented`, `Empty`, plus the recording row and the
  transcript search that are shared between screens.
- **`icons.tsx`** — the sixteen glyphs, as vendored Lucide path data.
- **`layout.ts`** / **`Panes.tsx`** — the breakpoint, the list width, and which
  pane a subtree is in.

`links.ts` is not a style file and is named here only because it was
`markdown.tsx` until 2026-09-13: the notepad is plain text now, so the inline
parser and its rendered bold, italic, code and links went with it. Nothing in
this app renders markup any more.

Per-screen styles live in that screen's own `StyleSheet.create` at the foot of
the file. A style that two screens need moves into `components.tsx`; a style
that two screens *coincidentally* share is stated twice, deliberately — see
Home's `nearbyBar`, which is a copy of `liveBar` rather than a variant of it,
on the grounds that they are two states rather than one state at two
strengths.

---

## Colour

### The tokens

Seventeen, and no component invents an eighteenth. Every one has both a light and
a dark value; `theme.ts` builds the map by mapping the keys, so a token added
to one palette and not the other fails to compile.

| Token | What it means |
| --- | --- |
| `bg` | the page |
| `surface` | a card, a field, a pinned bar — the layer above the page |
| `surfaceRaised` | the default button fill, a selected segment, the footer's accent disc |
| `border` | every hairline and every card edge |
| `text` | body and headings |
| `textMuted` | a second line, a status, a disabled segment's label |
| `textFaint` | 12px labels, and a refused control |
| `placeholder` | a field's placeholder, and nothing else |
| `floor` | **the accent**: the floor, and the room you are standing in |
| `floorDim` | the accent as a fill, under dark text |
| `nearby` | within reach, and not in the room |
| `nearbyDim` | the same, as a fill |
| `silenced` | being muted by somebody else's claim; also a warning |
| `recording` | the recording dot |
| `danger` | a destructive button, an error line |
| `waiting` | something is waiting for you: the Home dab, and a live invitation's edge |
| `success` | a status line that is good news |
| `disabled` | the fill under a refused control |

`recording` and `danger` are the same red and are two tokens on purpose: they
mean different things and one of them may move.

**`waiting` is a different red from both, and the difference is measured.**
`danger` is H 4 S 77 V 94; the two accents a dab has to sit beside are `floor`
at S 64 V 100 and `nearby` at S 45 V 91. **Saturation is what makes a red read
as an alarm here, not hue** — so `waiting` takes the mean of the two accents,
S 55 V 95, which puts it in their register and out of the alarm's. H 352 rather
than red's 4, because `silenced` holds 20 and rose is the one direction out of
red that is unclaimed. The light value is S 65 V 82, the same arithmetic against
the same two neighbours at this palette's own lower register.

Its whole job is **to not mean error**. A contact request and an answer come
back are both good news arriving slightly inconveniently, and a mark in
`danger`'s red reports a fault in an app that has none.

### The two palettes are not inversions

`light` is a separate set of values, pinned by contrast rather than by
arithmetic. Two departures matter and are the ones a "simplification" breaks:

- **`surface` is white and `bg` is a tinted grey.** In dark, surfaces lighten
  as they come forward; in light they cannot, because a white card on a white
  page is invisible. So the page darkens instead.
- **`surfaceRaised` goes darker, not lighter.** It is the default `Button`
  fill; following `surface` to white dissolves every default button into the
  card behind it.

Four saturated tokens are used as *text* — `silenced` on warnings, `success`
and `danger` on Home's status line — and each fails on a light background at
its dark value. `#32D583` on white is under 2:1. That is why the light palette
has its own greens, oranges and violets rather than reusing the dark ones.

### How a component gets a colour

It reads `colors.foo` and never asks what scheme it is in. The value is
opaque: `DynamicColorIOS` on iOS, `var(--floor-foo)` on web, the light literal
on Android and in jest. The platform resolves it at draw time.

**This is why there is no theme context and no `useTheme()`.** The two dozen
module-scope `StyleSheet.create` blocks capture these once at import and stay
correct, because nothing in JavaScript ever knew the colour. Adding a context
would mean a `makeStyles(c)` and a `useMemo` in every component, to re-render
for something the platform already re-renders by itself.

**Where no scheme can be resolved, the answer is light** — Android, jest, a
browser that has never heard of `prefers-color-scheme`. Light is what a
surface with no opinion looks like everywhere else.

### The economy of colour

This is the rule that gets broken, and it is not about accessibility. **The
app spends colour on almost nothing, so that what it does spend it on is
read.**

- **Violet is the floor.** The one distinguishing mechanic gets the one
  accent — the room you are standing in, the person holding the floor, the
  control that claims it. Nothing else may take it. A selected segment is
  deliberately *not* accented: purple is what this app spends on a room
  somebody is in, and a selected tab competing with that would be the quieter
  fact shouting louder.
- **Blue is nearby.** Its own hue rather than a dimmer violet, because being
  in a room and being within reach of one are different states rather than two
  intensities of one. Paler than the accent, because nothing is happening to
  you.
- **Orange is being silenced by somebody else.** Warnings borrow it.
- **Red is a recording, a destructive button, or an error** — and **rose is
  something waiting for you**, which is the seventh hue and the newest. The
  two are separated by saturation more than by hue: see § *The tokens*
  on `waiting`, and rule 1 below, which had to be amended to admit it. It is
  spent in two places, the Home dab and the edge of a live invitation, and
  they are one meaning rather than two — which is the test a second use has to
  pass. A hue is claimed by a *meaning*, not by a widget.
- **Green appears on one status line.**
- **Everything else is greyscale**, including every control that is merely
  available.

Grey is also this interface's word for *refused* — a disabled footer action,
a greyed button. Which is why a state you are *in* is accented and inert
rather than disabled: greying the rung you are standing on would say the
interface had stopped you doing the thing you have already done.

Self-muting is deliberately **not** coloured: a hollow grey dot, because
muting yourself is not an alarm and is not the floor silencing you. It reads
as absence of transmission.

---

## Type

Six roles in `theme.ts`, and they carry their own colour:

| Role | Size | Weight | Colour |
| --- | --- | --- | --- |
| `title` | 28 | 700 | `text` |
| `heading` | 17 | 600 | `text` |
| `body` | 15 | — | `text` |
| `label` | 12 | 600, tracked 0.8, uppercased by `SectionLabel` | `textFaint` |
| `muted` | 13 | — | `textMuted` |
| `mono` | 15 | — tabular figures | `text` |

There is no font family. The system face everywhere, at one weight axis of
three: regular, 600, and 700 for a title. Monospace appears in exactly two
places, both of them machine text rather than prose: the configuration error
on `AuthView`, and the whole of `AudioDebugPanel`.

### The departures, all of them

These are the sizes that are not in the table, each because of where it sits:

- **16** — a `Field`'s text, and a recording's name: a step above `body`,
  because what somebody is typing and what they named it are the subject of
  the row rather than a line in it.
- **20** — the channel name in a pinned header. Not `title`'s 28: a large
  title is something a scroll is entitled to at its top, and a bar that rides
  above every screenful is not.
- **19** — the `+` glyph in Home's and Contacts' 28pt circular mark, with an
  explicit `lineHeight: 21` because the glyph's box is taller than its ink.
- **14** — a segment's label when it stands alone.
- **11** — a segment's or footer action's label when a glyph sits above it.
  The smallest type in the application, and the one place it is right: the
  glyph has already said it, and the pair is what gets read.

### Two typographic rules with meaning

- **Italic means nothing, and a derived title is drawn as a name.** A channel
  nobody has named is listed and headed by a description of its roster, in the
  same upright body as a name — no italic, no dimming. Until 2026-09-13 the
  italic meant *not a name*, on the argument in `core/naming.ts` that the
  description is written from one viewer's side and is not the string the
  others see. That argument is sound and a slant cannot make it: it reads as
  emphasis to anybody not taught the rule, and since most channels have no
  name it was emphasising the majority of every list. **Where the difference
  is actionable it is said in words instead** — the name field in Channel
  Settings carries the derived title as its `placeholder`, so what is yours to
  type and what is standing in for it are told apart by which one is editable.
  The general rule it leaves behind: **a distinction that changes what
  somebody would do belongs in the one place they would act on it, not spread
  across every screen that mentions the thing.**
- **Anything that counts gets `fontVariant: ['tabular-nums']`.** Clocks,
  durations, character counts, a button's sublabel. Without it the row
  reflows as the digits change.

`formatSeconds` renders `47s` and `formatDuration` renders `mm:ss`. The split
is not cosmetic: the two floor clocks are bounded under a minute by
construction, so a leading `0:` would be a digit that only ever says zero.
Everything unbounded — recordings, playback — keeps the clock.

---

## Space, shape and width

**`spacing(n)` is `n × 8`,** and fractions are used freely: `0.25`, `0.5`,
`0.75`, `1.25`, `1.5`, `1.75`, `2.5` all appear. The grid is 2pt in practice
with 8 as its unit of thought.

**`gap` rather than margins**, everywhere it will serve. A list is
`{ gap: spacing(1) }` and its rows carry nothing. Margin appears where
something has to push away from a thing it is not a sibling of — a search
field above a list, a section label under a card.

**`radius`** is `sm: 8`, `md: 12`, `lg: 16`, `pill: 999`. A card is `lg`, a
button and a field are `md`, a segment is `sm`, an indicator is `pill`.
Circular marks compute their own radius as half their size.

**Hairlines are `StyleSheet.hairlineWidth` in `border`;** card and state edges
are a full `1`. The distinction is real: a hairline separates two regions of
chrome, a 1pt border draws an object.

**`measure` caps a column at 620pt** and centres it — `{ width: '100%',
maxWidth: 620, alignSelf: 'center' }`. `Screen` applies it to every scroll in
the app, and a pinned header applies it to its inner row. It is inert on every
iPhone and binds on an iPad, in a pane, and in a browser. 620 rather than a
round number because `server/src/html.ts` sets `max-width: 38rem` on the
public pages, and one measure across the product beats two defensible ones.

**A full-bleed edge stays full-bleed.** A header's hairline and a footer's
fill run to the window; only their contents are capped. An edge that stops
short of the window is not an edge.

**The breakpoint is `SPLIT_AT = 800`** and the list pane is a fixed
`LIST_WIDTH = 340`. Fixed rather than fractional, so every point above the
breakpoint goes to the conversation. The test a breakpoint has to pass is that
**the detail pane must never be worse than the phone screen it replaced**: 800
leaves it 460, wider than the widest iPhone. It is width, never
`Device.deviceType` — a window dragged to a third of an iPad is a
phone-shaped surface, live, while somebody watches.

---

## Controls

### Button

One component, five variants, no size axis.

| Variant | Fill | Label | For |
| --- | --- | --- | --- |
| `default` | `surfaceRaised` | `text` | anything ordinary |
| `primary` | `text` | `bg` | the one commitment on a screen |
| `floor` | `floor` | white | claiming or releasing the floor |
| `danger` | `danger` | white | delete, and nothing else |
| `ghost` | transparent | `textMuted` | cancel, dismiss, and header actions |

48pt minimum height, 40 for ghost. `radius.md`. The label is 15/600; an
optional `sublabel` is 12 with tabular figures. Disabled swaps the fill to
`disabled` and the text to `textFaint`.

Ghost is by far the most used, which is the shape of the app: most controls
are exits, alternatives and chrome, and each screen has at most one `primary`.
`floor` appears once in the whole codebase, on the introduction's *Claim the
floor*. It was three until 2026-09-13, the other two being the floor card's
Claim and Release; the card is gone and the footer draws its own icon rather
than a `Button`.

**A button may carry a glyph instead of its word.** `icon` is a callback handed
the variant's foreground colour, and it is drawn where the label would be; the
label stays required and becomes the `accessibilityLabel`, so the word survives
for a screen reader and for the tests that press controls by name. Instead of
the word, never beside it — a shape with its own caption is teaching what the
shape already says. The recording transport on *Recordings* is the only user:
three of them, `primary` then two `default`, in the `buttonRow` / `flexButton`
row the player's transport is built from, which is the point of drawing them
this way. See § *TransportAction is gone*.

**Never beside it, but since 2026-09-13 under it**, and only there: the same
three buttons carry *Record* — *Resume* when a run is paused — *Pause* and
*Stop* as a `sublabel` beneath the glyph. The caption rule holds for a shape
somebody may press and fails for one that is grey, which two of these three
usually are; an inert square says neither what it does nor why it will not,
and what used to answer that was four muted paragraphs under the row. The word
is what made removing them affordable, so the two changes are one. It is the
footer's shape — glyph over word — for the same reason: a row where half the
slots are refusals. The `accessibilityLabel` is still the longer phrase
(*Pause recording*), and drawing a `sublabel` does not silence it.

**A button inside a row of text is tightened rather than made a new
component** — `{ paddingVertical: spacing(0.5), paddingHorizontal: spacing(1),
minHeight: 0 }`, via the `style` prop. ChannelView's `cardPing` and
ProfileView's `reachAction` are the same numbers deliberately. Anything that
needs to be less than a button is a `ghost` at those numbers, not a new fill.

**A choice of more than three goes down the page rather than across it.** Two
or three `Button`s at `flex: 1` in a `choices` row is what every yes-or-no and
the three schemes on Floor Settings use, and it stops working at four: a
phone's card is about 280pt inside its padding, so a fifth of it is 45pt and
any word longer than *Loud* truncates — a ladder whose rungs are half-spelt is
a puzzle. Beyond three, stack full-width buttons, one per rung, the `primary`
fill marking the one in force. ChannelSettingsView's `NotificationLevelPicker`
is the pattern, and the only one left (four, with a `sublabel` each): the chime
loudness on Floor Settings was the second — five, bare — for the day that
setting existed, and the arithmetic above is what decided its shape. It is the
same arithmetic § *The pinned footer* makes about five slots in 620.

### IconButton

44 × 44, which is the touch target, with the glyph drawn at `textMuted` —
`textFaint` when disabled. It takes an `accessibilityLabel`, which is the word
the glyph replaced, and an `icon` callback handed the colour. It lives in
headers.

**One place it lives outside a header, since 2026-09-13**: the cross that puts
away a rung of the *introduction*, one per row on the Getting started card. It
is the same `CloseIcon` saying the same thing — *not this*, about the row it
sits on — drawn at 16 rather than 22 and with the padding stripped, because it
sits beside a line of text rather than in a bar and the default box would push
the disc and the label further apart than two rungs are. Its accessible name
carries the rung: *Dismiss Bring in a guest*, not *Dismiss*, since a card of
seven identically named controls is one nobody can navigate. It sits outside
the row's `accessible` group, which would otherwise swallow it.

### Field

A `TextInput` on `surface` with a 1pt `border`, `radius.md`, 16pt text, 48pt
minimum. `autoCorrect` is off everywhere.

The details that took work and should not be undone:

- `returnKeyType` is withheld on a number pad, which has no return key —
  asking anyway makes iOS float a detached "Go" pill over whatever is on
  screen.
- `multiline` grows to 108pt, aligns text to the top, and takes a newline on
  return: in prose a line break is content, so `onSubmit` is ignored there.
- `editable={false}` greys the field to read like the disabled buttons beside
  it. The caller is expected to say why underneath — which is what every
  disabled control in this app does.

### Checkbox

A 22pt square at `radius.sm` with a 1pt `border` on `surface`, its sentence
beside it in `type.muted`; ticked, it fills with `text` and draws a 16pt
`CheckIcon` in `bg` — the `primary` button's tone and not a new one. The row is
44 tall, the label is part of the target, and the whole thing is one accessible
element with `accessibilityRole="checkbox"` and `checked` in its state.

**One user so far, and the shape is the reason there is a component at all**:
the marketing opt-in on the sign-in screen, offered to somebody signing up and
to nobody else. The same permission on *Floor Settings* is an On/Off pair of
buttons like every other setting there, and the difference is the point — a box
is a question nobody has answered yet, a pair is an answer in force. Every other control here either has
a value in force already — a `Segmented`, a ladder of buttons — or is a
commitment somebody presses once. A permission is neither: it has to start
clear, stay clear if nobody touches it, and read as unticked rather than as
*off*, which is a distinction a switch cannot draw.

**Not the violet.** `floor` is spent on the floor; a box borrowing it would be
a second thing on the screen claiming to be the mechanic. See § *The economy of
colour*.

### Segmented

One track on `surface` at `radius.md` with 3pt padding and 3pt gaps; the
selected segment is *raised* into `surfaceRaised` rather than coloured, for
the reason in § *The economy of colour*.

**One row or two, and never a scroller.** A set splits when its segments would
come out under `MIN_SEGMENT` — 90 points, which is what a word needs — and it
splits *balanced* rather than filled: six is three and three, five is three
and two. Two rows maximum, a caller wanting a third wanting a menu. A strip
that drags sideways would break the same rule the footer is built on: a tab
you have to find by dragging is a tab most people never learn is there.

**It was a count until 2026-09-20 and is a width now**, which changes nothing
on a phone and one thing everywhere else. *Four per row at most* argued its
own case in points — a fifth on a phone leaves each of them about forty — with
a phone's width assumed throughout, so the channel screen's six tabs were two
rows deep on a 740-point iPad pane where they would have fitted in one, and
the row they did not need came out of the watch card's fold. 90 is the old
rule's own tolerance read off the phone it was written for: four across 393
are 98 points each and were allowed, five are 78 and were not. `segmentRowsFor`
in `ui/layout.ts`; `segmented.test.tsx` pins every count on a phone against
what the count rule did.

An option may carry an `icon`, drawn at 22px in a 24pt box above an 11pt
label — the footer's construction, not a second one. **A caller gives every
option an icon or none**; a row with a gap in it draws two heights of segment.

**Two things wear this shape, and `role` says which.** `tabs`, the default,
swaps the body of the screen — the two tab strips. `choice` answers a
question that is already on the screen: the watch card's *Watch on*, whose
segments are answers rather than ways to somewhere else. The difference is
not decoration — a screen reader is told `radiogroup`/`radio` and `checked`
rather than `tablist`/`button` and `selected`, and somebody who cannot see
the track has nothing else to tell a switch from a tab bar. `findChoice` in
the view harness is the matching finder, `findButton` and `findTab` deliberately
seeing neither.

**A `choice` carries its question as a line of `type.muted` above the track**,
not beside it: two segments and a lead-in do not fit across a phone, and a
label that wraps or truncates is worse than a line of its own. **It may show
neither answer as chosen**, which is the state before anybody has answered —
a switch that guessed would be a control reporting a state the app is not in.

**`disabled` refuses the whole control and fades only the words.** The track
and the raised segment stay exactly as they are, because what is chosen has
to go on being legible while it cannot be changed — `colors.disabled` behind
it, which is what a `Button` does, would take the answer away with the
control. Never per-option: a set with one answer left is not a choice and
must not be drawn as one. A caller says why in a sentence beside it, as § *Words
on controls* requires of every disabled control.

### FooterAction

Deliberately not a `Button`: a row of filled rectangles would make the bar
heavier than anything it sits under, and the state here is carried by the
icon's colour rather than by a fill. It is a 22px glyph over an 11pt
label, both taking one colour, inside a 54pt round disc that appears when the
control is accented.

The colour is the state, in precedence order: `selected` (the rung you are
standing on) → `disabled` grey → `silenced` orange → `active` violet → plain
`text`.

Two shapes worth knowing:

- **Accented and inert is not disabled.** A state you are already in is
  violet and unpressable; a refusal is grey.
- **`repeatable`** is the one combination that escapes that — *Nearby*, where
  tapping the lit rung restarts its clock. Nothing distinguishes it visually,
  deliberately: a fourth appearance for one slot would be teaching the bar a
  word nobody is looking for.

The disc is a fixed 54pt box whether or not it is filled, so the bar never
changes height; `minWidth` equal to the height makes it a circle for short
labels and a pill for long ones.

### TransportAction is gone

Removed 2026-09-13, the same day it was added, and named here because the
argument it lost is worth not re-running.

It was a bare 22px glyph in a 44pt target, three in a row at `spacing(0.5)`,
left-aligned and unfilled, on the reasoning that a transport is one object
read and reached for as a group, that the shapes are the vocabulary, and that
a fill would make three verbs on one object look like three sections. All of
which is true of a transport in isolation, and none of which survives the
screen it was on: one tab away, the thing that starts, holds and moves the
shared track is three filled `Button`s in equal thirds across the width, and
the recording transport is the same act on the same channel. Two constructions
for one gesture is the cost the argument did not price.

So the row is now `buttonRow` + `flexButton` with `Button`'s `icon`, which is
the affordance that pass really wanted — the glyphs were right, the third
control type was not. What carried over: all three present always, in the
order start, hold, end, so the positions never move and the irreversible one
is last; and no RECORDING label over them, the header's pill being where the
state of the run is reported.

**The card came back later the same day, and the label did not.** Dropping
both was one move, and only half of it was about the label: a `Card` is not a
heading, it is what everything on this screen that is a thing sits on, and the
row that had just been argued into being the player's row was the one thing
left loose on the background. It now sits on `surface` with its failure lines
under it, exactly as the shared track's transport does one tab over. The list
of recordings stays outside it, being its own section.

---

---

## Cards and rows

**`Card`** is `surface`, `radius.lg`, a 1pt `border`, `spacing(2)` padding.
It is the default container for everything that is a thing rather than a line.

**A tinted card is a state.** The pattern is a `*Dim` fill with the matching
full-strength border: `floorDim` + `floor` for the room you are in, `nearbyDim`
+ `nearby` for one within reach. Home's live bar, Home's nearby bar and a
profile's live channel all wear it, and they are the same four lines each time.

**Three wearers, not four, since 2026-09-15** — and what left is the worked
example of the pattern's one failure mode. Home's live invitation wore
`floorDim` + `floor` too, which meant Home drew two cards in identical paint,
eight rows apart, saying two different things: *you are standing in this room*
and *you were asked into a room somebody else is standing in*. The tint is
spent on the state, so two states may not share one. It now takes a
`colors.waiting` border and no fill at all, which is also the cheaper half of
the rule below — **a tinted card is a state, but a state need not be a tinted
card.** A border in the hue that already carries the meaning says which kind of
thing a row is without competing for the one tint on the screen that is
allowed to shout.

**Fill and border are two different questions on a roster card.** The border
means *speaking*, driven by the room; the fill means *holds the floor*, driven
by the reducer. They routinely disagree — a holder sitting silent, a
self-muted person whose claim is running — so they may not share an edge.

**A card that gains a border in one state keeps a transparent one in the
others.** Otherwise the state card is two pixels larger than its neighbours.
ProfileView's `channel` and Home's `inviteQuiet` both do this.

**A card of many items asks for one of them.** There is one such card —
Home's introduction, since 2026-09-13 — and it is the pattern to copy rather
than to invent around: the item being asked for is drawn whole, the items
behind the reader are a title each in `textMuted`, and the rest are behind a
ghost *See more* at the foot, which says *See less* while it is open. The
disclosure is **shut on every mount** and remembers nothing, because a card
read on the way past is asking *this one next*, and one that stayed open would
be the wall again on a screen somebody opened for another reason. The items
keep their order in every state; a card that reshuffles as things are ticked
is a different card each time it is read.

### Rows pack or spread, and it means something

- **Packed** (`flexDirection: 'row'`, `gap`, no `justifyContent`) — the
  children are one phrase. The `+` mark and "Start a conversation"; a contact's
  name and status.
- **Spread** (`justifyContent: 'space-between'`) — there is a control on the
  end. A request row with Accept and Decline; an address with Copy beside it.

In both, the text block is `{ flex: 1, gap: 2 }` — named `rowMain`,
`cardText`, `headerMain` or `reachWho` depending on the screen — so a long
name truncates rather than pushing the control off the edge. **The text is
always what gives.**

`flex: 1` is for the *main axis*. In a column it sets `flexBasis: 0`
vertically and collapses a self-sizing card to its buttons; Home keeps a
separate `noticeMain` with no flex for exactly that reason.

### The cards a footer made redundant

Adopted 2026-09-13, after the channel screen spent a fortnight saying
everything twice.

A pinned footer and a card can offer the same act, and for a while that was
defended as a division of labour: the bar is where the act is quick, the card
is where the state is explained. **That holds only while the card is actually
explaining something.** The channel screen's four — the floor, the microphone,
Step in, Step out — each began with sentences under the button and each lost
them one at a time, to a roster card that says whose minute it is, to a bar
whose accent says which rung you are on, and to editing that decided the
sentence was saying it twice. What was left was a button with a heading over
it, one scroll below the same button.

So the rule, which is a question to ask of any card that repeats a pinned
control:

- **If the card is a button and a sentence, keep both.** It is the bar's
  explanation, and an icon that greys with no reason given is the one shape a
  control may not have.
- **If the sentence goes, the card goes.** A heading and a button are not an
  explanation; they are the footer at the wrong size and in the wrong place.
- **If the button goes and the sentence stays, keep the card and drop the
  button.** That is a readout, and a readout is not a repetition of anything.
  *Your microphone* was the survivor of the four on exactly this ground.

**And then ask the same question of the sentence, which is the step that was
missed.** Adopted 2026-09-15, when *Your microphone* went too. A sentence
earns the card only while it is the *only* thing saying what it says, and the
rest of the screen goes on changing after the card is settled. Three of that
card's four explained a state the footer had learnt to tint and the roster
had learnt to suffix — `· muted`, `· has the floor` — so the card was the
third place, not the first. A readout is not exempt from the rule that made
it a readout.

**A readout must not be gated on a preference about repetition.** This is what
the rule costs and it is worth saying on its own: `hideControlCards` hid the
cards that repeated the bar, and the moment a card stops repeating anything
that setting has no business reaching it. The audio diagnostic panel had to be
given a card of its own for a while to escape exactly this, which is the
symptom to watch for — when the exceptions to a setting outnumber what it
governs, what it governs has gone.

**What survives has no second home** — and on 2026-09-15 that came down to
two sentences and one card, none of them about a control.

The surviving card is *Audio*, and it is drawn **only when the audio is not
working**: connecting, dropped, refused, unconfigured, failed. A conversation
that has silently stopped arriving is the one thing neither the bar nor the
roster has a word for, and it is also the one thing on this screen worth
interrupting somebody with. Every healthy state draws nothing at all, which
is the property to keep — see `describeAudio`, which returns null rather than
a reassurance.

**It is also where the browser's two notices go, added 2026-09-17**, and they
are the one case where this card carries a control. A browser may refuse a
page permission to make sound, and a browser's granted microphone may carry
silence — both while the transport is perfectly healthy, so `describeAudio`
says nothing and the card is drawn by them alone. The first is a sentence and
a `primary` button (*Play the channel*), which is the section's first rule
rather than an exception to it: the press is what lifts the refusal, so the
control is the explanation's whole point, and it repeats nothing in the
footer. It is the only `primary` the channel screen ever draws, affordable
because the card exists only while the channel is inaudible and there is
exactly one thing to do about it. The second is a sentence with no control at
all — the cure is another browser, which no button here can perform. Both are
constants on a phone and neither ever renders there; see
`decisions/2026-09-17-the-web-app-grew-the-browser-s-two-obligations.md`.

The surviving sentences are both under the roster rather than on a card,
there being no card either could belong to: that the room is held on another
phone, and — since later the same day — that somebody **just** stepped in
while you are nearby.

**The second of those replaced a card, and the replacement is the rule
applied twice.** The arrival had a heading, a sentence, *Step in*, *Stay
nearby* and an explanation; the roster said the sentence, the `In` rung was
*Step in*, the lit bell and your own row said the explanation, and *Stay
nearby* only removed the card. What had no second home was one word — *just*
— because a roster row carries a clock for you and none for anybody else.
See `decisions/2026-09-15-the-arrival-is-a-line.md`. **A card whose only
irreducible part is an adverb is a sentence**, which is the general form of
the test.

**Two things left that afternoon and are worth naming, since both look like
they should have stayed.** *Your microphone*'s explanations went for the
reason above. The notice that a silenced microphone is still being captured
went on its own argument: it was accurate about the bytes and misleading
about the situation, since every path out of the bucket applies the floor,
so nobody can hear the remark and nobody can obtain it. A fact about what is
retained belongs on the privacy page, and that is where the accurate version
of it is.

**The audio diagnostic panel took its own card back the same day**, and this
time for a reason that will not reverse: *Audio* is absent whenever the
audio is fine, and a panel for diagnosing the audio that appears only
alongside a fault is no use to somebody working out why no fault is visible.
It is drawn for the account that has `debug` set, not for a state.

**A third arrived on 2026-09-15 and is the rule working rather than an
exception to it.** The *getting-started* card — why you are in a channel with
four people you have never met, and how to leave it — repeats no control at
all, so `hideControlCards` has no claim on it, and there is nowhere else the
sentence could live: a room of strangers with no reason given is precisely the
shape this section forbids a control from having, one screen up. It sits above
the tab content rather than on a tab, since the question is the same whichever
of the six somebody lands on, and it can be dismissed for good because it is
an introduction rather than a state. See
`decisions/2026-09-15-a-new-account-does-not-arrive-alone.md`.

---

## Dots, pills and rules

The small marks, and what a diameter means:

| Mark | Size | Reads as |
| --- | --- | --- |
| live dot | 9, solid `floor` | you are in this room |
| nearby dot | 9, hollow, 1.5pt `nearby` | within reach of it |
| muted dot | 9, hollow, 1.5pt `textFaint` | you have closed your microphone |
| speaking dot | 10, 1pt `border` → filled `floor` | this person is audible now |
| recording dot | 8, solid `recording` (`textFaint` paused) | a recording is running |
| dab | 18, solid `waiting`, `!` in `surface` | something is waiting on this tab |

**Solid means in; hollow means adjacent to.** That is the whole of the
grammar, and it is why self-muting is a hollow grey rather than a second
bright colour.

**The dab is the one mark that is not a dot, and the only one that carries a
glyph.** Every other row above is 8 to 10 across and says what it means by
where it sits; this one is an 18pt disc with an `!` in it, up and to the left of
a tab's label and clear of the first glyph. A dot beside a word is a status
light — a thing reporting, which you read and move on from. The `!` is a thing
asking: **attend to this, but it can wait a beat.**

**It was a rose lozenge laid over the end of the word until 2026-09-15**, on
the argument that a shape slightly *in the way* of a label is what makes it
read as asking rather than reporting. The argument holds and is why this is a
disc with a mark in it rather than a fourth dot; what did not hold was covering
the word to make it. A blank lozenge still had to be recognised as a shape and
guessed at, and on Home it clipped *Contacts* and *Support* — the end of the
word being the half that tells those two apart. Saying *asking* outright with
the glyph buys the mark its way off the label.

Positioned against the label's own box rather than the segment's, so it follows
the word wherever the word starts and needs nothing measured — `styles.dab` in
`components.tsx`, and `Segmented`'s `badge`, which takes the words a screen
reader is given rather than a boolean, an `!` being a shape rather than a
sentence and a mark that announces nothing being worse than none. Drawn on the
selected tab as readily as an unselected one: it is about what the tab holds,
not about where you are standing. **Never a count**, which is why it is an `!`
and not a number — Home's two dabs are a request to answer and an answer come
back, and neither number is one a tab can state honestly; see
`state/helpSeen.ts`. The glyph is `surface` rather than white: on light
`waiting` white is 3.6:1 and the card colour 4.9:1, and on the dark value white
is 2.4:1.

**The recording pill** is a hairline `radius.pill` on `surface` — dot, word
and clock. `surface` rather than `surfaceRaised`, because `surfaceRaised` is
the default button fill and a pill wearing it reads as a control that does
nothing when pressed.

**A progress bar** is a 6pt `surfaceRaised` track at `radius.pill` with a
`floor` fill, and tabular times at each end.

**A rule inside a card** is `{ height: 1, backgroundColor: colors.border }` —
used once, between the two halves of the email card, where two cards would
have read as two unrelated settings. Where two things are alternatives rather
than sequential, the separator is the word *or* in muted italic, because a
line reads as the end of one thing and the start of another.

---

## The shape of a screen

### `Screen`

Every screen is one. It is a `KeyboardAvoidingView` over an optional pinned
header, a `ScrollView`, and an optional pinned footer.

- **Header and footer are siblings of the scroll, never overlays.** They take
  their own height out of the viewport, so nothing is ever hidden beneath them
  and no screen needs bottom padding to keep its last card reachable.
- **Both sit inside the keyboard avoider**, which matters most at the bottom:
  a footer outside it is covered by the keyboard exactly when somebody is
  typing.
- `keyboardShouldPersistTaps="handled"`, without which saving takes two taps —
  one swallowed, one heard — which reads as the button not working.
- `keyboardDismissMode="on-drag"`.
- `behavior="padding"` on iOS only, and **not in the list pane**: iOS reports
  one keyboard frame for the window, so both panes avoiding it shortened Home
  for a keyboard nothing on that side had asked for.

**Revealing the card** is the screen's other job. When a form grows, scroll the
*card* into view rather than the field — a keyboard-aware scroll brings the
field in and leaves the Save button under the keyboard, which is the control
being reached for. **`<Reveal when={…}>` wraps the whole card**, label and all;
`useRevealOnKeyboard(active)` is the hook under it, for a card that is already
a component of its own, and `useReveal()` is the manual trigger for growth that
has nothing to do with a keyboard. It fires on `keyboardDidShow`, not on focus,
because the keyboard is what shrinks the viewport.

**Ask from inside the screen.** `RevealContext`'s provider is in `Screen`'s own
tree, so a reveal requested by the component that *renders* `<Screen>` reads
the default and moves nothing at all. Both of the cards below shipped that way
on 2026-09-13 and the failure is silent by construction — the wrapper is in
place, the keyboard listener fires, and the function it calls is a no-op. That
is what `Reveal` is for: being a child, it cannot be wired up from the wrong
side. Asking from the wrong side now writes a `[reveal]` line in a development
build rather than going quiet.

**No editable element may be left under the keyboard, and neither may the
control that commits it.** That is the rule; the two sentences above are the
whole of how it is kept. A screen gets the first half for free by being a
`Screen` — every field in the application is inside that one avoider, and
there is no `Modal` anywhere to put one outside it. **Above the breakpoint the
list pane is the exception**, for the reason given above, and it is an
exception rather than an exemption: a field that ends up in that pane is one
the rule has nothing left to enforce it with. What it does not get for
free is the second half, because avoiding shortens the viewport without
scrolling it: a field far enough down a long tab is under the keyboard even
though the avoider is doing its job. So any card whose field can sit below the
fold is wrapped in a `Reveal`, open on *whether the box is showing* rather
than on focus. `ProfileView`'s ping card and `ChannelView`'s notepad are the
two.

**A second `KeyboardAvoidingView` is the wrong fix and is the one reached for
first.** Nested inside `Screen`'s, it counts the keyboard's height twice on
iOS and leaves a gap that tall under the card. The symptom that sends somebody
looking for one — a box under the keyboard — is a scrolling problem, not an
avoidance problem, and `useRevealOnKeyboard` is its answer.

### The picture, which is pinned on one tab and floats over everything else

**It is not on any screen.** The film hangs above the route table, over Home,
the settings, a profile and the channel alike — `watch/Picture.tsx`. What
`Screen`'s third slot, `aside`, holds is the *hole* the docked picture is drawn
into: a pinned row still **takes its own height out of the body** exactly as
the two bars do and covers nothing, and since the picture cannot reserve
anything from up there, the hole is what does.

- **Docked**, on the *Watch* tab: 16:9 on `#000`, centred, with the pinned
  header's hairline under it and for the same reason. The transport and the
  cards scroll beneath it; the film does not scroll away from its own
  controls. The hole carries the size and the hairline and the picture is laid
  over it, so the two must agree.
- **Docked beside the scroll**, on a pane wide enough for both — see § *The
  watch body has two shapes*. Same hole, same picture; what changes is whether
  the transport is under the film or next to it.
- **Floating**, everywhere else: 168pt wide at 16:9, `radius.md`, a hairline
  because a dark scene over a dark card has no edge otherwise, and a shadow. It
  **rests in one of the four corners of the application** — over the pinned
  header and footer as readily as over a body, which is what makes it reachable
  on a screen that has neither — starting bottom-right, the corner a thumb
  covers least on the way to the footer and the one furthest from the notepad's
  field. Dragged, it snaps to whichever corner's quadrant it was let go in. A
  tap opens the *Watch* tab, the rectangle being far too small to carry a
  transport.

**The two are one element in two styles, and that is load-bearing rather than
elegant.** The picture is a `WebView`, and a `WebView` that is reparented is
rebuilt: the page reloads and the film restarts from black. So there is one
element at one depth — the highest one there is — and what changes between the
places is a style object: the same argument § *Two panes* makes for the detail
pane's fixed depth, taken one level further out. Both places are `position:
absolute` now, over a layer that answers no touch of its own; the picture is
the one thing in the application drawn above the pinned footer, which is the
price of a corner that a screen without a footer can also use.

### The pinned header

Two screens have one and they are built identically:

```
header      paddingTop: spacing(1), paddingBottom: spacing(1–1.5),
            hairline bottom border in `border`      ← full bleed
headerInner ...measure, paddingHorizontal matching the scroll's, gap
headerTop   row, alignItems center
```

The horizontal padding on the inner row is what lines the title up with the
cards below rather than with the window. The trailing group of buttons carries
`marginRight: -spacing(1)`, because `Button`'s padding is sized for a card and
without it the pair sits further from the edge than the title is from the
other one.

**The hairline is the one thing a pinned header needs that a scrolling one
does not:** without an edge the content slides up to the buttons and stops,
with nothing saying which of the two moved. The footer's top hairline is the
same argument at the other end.

### The pinned footer

A full-bleed `surface` with a top hairline — `surface` rather than `bg` so the
bar reads as sitting above the page, the same relationship the cards have to
it. Inside it, a bar capped at **560** and centred, narrower than `measure`:
620 divided five ways stops reading as controls and starts reading as a row of
banners.

The channel bar carries five — Mute, Claim, In, Nearby, Out — and each is
`flex: 1`, so it is a fifth of the bar whatever its label says. That is also
why the labels are short forms: the long forms, "Step in" and "Be nearby", are
acts, and belonged on a control with a sentence under it, where these are the
same rungs at 11pt in a fifth of a phone and the long forms truncate. **The
cards that had them are gone as of 2026-09-13**, so the bar is now the whole
of the ladder, the microphone and the floor; what is left in the body is a
readout apiece, and only where there is something the bar cannot state. See
*The cards a footer made redundant* below. Sizing to content would move a target under the thumb the moment
"Claim" becomes "Release" — **position is what a set of fixed controls is
for.**

No bottom inset anywhere: `App.tsx` wraps the application in a `SafeAreaView`
with `edges={['top', 'bottom']}`.

### Sections, and nothing

`SectionLabel` is `type.label` uppercased, with `marginTop: spacing(2)` above
and `spacing(0.75)` below. `Empty` is `type.muted` with `spacing(2)` of
vertical padding, and takes a sentence rather than a word — "Nothing matches."
rather than "Empty".

**A tab with one thing on it gets no label**, since 2026-09-13. A section
label divides; where there is nothing to divide from, it is the screen saying
its own name twice under a tab that already said it. *Listen* lost SHARED
AUDIO and *Recordings* keeps only the one over the list, the transport above
it having no heading at all.

### The watch body has two shapes, and one number decides which

**The film and its transport compete for height in one column and for nothing
at all in two.** So a pane wide enough for both gets both: the picture beside
the scroll rather than above it, `asidePlace="beside"` on `Screen`.
`watchShapeFor` in `ui/layout.ts` is the whole rule, and it is pure — one
function, one table test, every surface in it.

**`TWO_COLUMN_AT` is a sum rather than a chosen number**, which is why it can
be trusted on a surface nobody has opened yet: `PICTURE_MIN_WIDTH` (440, a
phone's widest) plus `COLUMN_MIN` (300, a full-width button with its words on
it) plus the gap. Move either minimum and the breakpoint follows. **It is not
`SPLIT_AT`** and must never be given that number: that one asks how wide the
*window* is and answers whether a list fits beside a screen; this asks how
wide the *pane* is and answers whether a transport fits beside a film. A
window at `SPLIT_AT` has a 460-point pane and is nowhere near it.

**Stacked, the picture may not take the whole body.** `RESERVE_UNDER_PICTURE`
— 150 points, the section label, the progress bar with its two times and the
transport row — is kept below it at every size. What the reserve promises is
**the scrubber and the three transport buttons above the fold, always**; the
rest of the card is four hundred points and is meant to scroll. What went
wrong on an iPad on build 251 was not that the card was long but that the fold
landed in the middle of a button.

**The picture's box is decided, not constrained.** It was `width: 100%`, a
`maxWidth` and an `aspectRatio` — three style rules that between them answered
*how wide* and nothing at all about *how tall*, which is the axis that runs
out. A browser window is the case that makes it obvious: short and wide, with
no rotation to rescue it, and nothing in a width-only cap to stop a 16:9
picture taking the entire viewport.

**Both inputs come from the pane, never from what the rule produces.** That is
not tidiness. *Two columns when the controls would not otherwise fit* is a rule
whose answer changes what it measured — two columns shrink the picture, the
picture fits in one column again, and the layout flips under a finger for ever.
The body's height is the pane's less the chrome, and no picture changes it.

### The expanded picture, which is where a pinned row goes over the body

**One screen breaks the rule above, and this is the whole of it.** Full screen
on the *Watch* tab — `watch/FullScreen.tsx` — puts the transport on a
`rgba(0,0,0,0.6)` scrim over the bottom of the picture rather than beside it.

The rule it breaks is the good one: header and footer are siblings of the
scroll, so nothing is ever covered and no inset has to be kept in step. What
it buys here is a *smaller picture in landscape than in portrait* — a stacked
transport and footer leave about 200pt of a sideways phone, where portrait
full width gives 219 — and a control whose purpose is a bigger picture cannot
be built on a layout that shrinks it. So the transport is overlaid, as every
video player's is.

**And it fades, which this section said it deliberately did not.** The rule
was that the chrome never hides, on the grounds that the row which exits is
also the row that pauses and this state has no other way out. It cost the
thing the state is for: a bar that is permanently there is a fifth of the
film, and the picture fitted into the rest is well short of the glass. It now
goes after three seconds of nothing being pressed and comes back at a touch
anywhere, which is the gesture every other player on this phone has taught
already, and it starts up, so what is there is seen before it goes. See
`watch/FullScreen.tsx`, which carries the reversal in full.

**What makes that safe is the touch, which every player has taught.** A tap
anywhere brings the row back, on every platform, and the button on it is the
way out where there is a button. The swipe down that was once a third way out
is gone and is not coming back.

**On a handheld the way out is the wrist, and the button is not drawn.**
Turning the phone sideways on the watch card is what opens this, turning it
upright is what closes it, and while the phone is sideways the state *is* the
window — so an *Exit full screen* there would set a flag the window overrules
and would visibly do nothing. A dead control is worse than an absent one. See
§ *The rules that are actually load-bearing*.

**The turn is readable only because the lock is narrow.** The *portrait lock*
keeps a handheld upright everywhere except the film's two screens — the watch
card with a film this device can expand, and this one — so a landscape window
on a handheld can only be somebody's wrist. `watch/orientation.ts`. A lock
that covered the whole application, which is what shipped for a few hours on
2026-09-20, makes the turn unreachable rather than merely unused; no lock at
all makes every laptop and every iPad a request.

**Both ways up are permitted here**, the lock being released rather than
reversed: somebody watching flat on a table keeps the film rather than being
rotated onto the card, and the picture is fitted to whichever shape the glass
is. Portrait full screen on a phone is what the card's button is for there.

**Since 2026-09-20 the scrim carries the transport and the way out, and
nothing else.** What it admits is pause and play, the progress bar, the two
fifteen-second seeks, and *Exit full screen*. The channel's own pinned bar was
overlaid here for a day, on the argument that this is a talking application
before it is a video one; what it bought was reachability that was never more
than one press away, and what it cost was a fifth of a sideways phone spent on
five controls about the room rather than about the film.

**The buttons are the control wherever there is no wrist**, having been
removed on 2026-09-19 as two controls saying what the phone already knew.
They were — about a phone being held. A tablet and a browser window are
landscape sitting still and have no turn to perform, so for a day both entered
this state on the *Watch* tab and could not leave it. So *Full screen* is on
the watch card on every surface, and *Exit full screen* is on the scrim on
every surface but a turned handheld: a laptop, an iPad, and a phone held
upright or lying flat, which never turns because iOS holds the orientation it
had when the gravity vector stops saying anything. *Back to portrait* is gone,
replaced by the exit rather than joined by it — two ways out on one scrim is
what the channel's bar was taken off for.

**Both are `Button`s with their words on them** rather than `IconButton`s,
against § *Icons*' licence for a header glyph and for the reason the exit had
its word the first time: an icon is findable once it has been learnt, and the
way out of a state somebody may not know they can leave is not where they
learn one.

**What killed the pair the first time cannot happen now.** The old *Full
screen* locked the phone into landscape while it was up and exiting released
the lock, so a pressed exit while still sideways handed back the channel screen
sideways with nothing to say otherwise with. Nothing is pinned to landscape
now: leaving the film — a tab, a stopped party, a refusal — locks *portrait*,
which is a rotation towards what the next screen wanted, so it arrives upright
however the phone is being held.

The stage is `#000` rather than `colors.bg`, for the reason the player's card
is: what shows beside a film is letterbox, which belongs to the film.

### Two panes

Above the breakpoint, `Panes` puts a 340pt list behind a right-hand hairline
beside the detail. **Both arrangements live in one component**, and the detail
slot sits at one fixed depth under one fixed key in both — React preserves a
subtree only where it stays at the same place in the tree, and crossing the
breakpoint happens while somebody watches. Rendering the detail at two
different depths would unmount a half-typed message mid-drag.

`usePane()` says which side a subtree is on, or `null` when there is no split.
It carries pane identity and never tokens.

---

## Icons

Thirteen glyphs, **vendored** from `lucide-static@1.38.0` as path data in
`icons.tsx`, each carrying the name it came from. Not `lucide-react-native`:
Metro does not tree-shake by default on SDK 54, so the barrel import that
reads most naturally risks dragging a 25MB package into the graph.

The cost of vendoring is that a mistyped path is silent — it draws the wrong
shape and nothing fails. **To change or add one, take it from that package
again rather than editing the numbers.** Lucide is ISC, which is what permits
the copy.

- **24-unit grid**, drawn at **22px** inside a fixed **24pt box**, so a row's
  icons sit on one line whatever their own proportions are.
- **Stroke 1.75**, lighter than Lucide's own 2: at 22px a 2-unit stroke reads
  heavier than any type on the screen, and the icon stops being a label.
- **The colour is passed in, never read.** An icon takes `(color: ColorValue)`
  and the caller knows whether this is `text`, `textFaint`, `floor` or
  `silenced` — which is what lets one glyph serve a footer and a tab.
- **An icon appears without its word only where the shape is the
  vocabulary.** In a footer action or a tab the label is what makes the glyph
  legible the first time and the glyph is what makes it findable after that,
  so neither half is ever dropped — an icon-only tab bar is one where the
  third tab is a guess. The exceptions are the header's `IconButton`s and the
  recording transport's three buttons, where the shapes have meant one thing
  each since tape and a word beside a square would be teaching what the square
  already says. In both, the word survives as the accessibility label — and on
  the transport, since 2026-09-13, under the glyph as well, which is what lets
  the prose that used to explain its grey controls be gone. See § *Button*.
- **Only the microphone changes glyph between states**, because a
  struck-through mic is the one piece of this vocabulary everybody already
  knows. The floor keeps one hand in both states: no icon set has a "released
  hand", and its state is already carried twice — by the accent and by the
  word, which changes between Claim and Release.

---

## Feedback and motion

**One thing moves, and it is a screen arriving under a thumb.** `Animated`
appears in `app/src/ui/Panes.tsx` and nowhere else, and no animation library is
a dependency. Nothing fades and nothing springs.

This said *there is no animation* until 2026-09-18, and the sentence earned its
keep for as long as nothing needed motion to be understood. A swipe does: a
screen that replaced another with no travel between them would not say which
way the gesture went, and a gesture whose direction is invisible is one nobody
learns. So the arriving screen crosses from the edge it came from, in 220ms, on
the native driver — and the screen being left does not move, because both of
them moving means both of them mounted.

**The motion belongs to the journey and not to the gesture**: going into a
screen and coming back out travel the same way whether a thumb or a tap did it,
because `Panes` animates on the pane changing hands rather than on the swipe.
Nothing moves in a split, and nothing moves on the web. See
`decisions/2026-09-18-a-screen-arrives-from-the-side-it-was-asked-for.md` and
`decisions/2026-09-18-the-motion-belongs-to-the-journey.md`.

**It is not a licence for the rest.** A transition that carries information is
the case; a fade on a card, a spring on a button and a shimmer on a list are
not, and the argument that got motion in here is one none of them can make.

The whole feedback vocabulary is otherwise opacity on press:

- **0.7** — a button, a segment, a small control.
- **0.6** — a large pressable surface: a whole row, a footer action, a
  recording card. The recording transport left this list on 2026-09-13 and
  presses at 0.7 with every other button, which is what it is now.

Two other kinds of press response exist and are not opacity: a channel card
darkens to `surfaceRaised` instead, because it is already tinted, and a
pressed state must survive on a `floorDim` fill.

`ActivityIndicator` in `textMuted` is the only spinner, on two screens. Waiting
is otherwise said in words — see below.

Haptics exist in this app but are **not** UI feedback: `audio/cue.ts` uses
them to say something about the room when the screen may not be in front of
anybody.

---

## Words on controls

The copy is part of the style, and these patterns are consistent enough to be
rules.

- **A busy control says what it is doing, in the label, with an ellipsis** —
  "Deleting…", "Preparing…", "Renaming…", "Starting…", "Loading…", and
  `disabled` while it does. One character, `…`, never three dots.
- **A disabled control is accompanied by a sentence saying why**, in
  `type.muted`, beside it rather than up in a summary. A disabled control with
  no reason is a bug. Two exceptions: a state that will move on its own and
  has nothing to wait for on this screen, like "Transcribing…"; and **a row
  where being refused is the ordinary condition**, which as of 2026-09-17 is
  the recording transport and the lock screen card — see § *The lock screen
  card*, where there is no room for a sentence and the way to find out is to
  open the app. Two of its three are grey most of
  the time, by design, and a sentence for each was four paragraphs under three
  buttons — read once and skipped after, and answering questions the header's
  pill, the list below and the channel's settings each answer in their own
  place. What replaced them is the word under the glyph: refusals a rule can
  enumerate are worth a sentence, a permanent condition of the row is not.
- **Destructive and irreversible acts confirm through `Alert.alert`**, with
  `style: 'cancel'` first and `style: 'destructive'` second, and the body says
  what is actually lost and for how long. There are 28 of these; there are no
  custom modal dialogs and no `Alert.prompt` — a rename happens in a `Field`
  in the row, which is also what naming a channel looks like one screen away.
- **Say the consequence before the tap, not after.** "Everyone in this channel
  sees the new name."
- **Sentence case on everything.** The only uppercasing in the app is
  `SectionLabel`'s, done in CSS.
- **Empty states are a sentence** and, where there is genuinely nothing to
  offer, no button: `NoDetailView` deliberately carries no control, because
  one would be a second way to do what the pane beside it is already doing.

---

## The lock screen card

The one piece of this interface that renders outside the app: a Live Activity,
up whenever this device is standing in a channel, drawn by the widget
extension in `app/targets/lock-screen/`. It carries a name, two buttons and a
tap.

**Its palette is a transcription, not an import.** A widget extension is a
separate process with no JavaScript in it, so `theme.ts` cannot reach it and
the hex values are copied into `LockScreenLiveActivity.swift` by hand. That is
a duplicate, and duplicates drift: **change one, change both, in the same
commit.** Only the tokens the card actually spends are transcribed — `text`,
`textFaint`, `disabled`, `surfaceRaised` and `floor` — and adding a colour
there means adding it here first and deciding what it is for, exactly as for
any other surface. Both palettes are carried, chosen on the system's colour
scheme, for the reason every other surface carries both.

**The microphone glyph is transcribed too**, since 2026-09-17, and for the same
reason: `MicShape` is `lucide/mic` and `lucide/mic-off` written out as a
SwiftUI `Path` on the same 24-unit box and the same 2-unit stroke that
`icons.tsx` draws them on. **Not an SF Symbol that resembles them** — an icon
is the part of a surface that is read without being read, so a second
microphone shape would be the most visible drift of the three. The SVG's arcs
become `addRelativeArc` sweeps, a signed delta rather than the flag pair, since
`addArc(clockwise:)` has its sense flipped by SwiftUI's y-down space and a
wrong guess draws the long way round.

**What is no longer transcribed is the sentence.** The card carried the
footer's hint — "Your microphone is muted" / "…is open" — under the channel
name until 2026-09-17, and it said what the glyph beside it already said. Two
statements of one fact on a surface with room for about six words; the glyph is
the half that survives.

Five rules that look like details and are not:

- **Both controls are visible, and the card is still a tap.** *Open* is a
  `Link` to the same deep link `widgetURL` carries. It is not a second way in
  so much as the first one made legible — *the whole card is a button* is a
  convention somebody has to already know, and the reader who most needs a way
  back is the one who has used the app least.
- **The microphone button shows three states as two, in a glyph and not a
  word.** It strikes through on the same derivation the footer icon uses —
  *you are not being heard*, which folds in a device with no input — rather
  than on the reducer's `selfMuted`. GLOSSARY.md § *Mute (four things, one
  word)* is the entry that separates them. The word it used to carry is now
  only its `accessibilityLabel`, which is § *Accessibility*'s rule that a
  glyph's label is the word it replaced.
- **Refused is grey, with no sentence saying why**, which is the named
  exception in § *Words on controls*. There is no room for a sentence on a
  lock screen and being refused here is ordinary rather than an error, so
  *Open* stands in for one: it opens the app at the channel, where every
  reason is already stated in its own place.
- **The card's controls are half again the island's, and both by the same
  factor.** A lock screen is read at arm's length and often not held; the
  expanded island is a panel with three regions to fit, and a control that is
  comfortable there is small here. `LockScreenCard.scale` is that number, and
  **both controls take it** — the microphone's glyph and the disc around it,
  *Open*'s type and its padding — so the pair keeps its proportions. A glyph
  that grew while the word beside it did not would read as two sizes rather
  than one. **It was 1 and then 2 before it was 1.5**, and both ends were
  looked at on a phone: unscaled the microphone is small across the width of
  the screen, doubled the pair crowds the name beside it and the card reads as
  a toolbar. The number is a judgement about this surface, so change it by
  looking rather than by arithmetic.
- **Being silenced does not grey it.** Somebody silenced by another's claim may
  still set their own mute, and it is what they are left with when the claim
  ends. The footer keeps the control live and spends `silenced` orange on it;
  the card has no colour to spend and simply stays live.

Below iOS 17 the microphone is not a button — `Button(intent:)` is what lets a
tap act without opening the app, and there is no earlier spelling of it. The
card shows the glyph in the same grey, and *Open*, which needs no intent, is
the only control that does anything.

**The Dynamic Island carries the same two controls**, in the same order, in the
expanded `.bottom` region with the name above them. They were in `.leading` and
`.trailing` until 2026-09-17, which is where an island puts an icon and a badge
rather than a pair of buttons — and the leading one was a third microphone,
drawing what the button opposite it already drew. Compact and minimal stay a
single `floor`-tinted glyph.

---

## Accessibility

- `accessibilityRole="button"` on every `Pressable` — there are twenty-one,
  plus one `tablist` on `Segmented`, one `checkbox` on `Checkbox`, and one
  `image`.
- **44pt minimum targets.** `IconButton` is 44 square; `FooterAction` sets a
  44 floor even though its disc already clears it.
- **State goes in `accessibilityState`, not in the label.** A segment
  announces "Members, selected, button" rather than carrying the word
  "selected" in its text.
- **`selected` rather than `disabled` for the rung you are on**, so a screen
  reader says which of the three you are standing on rather than that two
  thirds of the bar is unavailable. The hint is written for the ear: "You are
  nearby", not "Be nearby".
- **A glyph's `accessibilityLabel` is the word it replaced.**
- A row whose whole surface is the target carries a label that reads as a
  sentence — name, duration, and what a tap will do.
- **Contrast is why the light palette exists.** `textFaint` carries 12px
  semibold labels, so it is held to 4.5:1 where `placeholder` — read once,
  then replaced — is allowed ~3:1. A hint as dark as a label makes an empty
  form look filled in.

---

## The rules that are actually load-bearing

Nine things that look like tidying and are not:

1. **Violet is the floor and nothing else.** Every other coloured thing on the
   palette is claimed by exactly one meaning. Adding a colour, or reusing one of
   the seven hues, is the change that costs the interface its legibility.
   **`waiting` was the seventh, added 2026-09-15**, and it is the only hue added
   since the interface was designed — so it is also the worked example of what
   this rule costs. It was not a third token on red's hex, the way `recording`
   and `danger` are; it is a rose nothing else holds, and it exists because a
   mark that means *something is waiting for you* must not read as an error and
   every other hue was spoken for. The bar is that high: a new hue needs a
   meaning the palette cannot already say, and it is written down here when it
   is spent.
2. **`colors.*` is opaque and must stay opaque.** Do not resolve a scheme in
   JavaScript, do not add a theme context, and do not read
   `useColorScheme()` to pick a value. Fourteen `StyleSheet.create` blocks
   depend on never learning that a colour changed.
3. **Light is the fallback, not dark.** Android, jest and an unconfigured
   browser all get light. `appearance.ts` carried a comment saying the opposite
   for a month, so check the code rather than a sentence.
4. **The two palettes are mapped from one key set.** Add a token to both, in
   `theme.ts`, and let `cssVariables.web.ts` generate the CSS. A hand-written
   stylesheet reintroduces the drift the mapping exists to prevent.
5. **A pinned bar's edge is full-bleed and its contents are capped.** Both
   header and footer; `measure` on the inner row, hairline on the outer. The
   docked picture is the third of these and is built the same way.
6. **Position never changes on a fixed control.** `flex: 1` on every footer
   action, a fixed-height disc whether accented or not, static rows of tabs
   rather than a scroller. A target that moves under a thumb already on its way
   is the wrong one pressed. **How many rows those tabs take is a function of
   the width** since 2026-09-20, which does not bend this: at a given width it
   is fixed, and the width changes only when somebody resizes the window or
   turns the device.
7. **A card that repeats a pinned control earns its place with a sentence, or
   not at all.** When the sentence goes the card goes; when the button goes and
   the sentence stays it becomes a readout, and a readout may not be hidden by
   a preference about repetition. See § *The cards a footer made redundant*,
   which is what four cards on the channel screen cost before anybody counted
   them.

8. **A layout rule is decided from what it is given, never from what it
   produces.** *Two columns when the controls would not otherwise fit* reads
   as the obvious rule and oscillates: two columns shrink the picture, the
   picture then fits in one column, and the layout flips under a finger for
   ever. `watchShapeFor` takes the pane's width and the body's height — two
   things no answer of its own can move — and every future rule of this kind
   has to be able to say the same. The same reasoning is why `Segmented` may
   measure itself and the picture may not: a row count does not change how
   wide a control is, and a height does change what is left below it.

9. **A control the state would overrule is not drawn.** Where a state is
   derived from something a press cannot move — the shape of the window, on a
   handheld, being the one case — the button for it is absent rather than
   present and inert. *Exit full screen* is on the scrim on every surface
   except a phone that has been turned, where turning it back is the way out
   and a press could do nothing at all. The instinct is that one control
   everywhere is kinder than one that comes and goes; a control that is there
   and dead is worse than both, because the person presses it, nothing
   happens, and there is nothing to tell them why.

And one that is about this file: **a departure from any of the above is
written down where it is made.** The style blocks in `app/src/ui/` are
commented at length precisely because the numbers alone cannot say which ones
were chosen and which were merely arrived at.

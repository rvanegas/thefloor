# A live invitation stops borrowing the floor

2026-09-15. The Channels list's invitation card, when somebody is waiting in
it, wore `floorDim` under a `floor` border — the live bar's four lines exactly.
It now wears a `waiting` border and no fill, and its second line says `Dana
asked you in · waiting` where it said `Dana is waiting`.

## What was wrong with it

Two things, and only the second was visible in a screenshot.

**The colour said the wrong fact.** `styles.invite` and Home's `styles.liveBar`
were byte-identical: `backgroundColor: colors.floorDim`, `borderColor:
colors.floor`, `borderWidth: 1`. So one screen drew two tinted violet cards
eight rows apart for two different claims — *you are standing in this room*,
and *you were asked into a room somebody else is standing in*. Violet is the
floor and nothing else (STYLE.md rule 1); the accent belongs to the one
distinguishing mechanic, and the live bar is the thing above the list entitled
to shout. `StartChannelRow`'s own comment had already made this argument for
itself — "a whole row in the floor colour would be competing with the live bar"
— and the invitation row was doing exactly that a section lower.

**And the words never said it was an invitation.** The live branch of `line`
read `${card.from} is waiting`, which is a name and a state. A channel you
already belong to that somebody has walked into could carry the same sentence.
The clause that distinguishes an invitation — `asked you in` — was on the quiet
branch only.

That is the branch least able to spare it, because of the section ladder: an
invitation somebody is in is filed under **Live** rather than **Invitations**,
deliberately, on the grounds that it is the most urgent thing on the screen and
sorting by taxonomy would bury it. Promotion is right and it costs the row its
heading. Nothing replaced the heading. What was left saying *invitation* was
the tint — which meant something else — and the ✕, which is a control rather
than a label, plus a VoiceOver label ending "Join." that no sighted reader
gets.

The comment justifying the promotion asserted the opposite: *Its card still
says who asked you in.* It had not for as long as the live branch existed. So
had the test — `expect(text).toContain('Dana Chu is waiting')` under a comment
reading "Still says who asked". Both are corrected.

## What it is now

- `Dana asked you in · waiting`, plus ` — tap to join` when a tap joins. The
  clause carrying the fact is on both branches; what varies is the status after
  the dot, which is the grammar the rest of the list already uses — `· 2
  present`, `· an hour ago`, `· waiting`.
- A `colors.waiting` border, no fill. `waiting` is the token whose meaning this
  already is: *something is waiting for you*, spent on the Home dab, and
  written to not mean error precisely because a request to answer is good news
  arriving slightly inconveniently. That is this row, at a different size.

**No eighteenth token.** A `waitingDim` fill would have been the obvious
symmetry — every other tinted card is a `*Dim` under its full-strength border —
and it was not taken. The fill is what competes with the live bar; reproducing
the pattern in a new hue would have kept the competition and only changed who
was shouting. So the rule gains its complement: a tinted card is a state, but a
state need not be a tinted card. An edge in the right hue says which kind of
thing a row is, and the tinted block stays reserved.

This is also the second place `waiting` is spent, nine days after the hue was
added and the rule about adding one was amended to admit it. The test a second
use has to pass is that it is the same *meaning*, not merely a spare colour: a
hue is claimed by what it means, not by the widget that first used it.

## What was considered

**Dropping the mark entirely**, leaving a live invitation in `inviteQuiet`'s
grey edge with only the words to tell it from a quiet one. Rejected because the
ladder's whole argument is that this row is the most urgent thing on the
screen, and a row promoted to the top of the list and then drawn like every
other row spends the promotion and shows nothing for it. What makes it urgent
is its position; the paint only has to say which kind of thing it is, which is
why a border is enough and a block is too much.

**`nearby`**, which is the other hue with a `*Dim` fill already built. It means
*within reach, and not in the room*, which is a presence state about people
rather than a thing awaiting an answer. Borrowing it would have repeated the
original mistake in blue.

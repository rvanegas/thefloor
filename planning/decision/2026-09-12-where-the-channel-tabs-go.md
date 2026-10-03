# Where the channel tabs go, and what they look like

2026-09-12, hours after the six tabs shipped.

Four changes to the same switch, and one to the screen that governs it.

## The order is who, then what

`Roster, Notes, Invite links, Player, Recordings, Watch`, where it was
`Roster, Notes, Player, Recordings, Watch, Invite links`.

The old order ran the four carried things together and put the ways in at the
end, on the grounds that inviting somebody is the rarest thing anybody does on
this screen. That is a good reason not to make it the tab you land on. It is
not a reason to file it away from the subject it belongs to: who is here, what
they have written down and how somebody who is not here gets in are one
subject, and the track, the recordings and the video are another.

It also puts the one tab that can be absent at the end. *Watch* comes and goes
with Labs and with a party running, and a set that loses its last entry leaves
every other tab exactly where it was — which the old order did not, *Invite
links* having sat below it.

## A glyph over every word

Vendored from `lucide-static@1.38.0` into `app/src/ui/icons.tsx`, like the six
that were already there, and drawn by `Segmented` in the construction
`FooterAction` uses: 22px glyph in a 24px box, 11pt caption under it, the
label taking the same colour as the icon so the two cannot disagree.

`users`, `clipboard-list`, `user-plus`, `music`, `circle-dot`, `monitor-play`.
Each names what the tab *holds* rather than what you do there, a tab being a
place; the footer's are the other way round, which is the only difference
between the two sets and is the right one. The reasoning for each is at the
glyph itself.

**Neither half is ever dropped.** The label is what makes the icon legible the
first time and the icon is what makes it findable after that, which is the
footer's own argument. An icon-only tab bar is one where the third tab is a
guess.

`icon` is optional on `Segmented`, and Home's channels/contacts switch does
not pass one: two halves of one question are carried by their words, and a
glyph over each would be decoration.

## They can be pinned above the footer

`tabsAtFoot`, a fifth account setting, on the Floor Settings screen with the
tap and the control cards — one card, three dials, all about the same screen.

Set, the switch is drawn inside the footer's own surface, above the bar that
holds the microphone and the ways in and out, so the two read as one pinned
block and every control on the screen is within reach of one thumb. Unset, it
is the first thing in the scroll, where it has been since the tabs existed.

**It moves them and does nothing else** — the same six, in the same order,
drawn by the same control. What a preference may move is where a set of
controls is; what it may not touch is which of them there are or what order
they come in, position being the whole of how somebody finds a tab twice.

## The default is a coin toss

**The one setting in the application whose untouched case is not a fixed
default.** Nobody here knows whether tabs read better at the top or under a
thumb, and a default picked by whoever wrote the screen teaches nothing. So
the server tosses once per account, the first time it reads one that has never
said, and stores how it landed — `tabsAtFootFor` in `server/src/accounts.ts`,
which is the one place in that class where a read writes.

Once, and stored. A preference that came back different on the next
connection would not be an experiment; it would be a screen that moves its
tabs while somebody is using it, and a second device has to be told what the
first was.

That makes `tabs_at_foot`'s null mean *not yet tossed* rather than *the
default*, which is the opposite of every other settings column on the row and
is marked at all three of them. `DEFAULT_ACCOUNT_SETTINGS.tabsAtFoot` stays
`false` and is now only what a client draws in the second before `hello`
arrives — the top, because that is where the tabs were before any of this.

The card says so, in as many words. A screen that let somebody discover by
comparing two phones that they had been put in an experiment would be keeping
a secret for no reason.

## And the screen is called Floor Settings

It was *Settings*. A channel has a settings screen of its own, reached by an
identical gear from an identical header, and it says *Channel settings* — so
one of the two named which of them you were on and the other left it to be
inferred from what was on it.

No shim. The new field is additive in both directions: a server sends it to
builds that ignore it, and no build that predates it sends it.

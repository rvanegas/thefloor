# What contains the channels and the contacts

**A design for work not yet done.** TASKS.md § *The Tier Above Both Lists*
names it in a paragraph; this is what that paragraph turns out to mean. When it
ships, what survives moves to `decisions/DECISIONS.md` and this file goes.

Written 2026-09-01, out of an iPad question that turned out not to be an iPad
question. It restructures the first screen on every device.

## Context

Home *is* the channel list. Contacts is a separate screen, opened from a button
in Home's header, with a button of its own to get back. But the two are peers:
both are lists of people you can reach, one indexed by the conversations you
have with them and one by name. Only one of them is the root of the app, and
nothing about the pair justifies which.

That asymmetry is not cosmetic. It produces three faults, and the third is the
one that made it urgent.

**Chip in and Standings sit at the tail of the channel list**, under a comment
in `HomeView` defending the position: *"Everything above it is what somebody
opened the app to do. A request for money that sat above the channels would be
reading the room wrong."* The ordering argument is right and it is answering the
wrong question — those two were never part of that list. They are about the
application, and they are at the bottom of your channels because the bottom of
your channels is the only place there was.

**Moving between the two lists is dressed as moving between a root and a
child.** A *Contacts* button in Home's header, a *Home* button in Contacts'.
Two peers, navigated as though one contained the other.

**And the live room is in Home's header, so it does not exist while Contacts is
showing.** On a phone that is survivable, because Contacts covers Home and you
came from there a moment ago. On an iPad it is not: the two panes mean the
contact list can hold the left while something else holds the right, and then
you are present in a conversation with nothing anywhere on screen saying so.
`HomeView`'s own comment calls exactly this *"the one thing this change could
plausibly make worse."*

**The fix that was proposed first was to put the live bar in Contacts too, and
it is wrong.** A live room is not a contact and has no business in that list.
It belongs to whatever contains both lists — which is the thing this document
is about, and which did not exist.

## The shape

    ┌ Home ──────────────────────────┐
    │  The Floor            Settings │   pinned
    │  ▸ Ana & Rodrigo · 2 present   │   the room you are in, if any
    │  ── [ Channels | Contacts ] ── │   two peers, switched
    │                                │
    │    Live                        │   the selected list, scrolling
    │    · Book club                 │
    │    Your channels               │
    │    · Standup                   │
    │                                │
    │  Chip in · Standings           │   about the application
    └────────────────────────────────┘

The tier is a frame with a pinned top and a scrolling middle. The two lists
stop being screens and become bodies inside it.

## What is decided

**Home is the tier. The channel list becomes Channels.** Today "Home" names the
channel list — in `screenOf`'s `{ kind: 'home' }`, in the `/` path, in `onHome`
props, and in two buttons. After this it names the thing you land on, and the
list of channels has a name of its own for the first time.

**The address needs no new axis, because it already has one.** The iPad split
introduced `List = 'home' | 'contacts'` as a state independent of what the
detail pane shows; the tier is that state with better names,
`'channels' | 'contacts'`. `/` is the Channels tab and `/contacts` the other,
exactly as now, and `webRoute.ts` is untouched. This is the one place the two
pieces of work fit together rather than fight.

**The switch replaces both buttons.** `onHome` leaves `ContactsView`
altogether. `ChannelView`'s way back becomes *Close*, which is the word every
other closable screen uses after 2026-09-01 and which is honest in both
layouts: on a phone it reveals the tier, in a split it empties the pane.

**The present room is the existing live bar, promoted.** Same card, same
availability dot, same tap; it moves from Home's header to the tier's, above
the switch. Absent when you are present nowhere, as it is now. This is what
makes the iPad case correct **without** duplicating a live room into a list of
contacts, and it is the whole reason the tier is worth building rather than
being a tidier arrangement of the same parts.

**Settings, Chip in and Standings are tier-level.** Each is about the
application rather than about either list, which is the same argument in three
places. Settings is already a header button and stays one.

## The decision this document does not make

**How prominent Chip in becomes.** Promoting it to the tier is a claim about
what it belongs to, not about how loudly it should ask. The comment quoted
above is a real argument and it survives the restructure: somebody passing
through should not be met by a request for money. Three ways to honour both:

- **Pinned at the foot of the tier.** Most visible, always on screen. Furthest
  from what the comment asks for.
- **At the end of the tier's own scroll**, below the list. As visible as today,
  and it stops being the tail of your channels while staying the last thing you
  meet. **Recommended** — the structural claim is answered and the tone is not
  changed.
- **Folded behind Settings.** Quietest, and it makes Settings a drawer of
  unrelated things, which is what Home's footer already is.

## What it does not change

Nothing on the wire, in the reducer, in presence or in the audio. This is a
pure client restructure: no protocol change, no compatibility floor, nothing to
deploy before it.

What it does change is the first screen every existing user sees on launch, so
it is a release-note item, and it wants the walk in APPREVIEWSCRIPT.md before
it goes anywhere — that walk found eight defects the last time a screen moved
this much.

## Open questions

- **Where do contact requests go?** Home currently carries two request-shaped
  sections: *Invitations*, which are channel invitations, and *Requests*, which
  are contact requests. Under the tier the second is Contacts' business and the
  first is Channels'. Splitting them is probably right and would leave each tab
  answering for its own pending work — but it moves something people are used
  to finding in one place, and the two are adjacent today for a reason nobody
  has written down.
- **Does the switch carry counts?** If requests split by tab, a pending
  contact request while you are looking at Channels becomes invisible. A badge
  on the switch is the obvious answer and the first thing that will be asked
  for; whether it belongs in the first version is a separate question.
- **Does the *You* card move?** It sits inside the Contacts tab and is your own
  profile — about you rather than about your contacts, which is precisely the
  argument that promotes Chip in. If it moves, the Contacts tab becomes purely
  other people, which reads better; if it does not, the argument for Chip in is
  weaker than this document claims.
- **Does the tier keep a title on a phone?** Four pinned rows — title, live
  room, switch, and whatever sits at the foot — is a lot of a small screen
  spent before the first channel. The title is the most droppable of them.
- **What does `HomeView` become?** It is 1130 lines and is currently a screen,
  a header, a live bar and a list at once. The tier takes three of those four,
  which is a real refactor rather than a move, and the seam has not been drawn.

# The film is not a tab

**The defect, asked as a question.** *What happens when there is a watch party
and somebody new steps into the room?* They land on *Members*, which is where
everybody lands, and the answer was: nothing. No picture, because the player
was a child of the *Watch* tab's card and that card was not being drawn. No
film sound, for the same reason. No room audio either, if the party had *mute
the room* on — every microphone withheld, including theirs. And the room was
told they were watching: the default took the *screen* role the moment they
stepped in, `watchingHere` said so, and `isScreening` in `core/micNeeded.ts`
closed their microphone on the strength of a player that did not exist. The
only thing on their screen that knew a party was running was a greyed-out
*Claim* whose hint still read *Claim the floor*.

The same thing happened to anybody already watching who tapped another tab.
`planning/tasks/what-happens-when-one-selects-other-tab-during-watch.md` had
been open, with nothing in it but that title, since the tab shipped.

**So the tab decides where the picture is, and no longer whether there is
one.** The player is mounted for as long as this device is the party's screen,
wherever in the channel somebody is standing. On *Watch* it is a pinned row
under the tabs; on the other five it is a small rectangle in the bottom-right
corner that can be dragged anywhere in the body and tapped to go back to the
controls.

## One element in two styles, which is the load-bearing part

A `WebView` that is reparented is a `WebView` rebuilt: the page reloads, the
film restarts from black and `useFollow` drives it back to where the room is.
That is an accepted cost once, on expanding to full screen — it is written
down in `ChannelView` and it is a few seconds for one person who pressed a
button. It is not an acceptable cost *per tab change*.

So the docked picture and the floating one cannot be two renders in two
branches of the tree. `watch/Dock.tsx` is three views throughout, and what
changes between the places is a style object and whether the drag surface is
mounted. `dock.test.tsx` asserts it by counting mounts of the child across
four moves, because nothing about the code makes the mistake obvious: adding
a wrapper in one branch would look like tidying and would reintroduce the
reload, and the symptom — a black rectangle and a buffer whenever somebody
touches the tab bar — does not point at the commit that caused it.

**`Screen` grew an `aside` for it**, one slot at one fixed depth, which is the
same reasoning `Panes` gives for putting the detail pane at one depth in both
arrangements. It sits between the header and the scroll: in flow it takes its
own height out of the body and covers nothing, which is the rule the pinned
header and footer keep; floating, it is `position: absolute` over the scroll
and says `zIndex`, being drawn before it.

The wrapper around the `ScrollView` moved inside a new one so that the
`reveal` measurement is still taken against the scroll's own box. A pinned row
inside the measured frame would have put every reveal out by the height of
that row — silently, and only on a screen that had both.

## Stepping out is what stops a film now

The tab bar had been an accidental transport: leaving the *Watch* tab stopped
the film for you and nobody else. Removing that leaves a real question — how
do you stop watching without stopping the party? — and the ladder already
answers it. *Nearby* and *out* are the two ways of not wanting to watch, and
both of them say so to the room instead of withdrawing behind a tab.

**It is a precondition and not only a repair**, which is the correction of the
same day: being in the room is part of what makes this device the screen, read
where the picture is drawn rather than only in the effect that gives the role
up. An effect runs after a commit, so a rule written only there mounts the
player for a render — loading the page, on a screen belonging to somebody who
has just said they do not want one. The *Watch on* switch is refused from
outside the room for the same reason; *this device* was otherwise a way to
start a film playing at somebody who is nearby. **And nearby is the same
answer as out**, the half that could be mistaken for a middle: that rung is
`waiting` rather than `present`, reachability rather than attendance.

**`inRoom` and not `isPresent`**, which is the trap in writing that rule the
obvious way: a guest is in the room without ever being in `present`, and a
guest link is very often the one somebody sends in order to watch something
together — so a presence check would have made that the single thing the link
cannot do. The reducer already draws the line there, `WATCH_HERE` asking
`inRoom`, so this is the screen agreeing with the rules rather than keeping a
second copy of them.

So this device gives up the screen role when the **account** leaves the room,
and the mark that makes the default *once per film* is cleared with it, so
stepping back in brings the picture back. The account and not the device is
the whole care in it: a film handed to the laptop belongs to somebody whose
phone holds their presence, and a rule written against `steppedIn` would take
it off that laptop the moment it arrived. The server already agrees —
`watchingHere` is filtered by `present` wherever it is read — so this is the
device doing locally what the room believes about it.

This reverses one sentence of the 2026-09-18 design, which said that stepping
out left an existing screen alone, a default not being an invariant. That was
affordable while the picture existed on one tab only.

## What it is not

- **Not a system picture-in-picture.** Nothing leaves the app: this is a
  rectangle in the channel screen, and it goes when the screen does. A film
  that survived navigating to Home would have to be mounted above the router,
  which is a larger change and is not this one —
  `planning/backlog/the-film-stops-when-you-leave-the-channel-screen.md`.
- **Not a second transport.** The rectangle is 168pt and has room for nothing.
  A tap on it opens the *Watch* tab, where every control is; the controls are
  deliberately not miniaturised onto it.
- **Not a change to the wire.** No action, snapshot field or server rule moved,
  so there is no shim and nothing to deploy. What the room knew about a
  watcher was already right; it was the watcher's own screen that was empty.

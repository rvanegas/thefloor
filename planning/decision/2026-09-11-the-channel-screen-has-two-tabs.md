# The channel screen has two tabs

2026-09-11. **Superseded the next day by
`2026-09-12-the-channel-screen-is-six-tabs.md`**, which kept the mechanism
described here and finished the split: the roster tab was still the whole of
the old scroll, and four more tabs came off it. What is below is still the
reasoning for *Invite links* being a tab and for `Segmented` being the drawing.

The channel screen is one scroll with ten sections on it, and the two that say
who gets in were at the bottom of it: *Invite*, then *Guest link*, under a
*Who gets in* heading, below the recordings. That order was deliberate — it is
argued in the comment that used to sit over the heading — and the argument was
about *urgency*: inviting is the rarest thing anybody does here and the least
part of a conversation in progress, so it goes last.

The argument is still right about which of the two somebody wants first. It
was paying for that with distance: the whole screen had to be scrolled past to
reach either of them, including the watch party, the recordings and everything
else the channel is carrying.

**So they are a tab instead, and the roster is the other one.** The switch is
under the description, above everything else:

- **Roster** — who is here, the floor, your microphone, the way out, and
  everything the channel is carrying. The tab the screen opens on, because a
  channel screen opened is a channel somebody is about to stand in.
- **Invite links** — the two ways somebody who is not here gets in: a contact,
  who already has an account and can simply be asked, and a guest link for
  somebody who has not.

Nothing about either section changed, and nothing moved between them. What
changed is that the second is one tap from anywhere rather than one scroll
from the bottom, and the first is no longer carrying it.

## Two tabs, and between them the whole screen

Rather than a strip at the top swapping one band while the rest of the scroll
stayed put. A tab that governs part of a screen while unrelated sections go on
rendering underneath is a control whose reach nobody can see; these two hold
everything, so the switch says what it does.

That is also why the *Who gets in* heading is gone rather than moved: the tab
is the heading. Said twice it reads as two different claims — a tab about
invitations, and within it a narrower section that is also about invitations.

## The drawing is Home's, and is now shared

`Segmented` in `ui/components.tsx`, extracted from HomeView's
channels/contacts switch when this screen wanted the same thing. One track,
the selected half raised out of it rather than coloured — the accent is what
this app spends on a room somebody is standing in, and a purple half would be
the quieter fact shouting louder. `accessibilityState` carries the selection,
so a screen reader says "Roster, selected, button"; both halves stay pressable
where they are, since a control that goes inert where you already are is one
people press twice.

Not a tab bar at the foot of the screen. The foot of this one is already
spent, on the controls that claim the floor and step in and out.

## What it cost the tests

`findButton` in `ui/testing/harness.tsx` matched on a substring and returned
the first in tree order, and *Invite links* contains *Invite* — so a test that
pressed "Invite" switched tabs and invited nobody, while still passing. It now
prefers an exact match and falls back to the substring, which is what every
other caller was relying on. `showInvites` and `showRoster` are there for the
tap a test has to take before naming a control on the other tab; they throw
rather than quietly doing nothing, so a control that moves back does not leave
a test passing for the wrong reason.

# Home grows without limit and a channel can only be left from inside it

`invitesFor` and `rejoinableFor` partition channels into "invited, never
entered" and "everything you belong to". Nothing ever removes a channel from
the second list, so it accumulates every channel you have ever been in, for
ever. Sorting by presence and recent activity is done; bounding the list is not.

**This is the present tense, not a projection.** On 2026-09-17 the box held 97
channels, 76 of them live, across 32 accounts — and the busiest account was a
participant in **35 live channels**, every one of them a row on its Home. Two
accounts were over thirty.

**Half of it arrived on 2026-08-31**: the ✕ on an invitation now leaves the
channel rather than hiding the row, so the first list can be emptied from Home.
The second still cannot. Leaving a channel you have been in is on its settings
screen, which means entering it first — and entering is an open microphone, so
the only way to get a channel off your Home is to walk into it.

**Truncating this list is the wrong shape, and `rejoinableFor` says so twice in
its own comments.** It is the only door: a channel dropped from it once became
live, permanent and unreachable at the same moment. A channel everyone else has
walked out of is still yours — your name for it, your description, your
recordings hanging off it — and it was deliberately not skipped for that reason.
So a bound has to be either a real state change (leaving, which gives up
membership) or a per-person archive flag **that ships with its own way back in
the same change**, an archived-channels screen. A cutoff that hides the tail
loses channels.

One part already bounds itself and needs nothing: the guest-seat rows appended
at the end of `rejoinableFor` expire with the seat, `channelEmptied` and the
inactivity TTL being the two ends of that rule. Only the membership half is
unbounded.

**This and `every-query-scans-every-channel-ever-created.md` were one entry
until 2026-09-17**, *Two things that ship unbounded, both from channels being
permanent* — which is the title the frozen archive still cites, and which
resolves to this file rather than to the other one. The other half is
`every-query-scans-every-channel-ever-created.md`, which is the cost of the same
permanence measured on the server rather than on the screen. They are not one
piece of work: this one has a client surface and a new screen and is a product
decision; that one is internal and invisible.

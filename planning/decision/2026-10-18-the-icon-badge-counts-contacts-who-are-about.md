# The icon badge counts contacts who are about, not live rooms

Hours after it shipped, the badge's third term changed from *live rooms you
can step into* to *contacts present or nearby in at least one channel you can
step into*. Requests and invitations are unchanged. `badgeCount` in
`core/badge.ts`; `ChannelRegistry.aboutFor` in `server/src/channels.ts` supplies
the set of people.

**People rather than places.** A contact in three rooms counts once; a room
full of strangers in a community counts nothing. The channels are exactly
`rejoinableFor`'s, so an invitation not yet answered gives no access and its
rule is not written a second time.

**Nearby counts now, and the room you stand in is no longer left out.** Both
were deliberate exclusions in the rooms version. Asked for as written: a
contact beside you is a contact who is about. The cost is the one the first
version avoided — two contacts talking each carry a 1 in their pockets for as
long as they talk.

**In a seat, only the people connected in the room**, since who is standing
beside a channel is not a guest's to read; the seat's `nearbyCount` is nought
for the same reason.

Supersedes what `2026-10-18-the-icon-badge-counts-what-is-waiting.md` says
the badge counts; how and when it is sent is unchanged.

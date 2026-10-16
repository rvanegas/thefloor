# The ways in are a card on People

Rodrigo, 2026-10-16: retire the *Invite* tab and move what it did to *People*,
in a different shape and order. After the people cards, an *Invite* card in
the style of *Add a contact* and *Start a channel*; tapping it expands to
*Invite as member* and *Invite as guest*, in the tab and not as a dialog; and
once one is chosen, a choice between the contacts and a link. A member's link
is a new path resembling `/i/`; a guest's is the existing guest link.

**The sequence is the change.** The tab listed contacts, each row's `+`
forking into *Member* and *Guest* — in the row rather than in an alert since
2026-09-22. The card asks the kind first, then lists
the contacts with that one act on every row, and the link at the foot. Each
step opens in place under the row; *Back* goes up one, and the `+` turned to a
`×` closes it from any.

**Four questions, his answers.**

- **Which contacts:** every accepted contact not already a member — what the
  tab listed. Not only those *in the app now*.
- **What a member link makes:** a membership and nothing else, as a community
  link does. It does not make the follower the sender's contact, which is the
  difference from an invite link.
- **In a community:** *Invite as member*'s link is the community's own link,
  so there is one way in. Member links are not made there.
- **Capacity:** an outstanding member link **holds a place** among the six
  until it is followed, taken back or expires — rather than being checked
  only when it is followed.

**The member link, in the parts not guessable from the code:**

- **`/m/<username>/<pin>`, the invite link's shape and rules**: six digits
  checked only beside the username, good once, thirty days, and wrong guesses
  counted against the owner in the *same* `invite_guesses` budget as invite
  pins, so alternating the two doors buys a guesser nothing. Its own table,
  `member_pins`, with the channel it opens and an id that is not the pin.
- **Holding a place is core's.** `ChannelState.memberLinks` is the room's
  picture of the rows, raised as `MEMBER_LINK_MADE` and projected back on a
  revive, as guest invitations are. `membersPromised` — members plus links
  still standing — is what `capacityOf` is measured against now, by
  `canInvite`, `canJoin`, `canMintMemberLink` and the server's own refusal.
  Read rather than swept, so an expired link gives its place back without
  anything running. `JOIN_BY_LINK` checks no capacity: the link *is* the
  place.
- **Drawn under *Invitations*** with *Take back*, any member who may invite
  being allowed to, since taking one back is how a full channel makes room.
- **Its page names the inviter beside a live pin and never the channel**,
  whose title may be its members' names. *Accept invite* hands the app
  `thefloor://m/…` on iOS and leaves the invitation in the tab elsewhere, as
  the invite page does; the app spends it once there is a session and opens
  the channel. `/m/*` is in the apple-app-site-association, and the pin is
  redacted from logs as `/i/`'s is.

**What went with the tab:** `InviteList`, the per-contact `+` and its offer,
and their styles; *Open Invite* on the getting-started checklist now opens
*People*. `Button` gained an optional `accessibilityLabel`, for a row whose
word is the same on every row.

**Order:** the server deploys first — the AASA must list `/m/*` before a
build that relies on it is installed, and this build mints through a route
an older server does not have. Older builds keep their *Invite* tab against
the new server unchanged; they count only members against the six, so a
channel with links out can offer them an invitation the reducer then refuses.
No shim: nothing old is kept for them, and they lose nothing they had.

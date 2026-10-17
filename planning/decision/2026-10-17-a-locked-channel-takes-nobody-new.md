# A locked channel takes nobody new

Asked for at the prompt on 2026-10-17: channels lockable by an action in
channel settings; a locked channel accepts no new members or guests,
including pending invitations, has no *Invite* button or action, and cannot be
unlocked. Built as `ChannelState.locked`, the `LOCK` action, `canLockChannel`,
`ChannelRegistry.lock` and `POST /channels/:id/lock`. The glossary entry is
*Locked (a channel)*.

The judgements the request left open, and which way each went:

- **Who may lock: whoever may invite**, under `canInvite`'s presence rule —
  every member of a flat channel, a community's owner alone. Locking is the
  same decision about who is in the conversation, taken from the other side,
  so it would be odd for somebody who may widen the roster to be unable to
  stop it widening, or the reverse.
- **"Including pending invitations" was read as *taken back*, not *left to
  fail*.** An invitation here is membership without presence, so a member
  asked in who never entered is dropped from the roster on the lock —
  `pendingInvitees`, the test `invitesFor` makes, restricted to people with an
  `invitedBy` so that neither half of a pair's standing channel nor anybody who
  came by a community's door counts. Member links, guest invitations, knocks,
  guest links and a community's link go in the same step, the durable halves
  with them, so a restart projects nothing back into a locked room. Leaving
  them standing would have been offers that fail on arrival.
- **Seats already taken stay.** The request is about *new* guests; a seat is a
  place to return to, and somebody holding one is not new. Only offers go.
- **The *Invite card* is removed, with a sentence in its place**, rather than
  greyed — STYLE.md's rule for a refusal nobody on the screen can lift. *Add
  to channel* on a guest's card goes too, being a membership.
- **No shim.** `locked` is an optional field older builds ignore; they keep
  drawing the controls, and the server refuses every way in by name — *This
  channel is locked.* — so a press on an old build says why.
- **Spanish *cerrado*, not *bloqueado***, which in an app is what is done to a
  person.

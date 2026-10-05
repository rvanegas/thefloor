# A community's controls are its owner's

Rodrigo's call at the prompt, the day after communities shipped. The first
decision, `2026-10-04-a-community-is-a-channel-with-an-owner.md`, bent the
no-admin rule only as far as removal, deletion and the link: *everybody else
keeps every other privilege*. That is reversed. **In a community, only the
owner controls invitations, media, the name and the description. Every other
member can mute themselves and claim the floor**, and keeps the clipboard and
pinging a contact. Rodrigo kept those two when asked, since neither controls
the channel.

## What the owner alone holds

`holdsTheControls` in core: true for every member of a flat channel, and only
for the owner of a community. It is ANDed into each guard it governs rather
than put in front of them, so a greyed control and a refusing reducer cannot
disagree:

- **Who gets in:** `canInvite`, `canInviteGuest` (guest links and asking a
  contact in as a guest, minting and revoking), `canAnswerKnock`,
  `canManageGuest` (and so `canAskGuestJoin`), `canWithdrawGuestInvite`.
- **Who goes:** `canMoveToRemove`. A member's motion to remove does not exist
  in a community at all.
- **Media:** recording start, pause, resume and stop; the shared track
  (`mayPutSomethingOn`, so loading, playing, seeking and volume); the watch
  party (`canControlWatch`, `canStartWatch`), including the room's mute;
  renaming, deleting and transcribing a recording, on the server.
- **Somebody else's microphone:** `canMuteOther`. Your own is always yours.
- **The name, the description and *Record automatically***: `canEditChannel`.

**An automatic recording still starts whoever walks in.** `autoRecordStarter`
asks the guard without the owner clause, since the owner already made that
choice by turning the setting on. Nobody else can stop it. A member who joined
a community that records itself knew that before walking in.

## Said out loud

The server refuses each of these by name before the reducer's silent no, as
*Only the community's owner can do that.*: `COMMUNITY_OWNER_ACTIONS` for the
socket, and the guest, track and recording routes. Build 336 and earlier still
offer a member every control, so for them this is the whole of the interface's
answer. No shim is needed: nothing on the wire changed shape.

The app's sentences under greyed controls say the owner's, not *step in*,
which would be addressed to somebody who may already be in the room.

## What it settles

The previous decision noted that any member could revoke the owner's link by
renaming the community. Only the owner can rename it now, so that gap is closed.

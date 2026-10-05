# A community has one name, and renaming it revokes its link

Rodrigo's call at the prompt, the day after communities were made from a
channel of one. *Make channel into a community* opened into a name field
pre-filled with the channel's name, which read as a community having a second
name. What it actually did was rename the channel, and the settings screen then
showed the old name in its Name field beside a link minted from the new one,
until the screen was left and opened again.

**A name field only for an unnamed channel.** A named channel becomes a
community under the name it has, and `MAKE_COMMUNITY` keeps that name whatever
the action carries, so the server agrees with the screen rather than trusting
it. An unnamed channel is still asked, since a community's page and link are
read from its name, and the field says the name becomes the channel's.

**The Name field follows the snapshot.** It was read once when the screen
opened. It now takes a name that changed elsewhere, unless somebody is partway
through typing over it.

**Renaming a community revokes its link.** The code is a slug of the name
and a random suffix, and a rename used to leave the code as it was, so a
community renamed from *Cafe Products* went on being handed out as
`/j/cafe-products-…`. Now any rename mints a fresh code from the new name, as
*Reset link* does, and the old one stops opening anything. It is keyed on the
transition in `ChannelRegistry.apply`, so a community's rename revokes the link
on whatever path made it. A link that is off stays off.

**Anyone in the room may rename a community, so any member can now revoke the
owner's link.** Renaming is guarded by `canEditChannel` and not by ownership.
The screen tells whoever renames that the link will reset. Whether renaming a
community should become the owner's alone was not decided here.

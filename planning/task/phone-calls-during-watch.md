# Phone Calls During Watch

Roster should show user to be on a phone call if one is received. Even better, being in a room should count as a phone call such that call from other phone app gets busy signal. Additionally appropriately handle when a call comes in, while watch player is playing something. This may require CallKit.

**More broadly, and not only during a watch:** there ought to be a proper co-existence with phone calls and equivalents, modeled after the functionality of FaceTime and Zoom channels. Merged 2026-10-01 from the backlog entry *Interaction with phonecalls*, which asked exactly that.

**Shares its mechanism with `mute-a-locked-phone-through-callkit.md`.** Reporting a channel to iOS as a call the app started is what would give the busy signal here and the lock screen mute there, and it collides with the "no CallKit" position in `apply-the-app-store-listing.md` and `post-to-the-launch-surfaces.md` in both. Decide the two together.

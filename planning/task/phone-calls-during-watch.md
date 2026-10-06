# Phone Calls During Watch

Roster should show user to be on a phone call if one is received. Even better, being in a room should count as a phone call such that call from other phone app gets busy signal. Additionally appropriately handle when a call comes in, while watch player is playing something. This may require CallKit.

**More broadly, and not only during a watch:** there ought to be a proper co-existence with phone calls and equivalents, modeled after the functionality of FaceTime and Zoom channels. Merged 2026-10-01 from the backlog entry *Interaction with phonecalls*, which asked exactly that.

**Decided 2026-10-06 as part of `integrate-with-callkit.md`, which is where the mechanism now lives.** That file's Phase 3 covers the incoming call: hold, resume, end, and the roster showing somebody as on another call. The busy signal is dropped. iOS gives a CallKit call call waiting, not busy, and Rodrigo let it go. What remains here is the watch-specific half: what a held call does to a film that is playing.

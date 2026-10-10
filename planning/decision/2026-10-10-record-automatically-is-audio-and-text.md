# Record automatically is Audio and Text

Rodrigo asked for *Record automatically* on Channel Settings to become two
toggles, one for audio and one for text, in place of its On/Off pair. **Audio**
is the existing `autoRecord`. **Text** is new: `autoTranscribe`, under which
each sitting begins with the live transcript on.

**That only means something once the live transcript is per sitting, so it
became one.** Until now `liveTranscription` was a standing setting: switched
on, it stayed on from one sitting to the next, and an "automatic" Text would
have been the Record tab's switch drawn a second time. Now the room emptying
turns it off (`settleEmpty`), as it ends a recording, and the first arrival in
an empty room turns it back on if `autoTranscribe` is set (`ENTER`). The two
pairs then say different things. The Record tab says what this conversation
keeps, and Settings says what every conversation starts with. Switching Text
off mid-sitting holds until the room empties and fills again. That is
`autoRecord`'s rule for Audio, and it comes from the shape itself, so it
needs no latch.

**Nothing transcribed before stops.** A row stored with the transcript on and
no `autoTranscribe` is read back with it set, which is what those channels
were already doing.

**Who may set it** is Text's own rule twice over. The `transcripts_unlimited`
mark, checked at a route of its own (`PUT /channels/:id/auto-transcribe`),
since who pays is not the reducer's to know. And `canEditChannel`, as for
Audio beside it: present, and holding the controls. The action,
`SET_AUTO_TRANSCRIBE`, carries no user, like `SET_LIVE_TRANSCRIPTION`.

**Drawn by the Record tab's `KeepSwitch`**, since the two pairs are one pair
seen from two places. The note under them was rewritten to cover both, and to
drop "as soon as there are two of you here", which had been false since
2026-09-14.

**No shim.** The field is additive. Builds from before it still show the
On/Off pair and send `SET_AUTO_RECORD`, which is Audio's and unchanged. The
per-sitting change happens on the server and needs nothing from a client.

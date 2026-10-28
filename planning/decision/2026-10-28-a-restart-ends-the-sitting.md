# A restart ends the sitting

Decided 2026-10-28, after a deploy at 23:17 local on 2026-10-27 brought
`chan_XUllZNbdizxd` back saying *Transcribing* — on the house, with no payer
— while the *Record* tab's Text and *Record automatically*'s Text were both
off, and nobody had asked for a transcript that sitting.

**The two halves of one sitting were restored differently.** `durableOf`
stores `liveTranscription` (and its payer), on the 2026-10-10 reasoning that a
restart mid-sitting should not move the bill to the house. It does not store
`keep`, the switches, or `liveTranscriptionPaused`. `revive` brings the
channel back with nobody present, so the first arrival after a restart is the
first arrival into an empty room, and opens a sitting: `keep` is set from
*Record automatically*'s pair. But that clause only ever turned the transcript
*on*, for `autoTranscribe`, and never off — so a stored transcript ran on under
switches that had just been reset to off.

The likeliest way it was stored on: Text switched off while the room was
paused, which changes only the selection (`SET_KEEP` outside a run), leaving
the transcript held until the next Play or Stop. The hold is not durable, so
the restart released it. Not proven from the logs; every other path keeps the
two in step.

**So the first arrival into an empty room now sets the transcript both
ways** — on for `autoTranscribe` (unless it waits for the audio,
`startsTextWithAudio`), off otherwise, unheld, on the house. In the ordinary
case this changes nothing, the room emptying having turned it off already. It
matters only after a revive, where it makes a restart end the sitting, as it
already ended the floor, the playback and any recording in flight (filed
failed).

**Considered and declined: carrying the sitting across the restart** — storing
`keep` and the hold too, and teaching the first arrival after a revive not to
reset them. More state, a restored-room flag, and a partial version of
task/carry-a-live-channel-across-a-restart.md, which is the place to do it
properly if a restart should ever be invisible.

**What it reverses**: the half of
2026-10-10-free-transcription-minutes-a-week.md that kept a paid transcript
running across a restart. `liveTranscriptionPaidBy` is still stored; nothing
reads it across one any more. `revive` still reads the stored
`liveTranscription`, for `autoTranscribe`'s fallback on rows from before that
field.

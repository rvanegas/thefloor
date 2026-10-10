# Automatic Audio and Text begin together

Rodrigo, the evening of 2026-10-10: in a channel set to *Record automatically*
both ways, the first member present found Text running and Audio not. **The
text and audio must coincide, if both are intended**, according to the
channel's settings.

**What held the audio back was not a wait for a second person.** No such rule
has existed since 2026-09-14; one person alone with an open microphone may be
recorded, automatically or by hand. It was a film. The channel's watch party
still held "Scalp Misalignment", left paused at its end from an earlier
sitting, and a recording is refused while any film is loaded, so that a
recording never silently misses the thing everybody was reacting to. The
phone's diagnostics showed the player being told to hold at 2:10, and the box
showed no egress requested for that sitting. The live transcript has no such
rule, so the first arrival turned it on.

**The fix is that the text waits for the audio** (`startsTextWithAudio` in
core). With both settings on, the first arrival leaves the text off, and the
server's automatic start begins both in one step: `START_RECORDING` carrying
`withText`, which only the latch sets, as only it sets `automatic`. The
sitting's first segment is then kept both ways from its first instant.
Where only Text is automatic it still begins on the arrival. If the audio can
never start, neither does the text, which is what *coincide* asks for.

**Left as it was, for Rodrigo to decide separately:** whether a film that has
finished, or that nobody is watching, should still refuse a recording. The
rule is `watchPartyIsOn` in `recordingStartable`, and it reads the party as
loaded rather than playing on purpose; see the comment there.

**A known gap.** The text joins the *automatic* run only. If somebody starts
the audio by hand first in such a sitting, the latch is spent, and the text
starts only if that person's Start includes it.

**No shim.** Older builds draw whatever the snapshot says. `withText` is
server-set, and the wire form of `START_RECORDING` cannot carry it.

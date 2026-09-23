# Why a playout-only engine renders nothing is not known

**The one thing left over from the shared-playback investigation**, which closed
on 2026-09-23 — `decisions/2026-09-23-the-phone-holds-a-microphone-in-order-to-hear.md`
is the whole account, and this entry assumes it.

`engine start play=T rec=F` says the audio device module believes playout is
enabled, and in that state a subscribed track renders nothing. Open the
microphone and the same subscription renders. **Nobody knows what below `play=T`
fails to run the render side once recording stops** — the likeliest guess, and it
is only a guess, is the VoiceProcessingIO unit being initialised without an
input.

**The hold is a workaround with a chosen cost, not an explanation**, and the cost
is HFP rather than A2DP for all media playback: mono, 16kHz, echo cancellation on
the music, and a lit microphone indicator for as long as anything is subscribed.
An answer here is what would let that be given back.

It is a question about the ADM rather than about rooms, subscriptions or
ordering, and the difficulty is that the ADM is a prebuilt binary — LiveKit's
WebRTC fork is not a public repository and only the header ships. So it is
measured rather than read. `app/src/audio/probe.ts` is the bisection by ear,
written for a different question and never run to completion; running it would
also answer **which of the nine ADM readers is destructive**, since reading the
engine is what stopped the audio for four days in August and the panel has had
to keep its hands off ever since.

Not urgent: the sound works, and the person who would notice the cost is on a
Bluetooth headset listening to music rather than to a voice.

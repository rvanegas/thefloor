# A request waits for what it needs instead of being refused until it is ready

For the first seconds after a run stopped, while its mix was being made, two
things on the card were refused that had no reason to be: **Transcribe**,
disabled in the app, and **agreeing to publish**, refused by the server with
"This recording is still being prepared." Both are requests whose execution
was already asynchronous and already had a pending state of its own — a
transcript is `pending` until its jobs land, a published episode is
`preparing` until its file is stored. Whatever they depend on finishing can
simply be what executing them waits for. Refusing the request until the
dependency settled made the person do the waiting, and said nothing about why.

**The line this draws is between a request and a read.** Play and Share stay
disabled while mixing: somebody is holding the request open for the bytes, and
there is nothing to defer to. Rename never waited — it is about the row, not
the audio. Anything that is a change somebody is asking for, and that finishes
in the background anyway, is accepted at once.

**Transcription defers in the job, not in the request.** `submitJob` leaves a
job for a later tick while its recording's `mix_state` is `'pending'`. The
dependency is real — `stopEgress` returns before the upload lands, the stem
read does not wait, and a failed mix can still drop a hollow stem — but the
mix settling is the point at which all of that is decided, since the mix
itself waits for every stem. Waiting with `getWhenReady` inside the job was the
alternative and was not taken: the job chain is serial, and a mix can wait ten
minutes for a stem, so one recording would hold every other transcript up.

**Publication waits in the transcode.** The consent is recorded and, once
unanimous, the row is marked published at once; `transcode` awaits
`Mixer.mixSettled` before it asks for the audio. Without that wait it would
have encoded a second copy with no patience for stems and settled `'failed'`.
Who must consent is computed from the stems, and the only thing the mix can
do to them is drop a hollow one on failure — so the set can shrink after a
consent and never grow, and a consent given early is never one that should not
count.

**A restart is the one cost.** A published row whose file is `'pending'` was
read by nothing on boot, so a restart between the last consent and the file
being stored left the episode preparing for good. The window used to be a
transcode's few seconds; now it includes the mix. `Publication.resume`, called
from `index.ts` after the registry's boot sweep has restarted the mixes,
starts those transcodes again.

**Old builds.** Consent was only ever refused by the server, so every
installed build gets it with the deploy. Transcribe stays disabled while
mixing on builds before this one, which is merely the old caution; nothing on
the wire changed.

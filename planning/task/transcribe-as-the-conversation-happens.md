# Transcribe as the conversation happens

Find out whether streaming transcription is viable. It came up on the call of
2026-09-30. Todd says AssemblyAI does real time, and uses it in another app.
TRANSCRIPTS.md chose **batch** on purpose, and in § *The provider is an
interface* it warns off the realtime API's `speech_model` shape.

It matters because of "Keep the transcript and let the audio go". If text can
come straight from the live media, the audio never has to exist as a stored
object. As Rodrigo put it, that is the only way transcript-only works. Things
to find out:

- whether their streaming API takes one track per speaker, so that
  identity-by-stem, which the whole design depends on, survives;
- what it costs per hour compared with batch (about 20¢ now);
- where it would connect: a LiveKit track egress or agent on the box, and what
  that costs the box (INFRASTRUCTURE.md § *What the box can carry*);
- how it handles the floor. A silenced speaker is captured today and gated
  only at export, so streaming would have to apply that gate while the call is
  running.

**The provider question comes with it.** Rodrigo expects to move off
AssemblyAI to something cheaper. His guess is that the price falls from 20¢ an
hour to 2¢ within a year, and that at that price it can be free. Todd pointed
out that Whisper-class models running locally already cost almost nothing. A
self-hosted streaming model on the media box is one of the answers to
evaluate, not just a footnote.

## Findings, 2026-09-30

**Viable, with AssemblyAI. Not viable self-hosted on the media box.** Read
against ASSEMBLY_PROMPT.md, the code, and AssemblyAI's live pricing page —
which already disagrees with the snapshot: their flagship realtime model is
now "Universal-3.6 Pro", where the prompt says 3.5.

**Identity-by-stem survives, because the API forces it.** A realtime session
is one WebSocket carrying one mono 16 kHz PCM stream (ASSEMBLY_PROMPT § 9), so
it is one session per identity — the same one-job-per-stem shape TRANSCRIPTS.md
chose. There is no multichannel option to be tempted by. Diarisation is
optional (`speaker_labels=true`) and costs +$0.12/hr per stream there; it is
worth paying on the `media` stem, the one where it was ever information, and
probably nowhere else.

**Cost is a wash with batch, if the model is the cheap one.** Streaming is
billed for **as long as the WebSocket is open, not for audio sent**, which
ASSEMBLY_PROMPT does not say. Universal-Streaming (English or Multilingual) is
$0.15/hr; the flagship realtime model $0.45/hr. Batch is $0.21/hr on U3.5 Pro
and $0.15 on U2 — and batch already pays for silence, since every gated stem
is rendered at the recording's full length. So per speaker-hour, the cheap
streaming model costs what batch does now, and the flagship double.
Rate limits: 100 new streams a minute pay-as-you-go, 5 on the free tier.

**Where it connects: an rtc-node subscriber in the server process, not an
egress.** `server/src/media.ts` already joins rooms with `@livekit/rtc-node`
to publish played audio (`openPlayback`, `autoSubscribe: false` on purpose).
A transcriber is that in reverse: subscribe to each audio track, take the
decoded 48 kHz frames, resample to 16 kHz, one WebSocket per identity. It
uses no egress job, so it does not count against the `track_cpu_cost` cap of
~10 participants (INFRASTRUCTURE.md § *What the box can carry*). What it does
cost is Opus decoding and resampling on 2 vCPU — small per stream, unmeasured.
Sessions cap at 3 hours (close code 3008), so a long call has to roll over to
a fresh session.

**The floor is easier live than at export.** Silencing unsubscribes the
listeners from a track (`media.ts`, `updateSubscriptions`); the silenced
person still publishes, which is why egress captures them. The server holds
floor state in memory, so the transcriber can gate at the source. **Gated
audio must be sent as zeros, not dropped**: word timestamps count from the
audio sent, so dropping frames would push them off the recording's timeline,
and zeros are what `buildStemGraph` does at export anyway. Billing is by
connection time, so dropping would save nothing either. One honest difference:
the live gate follows the moment the server *acted* on a floor change, the
export gate follows `floor_timeline`'s timestamps, and the two can differ by
a few hundred milliseconds at a boundary. The live one is arguably closer to
what listeners actually heard.

**What it does for "Keep the transcript and let the audio go":** nothing is
written to S3, so letting the audio go stops needing an unattended delete and
`decision/2026-09-23-the-server-may-not-delete-recordings-and-a-person-does-it-instead.md`
is never reopened. The audio still exists briefly at AssemblyAI while it is
being transcribed, so the red indicator and the consent question stand exactly
as that task says.

**What it costs the design.** TRANSCRIPTS.md's model inverts: a transcript is
no longer *attached to* a recording, it can exist without one. And streaming
has to be set up before the call starts, so it cannot be a button pressed on
a finished recording. That makes it a channel setting, which collides with the
one-free-transcript-per-account rule, and gives up batch's restart recovery
(the provider id in the row, polled on the tick) — a server restart mid-call
loses whatever was in flight. TRANSCRIPTS.md's warning about `speech_model` is
about the parameter's shape (realtime takes a required singular string, batch
the plural fallback array), not an argument against streaming.

**Self-hosted is a second box, not this one.** The box is 2 vCPU, 2 GB,
already carrying the SFU, egress and the app. Whisper-class streaming for
several simultaneous speakers needs roughly a core per stream, or a GPU. It is
realistic only on separate hardware, which trades per-hour billing for a
monthly one. Either way the seam should be a `StreamingTranscriptionProvider`
interface (open, send audio, turns arrive, close) beside the batch one, so
moving off AssemblyAI later touches neither the gate nor the per-identity
sessions.

**Next step, if pursued:** a spike on the box with one rtc-node subscriber
and two speakers, measuring CPU use and how well the live gate lines up with
`floor_timeline`, on Universal-Streaming Multilingual at $0.15/hr.

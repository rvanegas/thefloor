# Live transcription runs without a recording

A channel can be transcribed as it talks, with no recording behind it. Built
2026-10-09 from `task/transcribe-as-the-conversation-happens.md`, whose
findings of 2026-09-30 said it was viable with AssemblyAI and not self-hosted
on this box.

**Rodrigo's three answers decided the shape.** It runs whenever anybody talks
in a chosen channel, not only while recording, which is the first half of
`keep-the-transcript-and-let-the-audio-go.md`: the audio is never written,
here or in the bucket, so nothing has to delete it unattended. It is switched
on by a toggle in channel settings that only he sees, and it is read in a
**Transcript tab** as one continuous history per channel, the first piece of
`the-channel-is-one-long-conversation.md`. The alternatives put to him were a
recording-only trigger, a box-side script, and rows in the Recordings tab or a
captions strip.

**Who may switch it is the `transcripts_unlimited` mark**, checked by the
server's route rather than by the reducer, which has never heard of accounts.
That is the house paying until `free-to-talk-paid-to-transcribe-and-digest.md`
settles who pays; the switch is drawn for nobody else, and the route answers
everybody else 404.

**How it works, in the parts that are not guessable from the code:**

- **A hidden rtc-node participant per transcribing channel**, `transcriber`,
  subscribed to every microphone; LiveKit resamples to 16 kHz mono for it.
  Silencing acts on the room's listeners by name, and this is not one, so the
  floor is applied by the transcriber itself: a withheld speaker's frames
  become zeros before they leave.
- **One AssemblyAI streaming session per speaker**, on
  `universal-streaming-multilingual` (about $0.15/hr, English and Spanish), with
  no speaker labels: a stem is one voice
  (`2026-10-09-a-stem-is-one-voice.md`). Billing is by connection time, so a
  session opens on the first audible frame, with half a second of pre-roll,
  and closes after 30 s of silence. Each session's cost is a row in
  `live_sessions`.
- **Lines are placed on the wall clock**, there being no recording timeline:
  anchors of (audio offset, time heard) are recorded as audio is sent, and a
  turn's offsets map back through them.
- **The name is frozen with each line**, as `participant_names` freezes a
  recording's.

**The indicator spends the recording's red**, the same pill in the same place
without a clock, and gives way to the recording when both are true. Guests are
told on the seat page in the same card. The privacy page qualifies its two
claims that would otherwise be false where the server can stream: that only a
deliberate recording is stored, and that the provider receives only what
somebody asked to have transcribed.

**Not in this version, on purpose:** partial turns on screen, search over
live lines, deleting them, guests reading the tab, the digest and catch-up
that will read from it, and recovery across a restart — a restart drops what
was in flight, a few seconds per speaker. **Unmeasured:** what the decode and
resample cost the 2 vCPU box per speaker, which the findings called small.

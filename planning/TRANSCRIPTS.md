# Transcripts

**Temporary.** This is the design for TASKS.md § *Transcripts*, and it is
deleted when the work ships — whatever survives goes to DECISIONS.md, the way
WATCHPARTY.md and USAGE.md went. Nothing here is built yet.

The request: AssemblyAI, batch rather than streaming, multi-channel,
multi-language, speaker identification, triggered by hand on a recording,
attached to it, exportable, searchable during playback and across a channel's
recordings.

---

## The one thing that decides the shape: we already have the stems

A recording is not one file. `recordings.stems` is
`{ [identity]: Array<{ key, startMs }> }` — one isolated Opus object per
participant per capture segment, because the floor is applied at encode time
and a mix cannot be un-mixed (see `server/src/export.ts`). Every participant had
their own microphone and their own egress job.

So **speaker identification is not an inference we have to buy.** Diarization
guesses that two voices are two people and cannot say which two; our stems
*know*, by construction, because the identity is the account id the egress job
was opened for. The provider is asked to answer "what words are in this audio",
which is the thing it is good at, and never "whose voice is this", which is the
thing it is merely decent at and which we can answer exactly.

That has three consequences that run through everything below:

- **`speaker_labels` is off.** Diarization on a mix would be strictly worse
  information than we already hold, and it would be *disagreeable* information:
  a channel screen that names four participants beside a transcript that says
  "Speaker A" is a screen with two answers on it.
- **One job per stem, not one multichannel job.** AssemblyAI's `multichannel`
  bills per channel, so a single N-channel file costs exactly what N separate
  jobs cost — the parameter buys convenience, not money. Separate jobs buy
  something back: per-speaker language detection (below), independent retry of
  the one stem that failed, and no N-channel WAV to build and get wrong.
- **Overlap stops being a problem and becomes a fact.** Two people talking over
  each other are two jobs neither of which contains the other. A transcript can
  therefore honestly show simultaneous utterances, which a mix-based one cannot
  represent at all.

The two costs of the per-stem approach, stated so they are not discovered
later. **Bleed**: on a speakerphone each stem contains the other party faintly,
and the provider may transcribe it, producing a line attributed to the wrong
person. Cheap mitigation is a confidence floor per utterance; the honest
mitigation is that this is a headphones-first app and the floor mechanic exists
precisely so one person talks at a time. **The `media` identity**:
`MEDIA_IDENTITY` (`'media'`, `server/src/channels.ts:147`) is the shared
playback stem — a track somebody played into the room, which is not a speaker.
It is excluded from the audience already and must be excluded here, or a
recording containing a song becomes a transcript of the lyrics attributed to a
participant who does not exist.

---

## What is sent is the *gated* stem, never the raw one

This is the part to get right before any code.

The stems in the bucket are complete: they contain what a silenced person said
while they held no floor. `buildFilterGraph` is what removes it, and
`server/src/export.ts` says so in its own header — "the last thing standing
between a silenced remark and a user's ears". A transcript built from raw stems
would walk straight round that: a searchable, exportable, permanent text of the
remark the recording deliberately does not contain.

So the audio submitted for one identity is that identity's branch of the
existing filter graph and nothing new: segments placed at their `startMs` with
`adelay`, then the floor windows gated to zero, encoded to one Opus file. The
refactor is small — lift the per-identity half of `buildFilterGraph` into
`buildStemGraph(request, identity, inputIndex)` and have the existing function
call it in a loop, so the mix and the transcript cannot come apart. If the
gating is ever changed, both change together, which is the property that
matters.

Rendering with the delays in place also means **the provider's word timestamps
are already recording-timeline timestamps**. No offset arithmetic anywhere; a
word's `start` is a position in the same milliseconds the scrubber runs on and
the same ones `floor_timeline` uses. That is worth paying for: a late joiner's
leading silence is billed as audio at $0.15/hour, which is 0.15 cents a minute
of silence, and the alternative is an offset correction in three places. If it
ever matters, strip the leading silence and add `startMs` back on ingest — but
not first.

---

## The provider is an interface, like everything else here

`MediaServer` is an interface, `RecordingStore` is an interface, `Decoder` and
`StemEncoder` are interfaces. Same reason and same shape:

```ts
export interface TranscriptionProvider {
  /** Uploads bytes and starts a job. Returns the provider's id for it. */
  submit(audio: Buffer, options: { languageDetection: boolean }): Promise<string>;
  /** One poll. Never throws for `queued`/`processing`. */
  poll(id: string): Promise<
    | { state: 'pending' }
    | { state: 'ready'; languageCode: string | null; utterances: Utterance[] }
    | { state: 'failed'; error: string }
  >;
  /** Removes the transcript *and the uploaded audio* from the provider. */
  forget(id: string): Promise<void>;
}
```

with `AssemblyAI` implementing it and a memory double in the tests, so the whole
lifecycle — pending, ready, failed, boot recovery, deletion — is testable
without a network or a key. The suite already runs with no media server and no
bucket; this must not be the thing that breaks that.

The concrete calls, verified against the current docs:

- `POST https://api.assemblyai.com/v2/upload` with the bytes and
  `Authorization: <key>`, returning `{ upload_url }`. Ogg/Opus is a supported
  input format, so the rendered stem goes as-is with no second encode.
- `POST /v2/transcript` with `{ audio_url, language_detection: true,
  punctuate: true, format_text: true }`. `speech_models` defaults to the
  current model pair; pin it once and record which, so a provider-side model
  change is a decision rather than a surprise in the diff of a re-run.
- `GET /v2/transcript/:id` until `status` is `completed` or `error`. Words and
  utterances carry `start`/`end` in milliseconds.
- `DELETE /v2/transcript/:id`, which also destroys the uploaded audio.

**Upload rather than a presigned S3 URL**, though the docs support both. The
bytes we want the provider to have do not exist in the bucket — the stems there
are ungated and the mix there is everybody at once — so there is nothing to
presign that we are willing to send. Uploading the rendered file also gives the
deletion story its teeth: one DELETE removes the audio and the text together.

**Polling, not webhooks.** A webhook is one fewer moving part in the happy case
and a new public route, a shared secret, and *still* a reconciler for the call
that never arrived. The reconciler alone is the whole job, and the pattern for
it already exists: `mix_state = 'pending'` with `restore()` finalizing strays at
boot. Poll from the existing tick, only while some job is open, with a backoff;
a restart mid-job resumes because the provider's id is in the row.

---

## Schema

Three tables. Rows hang off `recordings` and die with it.

```sql
CREATE TABLE transcripts (
  recording_id TEXT PRIMARY KEY REFERENCES recordings(id),
  state        TEXT NOT NULL,   -- 'pending' | 'ready' | 'failed'
  requested_by TEXT NOT NULL,   -- account id; shown, because this sends audio out
  requested_at INTEGER NOT NULL,
  completed_at INTEGER,
  failure      TEXT,
  provider     TEXT NOT NULL,   -- 'assemblyai'
  model        TEXT,            -- what actually ran, as the provider reported it
  billed_ms    INTEGER          -- summed channel-milliseconds, for bin/usage
);

CREATE TABLE transcript_jobs (
  id           TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id),
  identity     TEXT NOT NULL,   -- whose stem; never 'media'
  provider_id  TEXT,            -- null until submitted
  state        TEXT NOT NULL,   -- 'pending' | 'ready' | 'failed'
  language     TEXT,            -- what detection said, per speaker
  failure      TEXT
);

CREATE TABLE transcript_lines (
  id           TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id),
  channel_id   TEXT NOT NULL,   -- denormalised: channel-wide search reads it
  identity     TEXT NOT NULL,
  start_ms     INTEGER NOT NULL,
  end_ms       INTEGER NOT NULL,
  text         TEXT NOT NULL,
  confidence   REAL
);
```

Utterances rather than words, deliberately: a line is what a person can read,
tap and be taken to. Word timings are what utterance boundaries are made of and
are not otherwise useful to anything on screen, so they are not stored — if
karaoke-style highlighting is ever wanted, that is the reason to revisit it and
the provider's response is still fetchable until we DELETE it.

`channel_id` is copied onto the line so the channel-wide search is one index
scan rather than a join through `recordings` on every keystroke. It is
denormalised data with exactly one writer and no update path — a recording does
not change channel — which is the only kind worth denormalising.

Search is **FTS5**, external-content over `transcript_lines`:

```sql
CREATE VIRTUAL TABLE transcript_fts USING fts5(
  text, content='transcript_lines', content_rowid='rowid'
);
```

**Verify FTS5 on the box before this schema is written.** It is present in the
Node 24 build on this laptop (checked); the box is Node 22, and `node:sqlite`'s
compile flags are not something to assume across a major version. One line
settles it:

    ssh ubuntu@44.241.121.49 "node -e \"const{DatabaseSync}=require('node:sqlite');new DatabaseSync(':memory:').exec('CREATE VIRTUAL TABLE t USING fts5(x)');console.log('ok')\""

If it is missing, the fallback is `LIKE '%…%'` over `transcript_lines` scoped to
one channel, which at this scale is fine and which is what the first version
should be if there is any doubt — the index is an optimisation, not the feature.

---

## Who may ask for one, and what it costs

`$0.15` per audio-hour per channel on the current standard model. A one-hour
conversation between two people is 30 cents; the same hour with four is 60.
Cheap, and not free, and the first thing on this project that costs money per
tap rather than per month. That is why the task says *manually triggered* and
why this design does not sneak in an automatic one.

- **One transcript per recording.** Re-running is only offered after a failure,
  and it replaces. Nothing gives a user a button that spends money twice for the
  same answer.
- **The rule for who may trigger it is the `manageable` rule, not the export
  rule.** Export is a read by one person of their own conversation. This sends
  everybody's audio to a third party and produces a shared artefact on
  everybody's screen — it is a change to the channel, like renaming and
  deleting, so it wants the same guard (`hasTheRoomIn`) and `requested_by` is
  shown beside the transcript so it is never anonymous.
- **Metered.** `billed_ms` per transcript, and a `usage_bytes` entry of the same
  kind the mix already writes, so `bin/usage` can answer "what did transcription
  cost last month" without anybody guessing.
- **A cap is worth having and is not worth having first.** If it turns out to
  need one, `TRANSCRIPT_MONTHLY_MINUTES` in the env, refused with a message
  naming the reset date. Do not build it speculatively.

Absent an API key the whole thing is off: the route answers 503 and the wire
field says the feature is unavailable, so the button never appears. Exactly what
`options.store` does for recordings today.

---

## The privacy policy blocks this, and has to change first

`server/src/privacy.ts` currently says, in two places:

> There is no advertising, no third-party analytics, and **no service anywhere
> that receives your activity.**

> Amazon Web Services stores the recordings … Ko-fi handles donations. **None of
> them receive your conversations** — the recording storage key used by the
> media server can only add files, not read them back.

Both sentences become false the first time somebody taps Transcribe. This is not
a documentation chore to be done afterwards; it is the sentence the feature
contradicts, on a page the App Store submission points at.

What has to happen, in the same deploy as the server side:

1. The page gains transcription: that audio from a recording is sent to
   AssemblyAI in the United States when somebody in the channel asks for it,
   that the provider is asked to return text and nothing else, that the audio
   and the text are deleted from the provider as soon as the text is stored
   here, and that the transcript is deleted with its recording.
2. The "who else can see any of it" list gains a fourth name, and the "none of
   them receive your conversations" clause is narrowed to the three that still
   do not.
3. The trigger carries a confirmation naming the provider — not a dark-pattern
   dialog, one sentence, because the person tapping it is deciding for everyone
   who was in the room.
4. **The App Store data-collection answers change too.** Audio leaving for a
   third-party processor is a disclosure, and getting it wrong is a rejection at
   the wrong end of a submission. See RELEASING.md.

And the deletion promise has to be kept in two places: `forget()` when the text
lands, and again in the sweep that deletes a recording — belt and braces,
because the first one can fail and nobody would notice.

**`ASSEMBLYAI_API_KEY` is the eighth credential.** It goes in `server/.env`,
`server/.env.example`, `bin/env-push`'s prompts, and a section in
CREDENTIALS.md saying what it can do (spend money, read the transcripts we have
not yet deleted) and what losing it costs.

---

## Multi-language

`language_detection: true` per job — which is a real reason to prefer per-stem
over one multichannel file, since detection is per file and a multichannel
submission would force one language on everybody in the room. Each speaker's
language is detected from their own audio and stored on their job, so a channel
where one person speaks Spanish and the other English transcribes correctly with
no setting anywhere.

Two limits worth knowing. Detection is per *file*, so a speaker who switches
language mid-recording gets one label and the weaker half of the transcript. And
detection needs some seconds of speech; a stem that is almost entirely silence —
a participant who barely spoke — may come back with nothing or with a wrong
label, which is another argument for the confidence floor.

---

## What the app gets

Wire changes are additive and optional, per the rule about never shipping a wire
change a client cannot speak. `RecordingView` gains:

```ts
transcript?: {
  state: 'none' | 'pending' | 'ready' | 'failed';
  failure?: string;
  requestedBy?: string;
};
```

An older build ignores an unknown field and shows the card exactly as it does
now, so nothing is expired for this.

Routes, all guarded by `recordingsFor` the way the existing four are, and all
answering 404 for absent/deleted/not-yours for the same reason:

| | |
| --- | --- |
| `POST /recordings/:id/transcript` | starts one; 409 if there already is one |
| `GET /recordings/:id/transcript` | the lines, with names resolved |
| `GET /recordings/:id/transcript/export?format=txt\|vtt\|json` | the download |
| `GET /channels/:id/transcripts/search?q=` | across the channel's recordings |

Export formats: `txt` is speaker-labelled prose for reading, `vtt` is what a
media player wants and what pairs with the exported audio, `json` is the lines
with their timings for anybody who wants to do something else. Names come from
`participant_names`, frozen at filing time, for the reason that column exists —
a transcript that relabels itself when somebody renames themselves is worse than
one with an old name in it.

On screen:

- **`RecordingRow`** gains a Transcript action in the drawer that already holds
  Export and Delete. States are the ones the wire carries: Transcribe /
  Transcribing… / Transcript / Failed, retry.
- **A transcript view** — speaker-labelled lines with timestamps, and a search
  field over that one recording.
- **Channel-wide search** above the recordings list on `ChannelView`, results
  grouped by recording with the matched line and its time.

**Searching during playback needs one honest sentence in the UI.** Playback here
is *shared*: `POST /recordings/:id/play` loads the mix as the channel's track,
and a `SEEK` moves it for everybody in the room, gated by the floor. So
searching is private and jumping is public. Tapping a search hit while that
recording is the loaded track sends `SEEK positionMs` — which is why the
timestamps had to be recording-timeline timestamps, and why rendering the stems
with their delays in place is load-bearing rather than tidy. If the recording is
not loaded, or the tapper does not hold the floor, the line is still readable and
the jump is simply not offered, with the existing `playDisabledReason` wording.

---

## Order of work

Each step lands and deploys on its own; nothing here needs a flag day.

1. **Privacy page, credential, config, provider interface.** No user-visible
   change. Ships the sentence the feature needs to be true.
2. **`buildStemGraph` refactor** in `export.ts`, with a test asserting that one
   identity's gating is identical to the gating that identity gets inside the
   mix. Nothing calls it yet.
3. **Schema, job runner, polling, boot recovery**, behind the absent key. Tested
   entirely against the memory provider: pending → ready, one stem failing while
   the others land, restart mid-job, deletion reaching the provider.
4. **Routes and the wire field.**
5. **App: trigger, transcript view, per-recording search, seek, export.**
6. **Channel-wide search**, plus FTS5 if the box has it.

## Open questions

- **FTS5 on Node 22.** Settle it before step 3 writes a schema that assumes it.
- **Guests.** Their stems are identities too. `participant_names` should carry
  them, but check — a transcript of a guest labelled with a raw session id is a
  bug that only appears with a guest in the room.
- **Legacy rows.** `mix_state = 'unmixed'` recordings still have stems and are
  transcribable; rows with no stems at all must refuse with a clear message
  rather than starting a job over nothing.
- **ffmpeg next to live audio.** Rendering N stems is the mix's cost again, on a
  box that is now also the SFU. Run the jobs one at a time and never during a
  mix. AGENTS.md § *Known rough edges* is the same worry from the deploy side,
  and the answer if it bites is the same $7 box.
- **A confidence floor for bleed**, and whether it is a stored threshold or a
  render-time one. Prefer render-time: the lines are cheap to keep and a
  threshold baked into the data cannot be revised.

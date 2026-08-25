# Transcripts

**Temporary.** This is the design for TASKS.md § *Transcripts*, and it is
deleted when the work ships — whatever survives goes to DECISIONS.md, the way
WATCHPARTY.md and USAGE.md went. **Phase 1 of § *Order of work* is built;
nothing else is**, and that section is where the state of it is kept.

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

- **No speaker identification between participants.** Diarization on a mix
  would be strictly worse information than we already hold, and it would be
  *disagreeable* information: a channel screen that names four participants
  beside a transcript that says "Speaker A" is a screen with two answers on it.

  **But `speaker_labels` is on, for every stem** — decided 2026-08-24, against
  what this document first said. It is a different question asked of a
  different file. How many voices are inside *one* stem is a thing this system
  does not know and cannot declare in advance: the `media` stem is whatever
  somebody played into the room and may be an interview; a member's stem may
  carry a second person sharing the handset, or the other party bleeding in on
  a speakerphone. Asking uniformly turns that from a declaration somebody has
  to remember to make — by convention or by putting a question to a user —
  into an observation the response carries. On the stems where it is redundant,
  which is nearly all of them, it confirms what was already assumed.

  Two things fall out of it. A second label on a member's stem is **positive
  evidence of bleed**, which is better than the confidence floor this document
  plans for that job: a threshold guesses, a second speaker label is the
  provider saying there was a second voice. And `utterances` comes back
  grouped, since the provider groups its own turns when it labels speakers —
  so `intoLines` becomes the fallback rather than the main path.

  **What to do with a stem that comes back with more than one voice is
  deliberately unmade.** Storing a label is not showing it, and a "Speaker B"
  under a named participant is the two-answers problem again. The lines carry
  their labels; a later declaration may collapse a stem's apparent voices back
  into one. That decision waits on some experience of what this provider
  actually returns, rather than being guessed at now — which is why phase 3
  stores the label and renders nothing from it.
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

This document argued for excluding it, phases 3 and 4 did, and **that was
reversed on 2026-08-25**. The argument was that a recording containing a song
would become a transcript of the lyrics attributed to a participant who does
not exist. The premise was right and the conclusion was not: the attribution
problem is fixed by naming the stem — `MEDIA_LABEL`, "Played audio" — and
excluding it threw away the case that makes transcription worth having on a
channel that plays anything, which is a discussion *of* a recorded talk where
the talk is most of what was said.

It is also the one stem where diarisation buys information rather than
confirming what the identities already hold: nothing here knows how many voices
are inside a played track or what any of them are called.

**What somebody has the right to play is theirs**, and is a question about the
recording rather than about transcribing it — the copy already exists.
BACKLOG.md § *Playing media into a channel is a copyright surface nobody has
addressed* is where that sits.

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
- `POST /v2/transcript` with `{ audio_url, speech_models, speaker_labels:
  false, language_detection: true, punctuate: true, format_text: true }`.
  `speech_models` is an ordered fallback array and defaults to an older pair
  than the current one, so it is pinned by name — a provider-side model change
  is then a decision rather than a surprise in the diff of a re-run. The
  singular `speech_model` is deprecated and is a different shape on their
  realtime API; do not reach for it.
- `GET /v2/transcript/:id` until `status` is `completed` or `error`. Words
  carry `start`/`end` in milliseconds. **`utterances` does not**, because it is
  only populated when speakers were being told apart — so lines are grouped
  here, by `intoLines`.
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
- **`TRANSCRIBE_IDENTIFIER` narrows it to one account**, added 2026-08-25 and
  set on the box while the cost of this is still being learned. Reading and
  searching are never restricted — a transcript is a shared artefact of a
  shared conversation, and everybody who can play the recording can read every
  word of it. What is restricted is the act that spends, and deleting with it,
  since deleting spends nothing and destroys something only that account can
  make again.

  It refuses with **403 rather than 404**: the caller can see the recording and
  can play it, so telling them it does not exist is a lie they could disprove
  by scrolling. The restriction is checked *before* the reach test all the
  same, so somebody outside the channel still learns nothing.

  `RecordingView.transcript.mayRequest` carries the answer, and the button is
  withheld entirely rather than disabled — everywhere else here a disabled
  control means "not now" and has a sentence beside it; this is "not you, ever,
  on this server", which is not worth putting on every row.

  Unset, the rule below is what applies.

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

Six phases. Each one lands and deploys on its own and none needs a flag day —
which holds because the credential is the switch: every phase before the last
is inert on a box with no `ASSEMBLYAI_API_KEY`, and phases 1 to 4 are inert on
a box *with* one until the app has a button.

**Phase 1 — the credential, the config, the provider interface, the
disclosure. Done 2026-08-24.** No user-visible change and nothing calls any of
it.

  - `server/src/transcription.ts` — `TranscriptionProvider`, `Utterance`,
    `AssemblyAiTranscription`, `MemoryTranscription`, `intoLines`.
  - `BuildOptions.transcription`, read by `index.ts` from
    `ASSEMBLYAI_API_KEY`, reported on the startup line beside `review` and
    `donations`.
  - `/privacy` gains a transcription section, **conditional on a provider
    being configured**, and narrows the two sentences transcription makes
    false.
  - `server/.env.example`, CREDENTIALS.md (now eight), AGENTS.md.

  Three things came out differently from what this document said before it was
  built, and they are worth reading before phase 3:

  - **The disclosure is conditional, not unconditional.** The design said phase
    1 "ships the sentence the feature needs to be true", which would have put a
    named third-party processor on a public page months before any audio could
    reach it — a page describing something that cannot happen to the reader,
    which on a page written as checkable claims is the same failing as silence
    while it does. So the section is gated on the same configuration the
    feature is, and the page carries its own second date, shown only to a
    reader whose server has a provider. Setting the key on the box is therefore
    the act that publishes the disclosure, which CREDENTIALS.md says out loud.
  - **`speech_model` is deprecated; it is `speech_models`, an ordered fallback
    array.** `['universal-3-5-pro', 'universal-2']`, pinned. The singular form
    this document implied still type-checks and reads fine and fails at
    runtime. Their coding guide calls it the most common mistake, and it is why
    `transcription.ts` opens by telling you to fetch
    `https://www.assemblyai.com/docs/llms.txt` before touching it.
  - **Lines are made from words, never from the provider's `utterances`** —
    corrected 2026-08-25 after the first real transcript, and this document
    said the opposite twice on the way there. An utterance is a contiguous
    *speaker turn*, so a stem where diarisation hears one voice is **one
    utterance however long the file is**: the first run produced a single line
    of 6,341 characters spanning seventy minutes. Unreadable, unseekable — its
    `startMs` is where the turn began — and it collapses search, since a result
    is a line and that line was the whole conversation. `intoLines` breaks on a
    700ms pause, a 60-word cap and any change of voice; the turns are read only
    for the speaker labels they carry.

    **It cannot be repaired after the fact**, which is why the fix is at
    ingest: re-grouping stored lines means splitting text with no timings for
    the pieces, and the timings exist only per word — which we do not store and
    the provider has been told to forget.
  - **`utterances` does not come back with diarisation off** — the provider
    groups turns only when it has been asked to tell speakers apart, which we
    never do. So words come back and the *lines are ours to make*: `intoLines`
    breaks on a pause of `LINE_GAP_MS` (700ms) and at `LINE_MAX_WORDS`. This is
    better than it sounds. The grouping is now a render-time decision on data
    we hold, revisable without re-spending anything with the provider, which is
    exactly the argument this document already makes about the confidence
    floor. **Phase 3's schema should therefore store what `intoLines` produced
    and not pretend it came from the provider.**

  Also settled by the model choice: `universal-3-5-pro` code-switches natively
  across 18 languages and falls back to `universal-2` for the rest, so §
  *Multi-language*'s first limit — one label per file, and the weaker half of
  the transcript for anybody who switches — is not a limit on this model. The
  second, that a nearly-silent stem detects badly, still stands.

**Phase 2 — `buildStemGraph`. Done 2026-08-24.** The per-identity half of
`buildFilterGraph` lifted out of `export.ts` and called back in a loop, so the
mix is a mix of gated stems and nothing more. Deliberately its own phase: it is
the one change that can break existing recordings, and it landed where a
regression had nothing else in the diff to hide behind. Nothing calls the new
entry points yet.

  - `buildStemGraph(request, identity, inputIndex, label?)` — one speaker's
    branch, returning the filter and its output label. The `label` argument is
    what makes the identity assertion exact: the mix hands out `s0`, `s1`, and
    the branch is then character for character what the mix was built from,
    which `export.test.ts` asserts by substring.
  - `stemKeysFor(request, identity)` — the objects one speaker needs.
  - **`encodeStem(request, identity, fetchObject)`** — that graph, encoded on
    its own, which is what phase 3 submits. Not in the plan as originally
    written, and pulled forward for a reason worth keeping: `export.ts`'s
    header says a filter graph that looks right and mutes nothing would pass
    any amount of unit testing, so the identity claim is asserted twice — once
    on the string, and once on real ffmpeg output measured per second. The
    second is the one that would catch a gate that silently stopped gating, and
    it needs the encoder to exist. Phase 3 therefore does not touch this file.

  Two properties the audio tests pin down, both of which everything downstream
  leans on. A speaker's stem is silent exactly where the mix is silent for
  them, and whole where they were never silenced — so the gating follows the
  identity rather than the position. And a stem **begins where the recording
  does, not where that speaker did**: a late joiner's leading silence is
  encoded rather than trimmed, which is what makes a time in the submitted file
  a time in the recording.

**Phase 3 — schema, job runner, polling, boot recovery. Done 2026-08-24.**
`server/src/transcripts.ts`, three tables in `db.ts`, and `Transcripts` on the
app, started from `index.ts`. Inert without a key: `available()` is false and
every path in refuses. Tested entirely against `MemoryTranscription` — pending
→ ready, one stem failing while the others land, restart mid-job, deletion
reaching the provider — with real ffmpeg rendering the stems, because that half
is not a double.

  - **`request(recordingId, requestedBy)`**, not `start`: `start`/`stop` are
    the timer's, as on the channel registry, and two meanings of the word on
    one class is how somebody wires an interval to a recording id. It does not
    decide *who* may ask; that is phase 4's, and it is the `manageable` rule.
  - **One job per speaker, `media` excluded**, so a recording containing a song
    does not become a transcript of the lyrics attributed to a participant who
    does not exist. A recording whose only stem is played media refuses with a
    message rather than opening jobs over nothing.
  - **The provider's id is written before anything waits on it.** That single
    line is what makes a restart cost a poll rather than a second upload of
    audio already paid for, and `restore()` is the other half: a job with an id
    resumes polling, one without is submitted.
  - **Partly ready is ready.** One stem the provider could not read leaves the
    rest of the transcript standing, and the job row says which speaker is
    missing and why. Failed only when no speaker produced anything — and a
    failed transcript is the one that may be asked for again, which is the
    retry.
  - **Per-job backoff**, 5s doubling to 60s, in memory rather than on the row:
    after a restart every open job is simply due, which costs one early poll
    and saves a column that would have to be kept honest.
  - **Jobs run one at a time**, on a single promise chain. Rendering a stem is
    ffmpeg on the box that is also the SFU. Nothing holds a request open, so
    slow is not a problem anybody is waiting on.
  - **Deletion twice, and a third time by the database.** `forget()` when the
    text lands; a sweep on every tick that catches any recording marked
    deleted, in the week before its row is removed; and `ON DELETE CASCADE` on
    all three tables as the backstop. **A transcript deleted on its own is
    itself a mark**, swept at `TRANSCRIPT_DELETED_RETENTION_MS` — thirty days
    rather than a recording's seven, because deleting a recording by mistake is
    obvious where deleting a transcript leaves everything else in place and can
    go unnoticed. The provider is told at once either way: nothing about the
    grace period depends on their copy, since the text that a recovery by hand
    would read is here. **That cascade is not tidiness** — with
    foreign keys on, a transcript row pointing at a recording would refuse the
    sweep's `DELETE` outright, which is a recording nobody can finish deleting
    because it was once transcribed. There is a test that does exactly that.

  **`billed_ms` is measured, from two sources in order of authority.** What
  the provider says it processed, which is the number they bill on and so
  cannot drift from an invoice for a reason we invented; and failing that,
  `ffprobe` over the file we sent, taken by `encodeStem` on the way out, which
  is exact about our side of it and survives the job then failing. A job
  neither could measure keeps its share of the original estimate rather than
  counting as zero — a transcript that looks free because the one thing that
  went wrong was the measuring is worse than one that admits it is estimating —
  and `billed_exact` on the transcript says which kind of number it is, so a
  usage report does not add a month of estimates to a month of measurements as
  though they were the same.

  One caution carried in the code: their coding guide documents
  `audio_duration_ms` on the *sync* API and says nothing about the async
  transcript object, which is the one we use. Both spellings are read, one in
  seconds and one in milliseconds, because insisting on the wrong one
  under-reports a bill by a factor of a thousand and a usage report saying a
  month cost four seconds is one nobody questions until the invoice. Confirm
  against `llms.txt` and delete the loser.

  One thing phase 3 did *not* do, deliberately: there is no `model` column.
  `poll()` does not report which of the pinned pair actually ran, and a column
  that cannot be filled honestly is worse than none.

**Phase 4 — routes and the wire field. Done 2026-08-25.** Additive and
optional, so an older build ignores them. The last phase that is inert with the
key set: the server can now spend money and nothing can ask it to yet.

  | | |
  | --- | --- |
  | `POST /recordings/:id/transcript` | starts one. 503 unconfigured, 409 for a second one, 404 for absent/deleted/not-yours |
  | `GET /recordings/:id/transcript` | the lines, names resolved |
  | `GET /recordings/:id/transcript/export?format=txt\|vtt\|json` | the file |
  | `DELETE /recordings/:id/transcript` | removes it, leaving the recording |

  - **Two different guards, and the difference is the point.** Asking and
    deleting go through `ChannelRegistry.mayManageRecording` — lifted out of
    `deleteRecording` so a third caller applies the same rule rather than a
    similar one — because they change a shared thing and send everybody's audio
    to a third party. Reading goes through `recordingsFor`, like exporting:
    anybody who may hear the conversation may read it.
  - **`DELETE` was not in the design.** A transcript is the only artefact here
    that could not otherwise be removed without deleting the conversation it
    came from, and it is the one most worth removing, being searchable text
    rather than audio nobody will scrub through. It refunds nothing; asking
    again costs again.
  - **`RecordingView.transcript` is absent in two cases that mean different
    things** — this server cannot transcribe, and this recording has not been
    transcribed. Deliberately indistinguishable from the app's side: the
    button's availability comes from the same absence, so a server with no key
    never shows one.
  - **`missing` counts the speakers who produced nothing.** A transcript is
    ready when *any* of them did, so a card that said only "ready" would
    present a conversation with somebody missing from it as though it were
    whole.
  - **`ChannelRegistry.announce`**, and the reason it had to exist: the phone
    does not hold the request open, so something must say when a transcript
    lands — and a transcript landing is not an action anybody took, so no
    dispatch pushes a snapshot on its behalf. Exactly the reason a finished mix
    emits. Without it the card reads "Transcribing…" until something unrelated
    happens in that channel.

  On the export formats: `txt` is what somebody pastes into a message, `vtt` is
  what a media player wants and carries the *recording's* timeline rather than
  an offset into anybody's stem — which is what phase 2's delays bought — and
  `json` is the only one carrying confidence and the within-stem speaker label.

  **There is still no inbound route, and there should not be one.** A webhook
  would need a public path, a shared secret, and *still* a reconciler for the
  call that never arrived; the reconciler alone is the whole job, and phase 3
  is that reconciler.

**Phase 5 — the app. Done 2026-08-25.** Trigger, transcript view,
per-recording search, seek, export — and the privacy split below. **The key
does not go on the box until this is deployed**, which is also the moment
`/privacy` starts naming AssemblyAI and the App Store data-collection answers
have to have been changed already.

  - **`TranscriptButton`** in the row's drawer beside Export and Delete, on the
    manage rule. Four labels for four states, and the first one confirms first
    and **names the company while doing it** — whoever taps is deciding for
    everybody who was in the room, so the dialog says the provider, that the
    result is shared, and that it costs.
  - **`TranscriptView`**, rendered instead of the channel the way the profile
    and settings screens are, so reading one does not hang anybody up. Held by
    recording id rather than by row, so a transcript that lands while the
    screen is open fills itself in.
  - **Searching is private and jumping is public**, said in one sentence on the
    screen where somebody is about to act on it. The filter is local. Tapping a
    line sends `SEEK`, which moves shared playback for the whole room — so it
    is offered only while this recording is the loaded track and only to
    whoever may drive it.
  - **`PlaybackTrack.recordingId`**, which had to exist for that: `track.id` is
    minted per load, so playing the same recording twice gives two ids and
    neither is the recording's. Without it a screen cannot tell whether what is
    playing *is* the recording a line's timings belong to.
  - **A correction to phase 4.** `RecordingView.transcript` absent was made to
    mean both "cannot transcribe" and "not transcribed", which was wrong: with
    a key and no transcript yet the field is *also* absent, so the button that
    would start one never appears. `'none'` is back, as the design first had
    it, and `provider` rides along so the confirmation can name the company
    without the app holding server configuration.

  **And the privacy section came apart, as this phase said it would.** The
  *sending* stays gated on the credential — it is only true where the key is,
  and unsetting the key retracts the sentence in the same restart that
  withdraws the feature, which is the `KOFI_URL` property. The *storage* is now
  unconditional: text kept here outlives the provider being dropped, so a page
  that fell silent about transcripts still on people's screens would fail worse
  than the case the gate was built to prevent. `TRANSCRIPTION_ADDED` is gone
  and `PRIVACY_UPDATED` moved to 25 August 2026, because the page has now
  genuinely changed for every reader rather than for one configuration.

**Phase 6 — channel-wide search. Done 2026-08-25.** FTS5, since the box has
it, with a scan as the fallback.

  - **`transcript_fts`**, external-content over `transcript_lines`, kept level
    by two triggers. No update trigger: a line is written once and never
    edited.
  - **`PRAGMA recursive_triggers = ON`, and it is load-bearing.** A foreign key
    cascade performs its DELETEs *without firing triggers* unless that is set —
    so the sweep that removes a recording would take its lines and leave the
    index holding every word of them. A deleted conversation that is still
    findable by searching for it is a worse failure than a missing index.
    `transcript-routes.test.ts` deletes a recordings row outright and asserts
    the search goes quiet, which is the test that pins it.
  - **Optional, on purpose.** FTS5 is a compile-time option and `node:sqlite`'s
    flags are not something to assume across a Node version. Creating the table
    is wrapped; `hasSearchIndex` reports the answer and the query takes a
    `LIKE` scan over one channel's lines otherwise, which at this scale is
    fine. The index is an optimisation, not the feature.
  - **Searched as a phrase**, not as an expression. FTS5's query language would
    otherwise read an apostrophe, a stray quote or the word `AND` as syntax and
    answer with an error where a person expected results.
  - **`ChannelRegistry.isMemberOf`**, which had to be its own thing:
    `recordingsInChannel` answers the same question implicitly and returns
    nothing both for a channel that is not yours and for one of yours with
    nothing recorded in it — the two answers a route most needs to tell apart.
    It reads the database rather than the live registry, since membership is a
    fact about the channel rather than about who is currently in it.
  - **`TranscriptSearch`** above the recordings list, debounced at 300ms
    because a keystroke is not a question, and shown only once something in the
    channel has been transcribed. A hit names the conversation it came from,
    which is the one thing the per-recording filter cannot do and the whole
    reason this is a separate control.

---

**Every phase of this design has shipped.** What has *not* happened is a single
transcript against the real API: the whole thing is green against
`MemoryTranscription` and real ffmpeg, and nothing has ever been submitted to
AssemblyAI. That run is where `audio_duration` versus `audio_duration_ms` gets
settled, where it becomes clear whether `utterances` really come back grouped,
and where rendering N stems next to live audio is heard for the first time. A
local server with the key set does it without touching the box or publishing
the disclosure.

This file is deleted when the work ships, and what survives moves to
DECISIONS.md — but not before that run, since half of what is written here is a
prediction about a service nobody has called yet.

## Open questions

- ~~**FTS5 on Node 22.**~~ **Settled 2026-08-24: the box has it.** Checked
  against production directly — `node:sqlite` on Node v22.23.2 there creates an
  fts5 virtual table without complaint. So phase 6 may have the index rather
  than the `LIKE` fallback. Phase 3's schema assumes nothing either way: the
  lines are an ordinary table with an index on `(recording_id, start_ms)` and
  one on `channel_id`, and an external-content fts5 table over them is
  additive.
- **What `DELETE /v2/transcript/:id` does at their end** is in BACKLOG.md, as
  *What AssemblyAI does with the audio after we ask it to delete it*. Briefly,
  on 2026-08-25, this document and `/privacy` both said their DELETE marks and
  sweeps at thirty days — that came from a sentence about *this* application's
  sweep, misread as being about theirs, and there is no source for it.

  **`/privacy` now claims nothing about their side at all**, not even that they
  are asked. The call is still made; the page confines itself to what this
  server does with its own copies, which is the only kind of claim it can be
  held to. That also takes this off the critical path for the deploy that sets
  the key — it is worth answering, and it no longer blocks.

- ~~**Guests.**~~ **Settled 2026-08-25: their display name, and it already
  works.** `participant_names` carries a guest, because `displayName()` asks
  `guests.displayName` for a `guest_` id rather than `accounts`, and it froze
  the name when the run was filed. So a guest is a job like anybody's — being
  a guest is not a reason to be left out of the record of what was said — and
  is labelled the way the recording labelled them rather than by a raw session
  id. `transcript-routes.test.ts` pins it.

- **ffmpeg next to live audio.** Rendering N stems is the mix's cost again, on a
  box that is now also the SFU. Run the jobs one at a time and never during a
  mix. AGENTS.md § *Known rough edges* is the same worry from the deploy side,
  and the answer if it bites is the same $7 box.
- **Does bleed actually happen, and is a second speaker label evidence of it?**
  Decided 2026-08-25: **nothing filters**, and the question is narrower than
  this document first put it.

  It was framed as a choice between designs — a stored threshold or a
  render-time one — and that framing was wrong. Every line already carries its
  confidence and its within-stem speaker label, so a threshold, a label rule,
  and showing everything are the same storage with different display
  predicates. Nothing about the schema depends on which is chosen, and the
  choice therefore costs nothing to defer: a rule added next year applies to
  transcripts already made.

  So the renderer applies no rule. What has to be observed before one is worth
  writing is whether bleed appears at all — this is a headphones-first app and
  the floor exists so one person talks at a time, so it may be near zero — and
  whether a second speaker label on a member's stem is reliable evidence of it,
  since diarisation also splits one speaker on a cough or a change of mic
  distance.

  A confidence threshold is the one option to resist. It cuts the wrong things:
  a hesitant word in a clear sentence scores low, while a *clearly recorded*
  bleed of somebody talking two feet away scores high.

  The option that would actually identify bleed rather than proxy for it is
  **cross-stem comparison** — bleed is by construction a copy of something
  already in another stem at the same moment, and the floor says which of the
  two to keep. It is also the only one that is real work rather than a
  predicate, and it should wait until there is something to test it against.

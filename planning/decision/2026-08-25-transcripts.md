# Transcripts

Built 2026-08-24 to 2026-08-25 in seven phases, from `TASKS.md` §
*Transcripts* — AssemblyAI, batch rather than streaming, multi-channel,
multi-language, triggered by hand on a recording, attached to it, exportable,
and searchable during playback and across a channel's recordings. This is what
survives of `planning/TRANSCRIPTS.md`, the design, deleted on 2026-10-03: the
argument that decided the shape, the rule about what is sent, the privacy
change it forced, and the three things that came out differently once it was
built. The schema, routes, app and phase-by-phase account described code that
exists.

What is still outstanding is elsewhere: what AssemblyAI does after a DELETE is
`backlog/what-assemblyai-does-with-the-audio-after-we-ask-it-to-delete-it.md`,
and the follow-ons are four tasks — `transcribe-as-the-conversation-happens`,
`transcribe-automatically-in-chosen-channels`,
`keep-the-transcript-and-let-the-audio-go` and `improve-transcripts-ui`.
planning/ASSEMBLY_PROMPT.md is the provider's own guidance.

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

  **A stem that comes back with more than one voice is labelled, decided
  2026-08-25 on the evidence of the first real transcript.** The letter is
  shown — `Played audio (A)` against `Played audio (B)` — and only for a stem
  the provider gave more than one label to, so the single-voiced stems that are
  nearly all of them keep their plain names. `core/transcript.ts` holds both
  halves of the rule; the letter is passed through rather than named, because
  the system knows there were two voices and knows nothing about who the second
  one was. The screen says so in a line beside the transcript.

  What decided it: the recording that raised this was a podcast interview
  played into the room, 210 lines of two people that read as one speaker called
  "Played audio". Also decided that day, and the same change: **consecutive
  lines from one voice are one entry with paragraphs**, which took that
  transcript from 1,032 entries to 425 and is what makes the labels alternate —
  a name on screen is then always news.

  **The design was wrong about the member stems.** It expected a second label
  there to be positive evidence of bleed. Three of the four came back with two,
  and the minority voice is backchannel — "Yeah.", "Mm-hmm.", "Really?" — which
  is the provider failing to attribute short utterances rather than a second
  person in the room. So the letters on a member's stem are mostly noise, and
  they fragment that person's runs.

  **The answer is a person, not a rule**, decided 2026-08-25. The first move
  considered was restricting the letter to the media stem, on the argument that
  it is the only stem with no declared owner. That is a guess dressed as a
  policy: it is right about this transcript and wrong the first time somebody
  really does share a handset, and it would still leave the media stem's two
  voices called (A) and (B) when what they are called is Host and Douglas.
  Somebody who was in the room knows all of it and nothing else does.

  So the letters are the **starting point** and `transcript_voices` is where
  that person answers: rename a voice, give two of them the same name to
  collapse a run the provider split, or drop one that was never a person.
  Grouping keys on the resolved name rather than on the label, so collapsing
  needs no separate merging step, and the letters are worked out after the
  removals, so dropping a spurious voice un-letters the stem it was on.

  **It is a view and it stays one.** No line is edited and no text rewritten:
  the declaration is a separate table read at render, the whole of it is
  replaced on every save, and an empty one puts the transcript back exactly as
  the provider left it. Nothing is re-transcribed and nothing is spent, which
  is what makes the screen safe enough to have a Clear all button on it and is
  the reason it was built this way rather than as an edit to the lines.

  Who may say it is the pair of rules deleting uses — `mayTranscribe` and
  `mayManageRecording` — because it shapes a shared artefact that only one
  account can make again. Reading and searching stay unrestricted, so everybody
  in the channel sees the result. On the one transcript that exists, naming the
  four voices and removing two took it from 425 entries to 374.
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
`decision/2026-09-16-nothing-here-knows-what-a-track-is.md` is where that
sits, and it is settled: responsibility follows knowledge, and nothing here has
any.

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

## Who may ask for one, and what it costs

`$0.15` per audio-hour per channel on the current standard model. A one-hour
conversation between two people is 30 cents; the same hour with four is 60.
Cheap, and not free, and the first thing on this project that costs money per
tap rather than per month. That is why the task says *manually triggered* and
why this design does not sneak in an automatic one.

- **One transcript per recording.** Re-running is only offered after a failure,
  and it replaces. Nothing gives a user a button that spends money twice for the
  same answer.
- **One free transcript per account**, decided 2026-08-25, replacing the
  `TRANSCRIBE_IDENTIFIER` rule that had lasted a day. That one made
  transcription a feature exactly one person had; this one makes it a feature
  everybody has met and nobody can run up a bill with. Reading and searching
  are still never restricted — a transcript is a shared artefact of a shared
  conversation, and everybody who can play the recording can read every word.

  **The spend is recorded on the account, not counted from `transcripts`.**
  `requested_by` is right there and would be the obvious ledger, and it is the
  wrong one: those rows are swept — `sweepDeleted` takes a transcript deleted
  on its own once `TRANSCRIPT_DELETED_RETENTION_MS` passes, and a swept
  recording takes its transcript with it — so a derived count hands the credit
  back weeks later and "delete it and wait" is the way round the limit. So
  `accounts.free_transcript_id` holds the recording it went on, with
  `free_transcript_at` beside it.

  The id rather than a boolean, because the credit moves in both directions:

  - **Spent when the transcript is asked for**, not when it lands, so one in
    flight holds it. Otherwise five taps inside the time one takes to come
    back are five free transcripts.
  - **Returned only when that same transcript fails**, since it produced
    nothing. `Transcripts.onFailed` is the hook, and it fires on the settle
    that writes `state = 'failed'`, never on a partial success — one speaker
    missing out of four is a transcript and it cost what it cost.
  - **Never returned by deleting.** That is the loop the whole arrangement
    closes.

  **`transcripts_unlimited` on the account lifts it**, set by hand with
  `bin/db --write`, like `debug` and `leaderboard` and unlike either of those
  in that it licenses spending. `TRANSCRIBE_IDENTIFIER` is still read as one
  more unlimited address, deprecated: it is a bootstrap so that opening the
  feature up does not silently demote the person a deployed `.env` names.

  **`FREE_TRANSCRIPT_MINUTES` caps the free one by size**, because one use
  caps the count and not the bill — the provider charges per audio-hour per
  stem, so a three-hour four-way is twenty times a twenty-minute pair. The
  unit is the one `billed_ms` already records, a recording's length times its
  number of stems, and the estimate is `Transcripts.costEstimateMs`, which is
  deliberately the same expression `request` writes. Unset, a free transcript
  may be any length.

  It refuses with **403 rather than 404**: the caller can see the recording and
  can play it, so telling them it does not exist is a lie they could disprove
  by scrolling. The rule is checked *before* the reach test all the same, so
  somebody outside the channel still learns nothing.

  **The refusal now has words, and that is what changed on the client.**
  `mayRequest` was "not you, ever, on this server" and was said by withholding
  the button; it is now "you have had yours" or "this one is too long", which
  are temporary and personal and are worth a sentence. So the wire carries
  `requestLimit` beside it — composed on the server, which is the only end
  that knows the cap — and the button is disabled with the sentence under it,
  which is what a disabled control means everywhere else on that card. An old
  server sends no sentence, and the app still withholds the button entirely.

  **And the confirmation says it is the only one**, on `spendsFreeUse`: the
  title asks about the free use rather than about the recording, the body says
  deleting will not give it back, and Cancel is the way out. A thing that can
  be done exactly once should not be discovered afterwards.

  **Removing and naming split off `mayRequest` at the same time**, onto
  `mayRemove`. They used to be the same question because only one account
  could do any of it. They are not the same question now: somebody who spent
  their free use is still the person who made the transcript on screen, and
  shaping what they made is theirs — while starting a new one is not.

- **The rule for who may trigger it is the `manageable` rule, not the export
  rule.** Export is a read by one person of their own conversation. This sends
  everybody's audio to a third party and produces a shared artefact on
  everybody's screen — it is a change to the channel, like renaming and
  deleting, so it wants the same guard (`hasTheRoomIn`) and `requested_by` is
  shown beside the transcript so it is never anonymous.
- **Metered.** `billed_ms` per transcript, and a `usage_bytes` entry of the same
  kind the mix already writes, so `bin/usage` can answer "what did transcription
  cost last month" without anybody guessing.
- **A monthly cap is worth having and is still not worth having first.** The
  per-account free use above is a cap on *who* spends and how often, not on
  what this server spends in total. If that turns out to need one,
  `TRANSCRIPT_MONTHLY_MINUTES` in the env, refused with a message naming the
  reset date. Do not build it speculatively.

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

## What building it changed

Three things came out differently from what the design said before it was
built — the corrections to the design, made in phase 1:

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

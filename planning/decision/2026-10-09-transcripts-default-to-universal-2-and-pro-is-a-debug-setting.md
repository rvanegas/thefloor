# Transcripts default to Universal-2, and Pro is a debug setting

Rodrigo, 2026-10-09: Universal-2 by default, and a `debug` account may set a
channel to the flagship instead. Until then every transcript was asked for
`['universal-3-5-pro', 'universal-2']` (decision/2026-08-25-transcripts.md).

**The price, against the gain.** Batch Universal-2 is about $0.15 an hour and
Universal-3.5 Pro about $0.21. The provider's own English benchmarks put mean
word error rate at 6.1% against 5.6%, about one wrong word in two hundred.
Those are studio and read-speech sets. Nothing measures one phone microphone
per speaker, and nothing measures a speaker switching between English and
Spanish mid-sentence. 3.5 Pro handles that natively and Universal-2 does not,
since it detects one language per file. That case is why the flagship is kept
as a choice and not dropped. `run-a-cheap-transcriber-beside-assemblyai-and-compare.md`
is how to measure the gap on our own audio.

**What was built.** `transcriptionModel: 'standard' | 'pro'` on
`ChannelState`, set by `SET_TRANSCRIPTION_MODEL`. The reducer guards it like
`SET_AUTO_RECORD`. The server refuses it from any account without `debug`,
because the reducer knows nothing of accounts. It is durable, like
`autoRecord`. When a transcript is requested the setting is copied onto the
`transcripts.model` column, and the jobs are submitted from the row. So a
setting changed later changes nothing already asked for, and a job resumed
after a restart goes to the model it was asked for. A null on a row from
before the column is read as `pro`, which is what all of those rows were.

**Named by grade, not by model id**, so the setting outlives a change of
provider. `ASSEMBLYAI_MODELS` in `server/src/transcription.ts` is where each
grade maps to a model.

**No Universal-3.6 option.** The pre-recorded API accepts only
`universal-3-5-pro` and `universal-2`. Universal-3.6 Pro appears in the
provider's docs only for streaming.

**Batch only.** The live transcript, which landed the same day, streams on
`universal-streaming-multilingual` and does not read this setting.

**Wire order.** A server that predates the action refuses it as unknown, so
the server deploys before any build that sends it. Nothing breaks the other
way round: an old app ignores the snapshot field and gets the default.

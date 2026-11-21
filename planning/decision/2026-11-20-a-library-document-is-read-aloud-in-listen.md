# A library document is read aloud in Listen

Built 2026-11-20 at Rodrigo's request: somebody in a channel picks a document
from a noesis library, AssemblyAI speaks it, it plays in *Listen* where it can
be paused and rewound, and if the room is being transcribed, *Ask Claude*
holds the original document and follows along. It takes up the task *Read a
library document aloud into Listen* (filed 2026-11-18 from the call with
Rochelle), which asked for a control on Claude's *Read* working step. This
build gives it a picker of its own, and the task is retired.

**Settled at the prompt, the same day:**

- **The *Played audio* lines are the document's own sentences.** While a
  reading is the track, its audio is not sent to speech-to-text
  (`LiveTranscriber.hear` skips it). Instead `Readings.follow`, on every
  500 ms tick, writes each sentence that playback has passed as a *Played
  audio* line, at the wall-clock time it was said. That is exact, it costs
  nothing more, and the *Record* says what the room heard in the order it
  heard it: a seek back hears sentences again, and a seek forward writes
  nothing for what it skipped. The lines are written only while the channel
  is transcribed, as the speech-to-text they stand in for would be.
- **Pro, as *Pro voices* are.** The routes answer only on a *Pro channel*
  (`isProChannel`). The voice is the presser's own *Pro voice* for the
  language `speechLanguage` picks for a reply. That is the existing rule for
  who pays for synthesis, rather than a new rule that only a member who is
  Pro may press.
- **Kept a month**, so the same text in the same voice and language
  (`readings.hash`) plays again anywhere at no cost. This is a document's
  audio, not something Claude said, so it does not touch the one hour of
  `SPEECH_KEPT_MS`.

**On the box's disk, not in S3, which is where the plan put it.** The
server's credential may put to the bucket and never delete from it
(CREDENTIALS.md; deletes are a person's, from `ts orphans`). A month is a
promise only something that can delete keeps. So the audio is kept as Ogg
Opus in `READINGS_DIR` (`server/readings/`, which `ts deploy` never ships or
deletes), and the hourly sweep removes the file and blanks the row's text
and sentences. The row stays, as the ledger's. At 48 kbit/s an hour of
speech is about 21 MB.

**Words map onto the text one to one, which a probe settled.** The plan
assumed the provider's words would have to be matched fuzzily to the text,
since the docs give no character offsets. One call to `/v1/speech/events`
on 2026-11-20 showed every whitespace token of the text returned verbatim,
markup included (`##` with zero width, `*friend*.`). So `sentencesOf`
(core/reading.ts) matches in order, looking a few words ahead and borrowing
a neighbour's time for a token that has no match. The request splitter
(`speechPieces`, now shared with `ts speak`) cuts only between tokens, so
each piece's tokens are the text's. Before this it could cut inside `3.50`
at the full stop.

**Claude holds the document whole and is told where the room is.** On any
press while a reading is the track, `composeRecord` gets it from
`Readings.forClaude`. The document goes ahead of `<record>`, inside the
cached prefix, so a second press reads it from the cache. A sentence goes
in the uncached tail, next to the length rule: playing, paused or not yet
started; the last sentence heard; how far through as a percentage; and a
request to respond to the passage just heard unless asked otherwise. The
document is in `holds`, so Claude never *asks to read* it. A channel whose
*Record* is empty may still be asked about a reading. **Only while it is the
track**: once it is removed, the *Played audio* lines are all that remain of
it in what Claude is sent.

**One way into the player.** A reading is loaded through `loadTrack` as an
upload or a recording's *Play* is, copied into a track directory of its own
because replacing a track deletes its directory. So it is governed by the
floor, presence, the film and every control on the card, and a recording
keeps it. `PlaybackTrack.document` (name, library, title and reading id) is
the one addition to the wire. It is optional and additive, and a build that
does not know it draws the title as for any track, so **no shim and no
SHIMS.md entry**. The other two things the task said *Listen* would play, a
line of the *Record* and Claude's reply, would come in the same way.

**Not built:**

- **A *Preparing* state for the channel.** Only the presser's card says
  *Preparing the reading…*, while their request is open. The others see
  the track arrive. A channel-wide state would have needed a reducer
  action and a wire field for a wait of seconds to a minute.
- **The cost before the press.** `list_documents` gives no length, so the
  picker cannot show what a document will cost without reading each one.
  Documents over 200,000 characters (about four hours, three dollars) are
  refused at the server instead.
- **A control on the *Read* working step**, the task's original entry
  point. The picker covers the case, and the working step would need its
  document's library as well, which `WorkingSteps` does not carry.

**Not yet seen working**: on a phone, against the real API, and on the box,
including that its disk holds a month of readings. The suite holds the rest:
`core/__tests__/reading.test.ts`, `server/__tests__/readings.test.ts`, the
live transcript and privacy suites, and `app/src/ui/__tests__/reading.test.tsx`.

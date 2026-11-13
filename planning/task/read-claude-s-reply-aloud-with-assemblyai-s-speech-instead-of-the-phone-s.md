# Read Claude's reply aloud with AssemblyAI's speech instead of the phone's

Asked 2026-11-13: use AssemblyAI's new text-to-speech in place of the voice
built into iOS (`app/modules/read-aloud`, `AVSpeechSynthesizer`), which reads
Claude's paste in the Record as it lands —
decision/2026-10-28-claudes-reply-is-read-aloud-on-arrival.md.

**First, refresh the guide.** `planning/ASSEMBLY_PROMPT.md` is AssemblyAI's
guidance for coding agents as it stood when transcripts were built. Fetch the
latest (`https://www.assemblyai.com/docs/llms.txt` and the agent prompt it
points to), replace the snapshot below our header, and note in the header the
date it was taken. Read it for what is new: the speech service itself (models,
voices, languages, formats, streaming or not, price), and anything that
changes what transcription uses today — newer speech models than the
`universal-2` default (decision/2026-10-09-transcripts-default-to-universal-2-and-pro-is-a-debug-setting.md)
and changes to the streaming API `streaming.ts` speaks. Whatever bears on
existing code becomes its own task or backlog item rather than riding along.

Then the design questions: the server would synthesise (the key never reaches
a phone), once per paste rather than once per phone, and serve the audio to
every phone present; what happens to the language detection and the voice
card in *Floor Settings*, which exist for the installed voices; whether the
phone's voice stays as the fallback when there is no key or the request fails;
Android, which reads aloud with its own voice too; and `/privacy`, which would
newly say that Claude's reply text goes to AssemblyAI.

## Findings, 2026-11-13

**The guide is refreshed** (ASSEMBLY_PROMPT.md, header dated). Nothing in it
bears on existing code, so nothing new is filed. `transcription.ts` already
pins its models and names the provider's new default; `streaming.ts` already
weighs `universal-streaming-multilingual` at $0.15 an hour against the
flagship at $0.45, which is the price of Universal-3.6 Pro Realtime today; and
the new streaming section only adds that model. The prompt says almost
nothing about speech. What follows comes from the *Text to Speech* section
files that `llms.txt` links to.

**The service is one model, AssemblyAI-TTS-1**, in six languages: English,
Spanish, German, French, Italian and Portuguese. Every voice speaks all six,
and each sounds best in the language it was recorded in.

- **`language` is a full name**, `spanish` and not `es`, and **the API does
  not detect it.** Left out, the voice speaks its own language whatever the
  text is in, so whoever calls it has to say which language the text is in.
- **Voices are `voice_id` slugs**, such as `aai-kyla`, from a dashboard
  catalogue of thousands. The defaults are `aai-kyla` for English and
  `aai-antonioluis` for Spanish, and the docs warn that the defaults may
  change. All four Spanish voices on the starter list are Mexican. Cloning
  exists, with a consent period, and is out of scope here.
- **Two interfaces.** One is HTTP: `POST https://tts.us.assemblyai.com/v1/speech`
  takes one text of up to 5,000 characters and streams the audio back by
  default, or returns it whole with `stream: false`. The other is a WebSocket
  for text that arrives a token at a time. Claude's reply arrives whole, so
  HTTP is the one that fits.
- **Formats**: raw PCM s16le (the default), μ-law or A-law, the same in a WAV
  container, or MP3 at 64 kbps by default. The default rate is 24 kHz, and
  8, 16, 22.05, 44.1 and 48 kHz are also offered.
- **Latency**: the HTTP status arrives with the first audio, usually a few
  hundred milliseconds after the request. Any failure before that is an
  ordinary JSON error, and a failure after it cuts the body.
- **The server cleans the text first.** It drops Markdown, emoji and bullets,
  reads numbers, dates and URLs out in words, and turns brackets into round
  ones and reads the words inside them.
- **Price: $15 per million input characters.** A *Medium* reply (150 words,
  about 900 characters) costs about 1.4¢, and an *Extended* one about 4¢.
  `X-TTS-Billed-Characters` reports the count.
- **Limits**: 1,000 requests a minute on a paid plan. Authentication is the
  same key in the same `Authorization` header, and temporary tokens
  (`product=tts`) exist for apps.
- **Data zones**: US (`us-east-1`) and EU (Stockholm). **What AssemblyAI keeps
  of the text is not stated anywhere in the TTS docs.**

**Correction to the ask: Android does not read anything aloud today.** The
module has only an `ios/` half, and `load()` returns null on any other
platform.

## Design

Settled with Rodrigo on 2026-11-13, in answer to the first draft:

- the reply's voice goes **into the room and into the recording**;
- **one voice for the whole channel**;
- the language comes from **the channel's transcripts**;
- the audio is PCM, **kept for an hour**, and anybody can have it **read
  again** during that hour.

This reverses decision/2026-10-28-claudes-reply-is-read-aloud-on-arrival.md
§ *Local, never into the call*, which its shipping decision has to say.

**Once per paste, synthesised on the server and published into the room.**
When `postClaudeReply` posts, the text goes into the *Record* at once and one
`POST /v1/speech` starts beside it. A new `server/src/speech.ts` provider makes
that call, shaped like `transcription.ts`'s providers and faked in tests. The
audio comes back as PCM s16le at **48 kHz**, the rate `playback.ts` already
pumps (`SAMPLE_RATE`), so nothing has to be resampled. It is published the way
shared playback is: frames go to an `AudioSource` on the server's own
participant, and **the same samples go to a stem encoder while a recording is
running**. Everybody present hears it through the call, at the call's level,
and the echo canceller treats it like any other remote voice. Build 396's
three failures (faint, cut short, heard through others' microphones) came from
playing it as local audio beside the call, so they do not arise on this path.
**Android hears it with no work of its own**, since it already plays the room.
Considered and rejected:

- **Holding the paste until the audio is ready**, which makes everybody's
  *Record* wait for speech.
- **The WebSocket API**, which is built for text that arrives a token at a time.
- **Synthesising per phone**: that costs N times as much, and a recording would
  need its own copy anyway.

**The participant, and older builds.** The film is already published as the
`media:<channel>` participant (`playbackIdentity`), which every build knows to
treat as something other than a person. The open question is whether the
reply goes on that participant as a second track or on its own identity, such
as `claude:<channel>`. Two things decide it, and both have to be read before
building:

- what an older build does with a second track on `media:`
  (`app/src/audio/unheard.ts`, `useSessionAudio`), and with an unknown
  identity;
- whether the reply may play while a film is playing. A recording and a
  playing film are never on at the same time (GLOSSARY, *Watch party*), so
  in that case there is no stem to write, only the room to play into. The
  reply might play over the film, pause it, or wait for it.

**Builds older than this one are not subscribed** to the reply's track. The
server already decides who hears what, which is how the floor withholds people.
Those builds go on reading with their own voice, as they do today, so nobody
hears the reply twice. A new build skips its local reading whenever the clip
says the server is speaking (`Clip.speech`, added in one additive step). This
needs no SHIMS.md entry, because nothing is removed.

**In the recording, not in the transcript.** The reply gets its own stem, as
the shared track does, placed by offset like a film loaded partway through a
run. Unlike the shared track, **it is never sent to AssemblyAI for
transcription**: the paste is already the text, and transcribing it would put
the reply in the *Record* twice. A published episode then carries Claude's
voice. That is the point of this change, and the episode pages need to say
whose voice it is.

**The floor is not involved.** The reply plays over whoever is speaking, as
the local reading does today. Making it wait for the floor, or take it, is a
separate question that can be asked once this is heard in a real room.

**The language: the channel's first transcript.** Each stem's transcript job
already stores what AssemblyAI's language detection decided
(`transcript_jobs.language`). The reply is spoken in the language of the
**earliest finished transcript in the channel**. A channel with no transcript
falls back to the language the channel declares for its feed
(`channels.language`), and then to the asker's app language, which the press
sends. Codes map to AssemblyAI's names (`es` → `spanish`). A language outside
AssemblyAI's six means the clip carries no `speech`, and each phone reads it
with its own voice, as today.

- *First* rather than *latest* was Rodrigo's word. A channel whose
  conversation moves from Spanish to English goes on being read in Spanish,
  which is the cost the 2026-10-28 decision gave for rejecting a channel
  setting. Switching to the latest transcript would change one query.
- Live transcripts do not ask for detection today. The multilingual streaming
  model can (`language_detection`, which adds `language_code` to each `Turn`),
  which would let a channel that only transcribes live have a language as
  well. That is a later step, not part of this.

**One voice for the whole channel**, as a channel setting beside *Response
model*: `speechVoice`, an AssemblyAI slug, with the catalogue default pinned in
code where nothing is chosen. **Every voice speaks all six languages**, so one
choice covers whatever the channel speaks; a voice sounds best in its own
language, and the picker says which that is.

- **Where**: the channel's settings, beside *Response model*, as *Claude's
  voice*.
- **Who may change it**: the same rule as *Response model* until there is a
  reason to differ (shown to every member, changed only by *Pro*). Whether
  it should be open to every member instead is worth asking.
- **The picker**: a short curated list of AssemblyAI voices, the English and
  Spanish starters to begin with, each row naming the voice and its own
  language, with a sample button. A sample is one fixed sentence per voice,
  synthesised once on the server and cached, so trying voices costs nothing per
  tap. It plays on the phone through `Reader`'s engine path. It is the first
  new screen this design needs, so STYLE.md is read before drawing it.
- `Clip.voices`, the asker's installed voices, stays on the wire for older
  builds. A new build stops sending it once the server speaks.

**Read again, for an hour.** The audio is kept on the server's disk, keyed by
paste id, for an hour after it finishes, and lost on a restart. It is never
put in S3 and never in the snapshot; the recording's stem is a separate copy
that belongs to the recording. While it is kept, the reply's paste in the
*Record* carries a **Read again** control. Whether that is for one person or
for everybody is the remaining question:

- **Just you** (recommended). The phone fetches
  `GET /channels/:id/pastes/:pasteId/speech` and plays it on its own call
  engine (`Reader`'s `AVAudioPlayerNode` path), so the echo canceller keeps it
  out of everyone else's microphone and it is not recorded a second time.
  This is what *Restart* already means, and *Restart* and *Stop* on the
  reading bar become this same act. Its cost is a native change, so it reaches
  phones with an upload, and it is iOS-only until
  task/bring-android-level-with-ios.md.
- **Everybody**: published into the room again. It needs no native work, but
  one person's replay interrupts the whole call and is recorded again.

After the hour the control goes. A reply older than that is in the *Record*
to read.

**Stop**, for the arrival, mutes the reply's track on that phone only, as a
local unsubscribe, until the reply ends. Nobody else is affected.

**The phone's voice stays as the fallback**: when the server has no key, when
the speech request fails before the first audio (one retry after `Retry-After`
on a `429` or `503`), when the language is outside the six, and on older
builds. It is heard by that phone alone, and is not in the recording. A
response cut off partway is reported and stops.

**The *Read aloud* card: remove it** wherever the server speaks. The
recommendation, for these reasons:

- The card exists to get somebody to a better voice installed on their phone.
  Once the server speaks, that voice is heard only on the fallback path,
  which is a failure or a language AssemblyAI does not speak. A settings card
  that tunes a failure path is weight nobody benefits from.
- The voice that matters is now the channel's, and the place to choose it is
  the channel's settings. A phone-level card beside it would read as a second
  answer to the same question and invite the one-scope confusion that
  *Floor Settings*' paragraph warns about.
- `bestVoice` already makes a sensible choice without being asked, and it did
  so before the card existed.
- The download instructions cannot be acted on from the app in any case:
  there is no API to open the right Settings page.

What goes: the card, the per-phone voice choice (`chooseVoice`,
`useReadAloudVoices`), and their strings in both catalogues. **What stays**:
`bestVoice`, `replyLocale` and the local reader, for the fallback. The
no-compatibility rule decides this: the two keychain entries
(`thefloor.readAloud.en`, `.es`) are left behind unread and harmless, and
nothing needs migrating. On a server without an AssemblyAI key the card has a
case for staying, since the phone's voice is then the only voice. Only a
development box is in that position, though, and keeping the card for it is
not worth the code.

**`/privacy`**: inside Claude's section, shown only where the server has both
keys. It says that the reply's text is sent to AssemblyAI, in the United
States, to be spoken; that the audio is heard by everyone in the call and
kept in the recording like any voice; and that a copy on our server is
deleted after an hour. It claims nothing about what AssemblyAI keeps, which
its docs do not say. `CLAUDE_PRIVACY_UPDATED` moves.

**The ledger** records the billed characters with the press: a column on
`claude_usage`, which `bin/usage` reports. Samples are billed once each and
recorded as such. CREDENTIALS.md § AssemblyAI gains the new use. If
task/alternate-between-assemblyai-credentials.md lands first, speech takes its
key from the same place.

**The text is sent as written**; AssemblyAI strips the Markdown. Rewriting
Claude's prompt towards spoken style is out of scope, because the reply is
written for the *Record* first.

**What changes with it**:

- the GLOSSARY's *Read aloud* entry, its one-line form and a *Claude's voice*
  entry;
- STYLE.md for the picker and the *Read again* control;
- STATES.md, which is read before any of this, since a new publisher is a new
  thing on the audio session's list;
- when it ships, a decision that supersedes 2026-10-28's on where the reply is
  heard and in which voice.

**Order of shipping.** The server half can be deployed on its own. Old builds
are not subscribed, so nothing changes for them until a new build arrives.
The new build skips its local reading when `speech` is set, adds the picker,
*Read again* and the per-phone *Stop*, and drops the card.

### Still to decide

1. *Read again* for just you (recommended) or for everybody.
2. Whether *Claude's voice* is changeable only by *Pro*, like *Response
   model*, or by any member.
3. The reply's track: a second track on `media:<channel>` or its own
   identity, and what it does while a film plays. Both are settled by reading
   the app's code rather than by preference.

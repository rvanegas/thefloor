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

## Design, proposed

**Once per paste, on the server, streamed to each phone.** When
`postClaudeReply` posts, the text goes into the *Record* at once, as it does
today, and one `POST /v1/speech` starts beside it. A new
`server/src/speech.ts` provider makes that call, shaped like
`transcription.ts`'s providers and faked in tests. The audio goes into an
entry kept by paste id. A phone asks for
`GET /channels/:id/pastes/:pasteId/speech` behind the snapshot's own presence
guard, and gets what has arrived so far and then the rest as it comes. A phone
that asks after synthesis has finished gets the whole thing. Five phones still
cost one request and one set of characters. Considered and rejected:

- **Holding the paste until its audio is ready**, which makes everybody's
  *Record* wait for speech.
- **The WebSocket API**, which is built for text that arrives a token at a time.
- **A temporary token per phone**: that is one synthesis per phone, N times
  the cost, and the voice could differ from phone to phone.

**The wire, in one additive step.** `Clip` gains a field set when synthesis
starts, such as `speech: true`, so a phone knows whether to ask instead of
finding out from a 404. An older build ignores it and keeps reading with its
own voice, so this needs no SHIMS.md entry. The server half can be deployed
before the upload. The phone half is native, so it reaches phones only with
the next upload.

**PCM on the wire, at 24 kHz.** `Reader` already plays PCM buffers on the
call's engine (`Segment.audio`, converted to the node's format, half a second
at a time and resumed after an engine stop). The server's bytes become those
segments directly, with no decoder, and play from the first bytes. What it
costs is 48 kB a second: about 2.9 MB per phone for a *Medium* reply and about
8.6 MB for an *Extended* one. MP3 is six times smaller, but it needs a
streaming decoder on the phone (`AudioFileStream` and `AVAudioConverter`) and
AssemblyAI throttles MP3 requests when it is busy. 16 kHz PCM is the middle
option. **To decide.**

**The language is told on the server.** Because the API will not detect it,
a small offline detector runs on the reply, limited to the six languages and
leaning towards English and Spanish. It plays the part `NLLanguageRecognizer`
plays on the phone today, and which library to use is still to be chosen.
Below its confidence threshold, the asker's app language is used, which the
press would then send. A reply in a language outside the six (Catalan, for
example) carries no `speech` and is read with the phone's own voice. Claude
tagging its own language is rejected again, for the reason
decision/2026-10-28-claudes-reply-is-read-aloud-on-arrival.md gives.

**The voice: the asker's, kept on the account.** Nothing needs installing, so
every phone hears the same audio, and what `Clip.voices` was for (the asker's
voice where a phone has it installed) is now true by construction. A slug
names the same voice on every phone, so the choice moves off the phone's
keychain and onto the account, and the server reads it at the press. That
changes *Floor Settings*' one-scope paragraph for this card. Where nothing is
chosen, the catalogue defaults are pinned in code rather than left to
AssemblyAI. The alternative is a choice per channel: Claude's voice in this
room, the same whoever asks. **To decide.**

**The *Read aloud* card** becomes a short list of AssemblyAI voices for
English and for Spanish, a handful each from the starter list, each with a
sample. A sample is a fixed sentence synthesised once on the server and
cached, so trying voices costs nothing per tap. **The installed-voice choice
and the download instructions go** wherever the server can speak. The phone's
voice stays only as the fallback, chosen by `bestVoice` as it is today. That
removal follows the no-compatibility rule. What it leaves behind is the two
keychain entries (`thefloor.readAloud.en`, `.es`), harmless and unread, and
nothing needs migrating. Where the server cannot speak, the card stays as it
is. **To decide**, since the card was Rodrigo's own ask.

**The phone's voice stays as the fallback.** It is used when the server has no
key (no `speech` on the clip), when the request fails before the first audio
(the server retries a `429` or `503` once, after `Retry-After`, and then
answers an error status), when the build is older, and when the language is
outside the six. A response cut off partway is reported in the diagnostics
log and stops. It is rare, and reading the rest in a different voice would be
worse than stopping.

**On the phone, the route does not change.** The audio still plays on the
`AVAudioPlayerNode` on LiveKit's engine, with the `AVAudioPlayer` fallback,
so the echo canceller keeps it out of the call and out of recordings. `Reader`
gains a way to play a stream beside `speak(text)`, and `onReading`, *Restart*,
*Stop* and the `read-aloud` log lines all stay. *Restart* asks the server for
the audio again rather than re-synthesising. The three failures from build 396
(faint, cut short, and heard through others' microphones) are what to listen
for on the first walk with two phones.

**The audio is kept for an hour**, on the server's disk, and lost on a
restart. It is never put in S3, never in a recording, and never in the
snapshot. It can always be made again from the paste, and keeping it longer
would be a new kind of stored data for `/privacy` to describe. *Restart* only
appears while a reply is being heard, so an hour is plenty.

**`/privacy`**: a sentence inside Claude's section, shown only where the
server has both keys, in the style of `transcriptionSending`: the reply's text
is sent to AssemblyAI, in the United States, to be turned into speech, which
the server keeps for an hour and never records. It claims nothing about what
AssemblyAI keeps, since the docs say nothing about it. The section's date
moves (`CLAUDE_PRIVACY_UPDATED`).

**The ledger** records the billed characters with the press: a column on
`claude_usage`, which `bin/usage` reports. CREDENTIALS.md § AssemblyAI gains
the new use. If task/alternate-between-assemblyai-credentials.md lands first,
speech takes its key from the same place. Each request stands alone, so there
is no job for a key to stay with.

**The text is sent as written.** AssemblyAI strips the Markdown itself.
Rewriting Claude's prompt towards spoken style (the TTS guide's *Writing
replies that sound natural*) is out of scope, because the reply is written for
the *Record* first.

**Android stays out of scope.** It needs a player that is heard locally and
not through the call, which is the problem build 396 had on iOS, and that
belongs to task/bring-android-level-with-ios.md. Nothing here rules it out:
the audio is served to any phone that asks.

**What changes with it**: the GLOSSARY's *Read aloud* entry and its one-line
form, STYLE.md for the card, and, when this ships, a decision that supersedes
the voice half of 2026-10-28's.

### To decide before building

1. Whose voice: the asker's choice kept on the account, or a choice per
   channel.
2. PCM at 24 kHz, PCM at 16 kHz, or MP3 with a decoder on the phone.
3. Whether the installed-voice choice and the download instructions leave
   *Floor Settings* wherever the server can speak.
4. Whether an hour is the right time to keep the audio.

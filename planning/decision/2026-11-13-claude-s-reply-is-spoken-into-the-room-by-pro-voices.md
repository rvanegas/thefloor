# Claude's reply is spoken into the room by Pro voices

Built 2026-11-13, from the task *Read Claude's reply aloud with AssemblyAI's
speech instead of the phone's*, and confirmed on phones by Rodrigo the same
day: the reply heard through the call at the call's level with no echo, on
two phones; its stem in a recording's mix; and *Stop* quieting it on iOS and
the web. **Supersedes 2026-10-28-claudes-reply-is-read-aloud-on-arrival.md**
on where the reply is heard and in which voice, and **amends
2026-10-29-claudes-reply-can-be-restarted-or-stopped.md** on what *Restart*
does. Both stand for the *Standard* path, which is still the phone's own
reading, on the call's engine, as they describe.

## What ships

**Two grades of voice, and the channel picks which reads.** *Read aloud* on
*Channel Settings* is *Standard* (iOS's voices, each phone reading to itself,
free and never recorded) or *Pro* (AssemblyAI's, said once into the room for
everybody and recorded, billed per reply). *Standard* by default; the
channel's whoever asks; changed only by *Pro*, on *Response model*'s terms
(`ChannelState.readAloud`, `SET_READ_ALOUD`). **Claude writes only the words**,
so nothing on a screen calls a voice Claude's, and the engines' names appear
only in the code and on `/privacy`.

**Which voice of each grade is the asker's**, on *Floor Settings*' *Read
aloud*: the *Standard voice*, installed on the phone, per language, sent with
each press (`Clip.voices`); and the *Pro voice*, one per language, an account
setting (`speechVoices`), from a curated few (`SPEECH_VOICES`), chosen only by
*Pro*. Choosing a voice fills the slot of the language it was recorded in,
since every voice speaks all six languages and sounds best in its own.

**How the day went**, since the code reads as if it were planned this way.
The morning's design put one voice on the channel, chosen by *Pro* beside
*Response model*, and removed the phone's *Read aloud* card. By the evening,
at Rodrigo's word, the channel chose the *grade* and the asker each grade's
*voice*, and the card was back as *Standard voice* and *Pro voice*. The
channel's voice from that morning was not carried over, there being no
record of whose it was; `iosVoices` from the few hours between is unread.

## Where the reply is heard

**Into the room, and into the recording**, which is the reversal of
2026-10-28's *Local, never into the call*. When `postClaudeReply` posts, one
`POST /v1/speech` starts (`server/src/speech.ts`), and the PCM it returns at
48 kHz, `playback.ts`'s rate, is published the way shared playback is, on an
`AudioSource` of the server's own participant. Everybody present hears it
through the call at the call's level, and the echo canceller treats it as any
remote voice, so build 396's three failures (faint, cut short, heard through
others' microphones) do not arise on this path. Android hears it with no work
of its own; the 2026-11-13 ask assumed Android read aloud already, and it
never has.

- **Once per paste, on the server.** Per phone costs N times as much, puts
  the key on phones, and a recording would need its own copy anyway.
- **The HTTP API, not the WebSocket**, which is for text arriving a token at
  a time; the reply arrives whole.
- **The paste waits for its first audio, at most 4 s
  (`SPEECH_FIRST_AUDIO_MS`)**, so `Clip.speech` is never set on a reply the
  server cannot say. A refusal, a timeout, or nothing speakable posts it
  without, and the phones read it themselves. Holding the paste for the
  whole synthesis was rejected: the *Record* would wait on speech.
- **Its own participant, `room-reader:<channel>`, not a second track on
  `media:<channel>`.** `setSilenced` acts per publisher, so a second track
  on the film's could not keep an older build off the reply without taking
  the film from it too. Nothing that counts people sees it, since presence,
  the speaking indicator, the meter and egress all key on people, which is
  why the shared `isServerIdentity` the design proposed was never needed.
  And the two live differently: `media:` lives as long as a film; this one,
  a reply.
- **In the recording, never in the transcript.** The reply gets a stem under
  `CLAUDE_ID`, placed by offset like a film loaded partway through a run, and
  it is never sent for transcription: the paste is already the text. A
  published episode therefore carries the voice, and its pages have to say
  whose.
- **Over a film, without pausing it.** Pausing moves everybody's transport
  for something nobody asked of the film. A film and a recording are never
  on together, so there is no stem in that case. Ducking is the next step if
  the two together are hard to follow.
- **The floor is not involved.** The reply plays over whoever is speaking,
  as the local reading did. Waiting for the floor, or taking it, is a
  question for after it has been heard in a real room.

## Older builds

**Told apart by what they say, not by a build number.** A build sends
`hearsClaude` with its room token; a native client that does not is withheld
from the room reader before the first frame, and goes on reading with its own
voice. A browser hears it whatever it says. **The withholding is
best-effort**: a build that subscribes to each new track can race the
unsubscribe, and somebody joining mid-reply may hear its tail, so an older
phone may hear a reply twice. Rather than engineer that away, at Rodrigo's
word, **the *Ask Claude* bar warns** (`roomReaderUnheard`), naming whoever
present has not said `hearsClaude`, in a channel whose replies *Pro* voices
read. The buttons stay live. No SHIMS.md entry, since nothing was removed.

## The language

**The channel's first finished transcript of a person**
(`Transcripts.firstLanguage`, never the film's stem), then the asker's app
language sent with the press, then the account's, then English. AssemblyAI
does not detect the language and, told nothing, speaks the voice's own, so the
caller has to say. *First* rather than *latest* was Rodrigo's word: a channel
that moves from Spanish to English goes on being read in Spanish, the cost
2026-10-28 named for a channel-wide language, and one query to change. A
language outside AssemblyAI's six leaves `Clip.speech` unset and the phones
read it. Live transcripts could supply a language too (the multilingual
streaming model's `language_detection`), which is not done.

## Read again, and Stop

**Kept for an hour (`SPEECH_KEPT_MS`)**, on the server's disk by paste id,
lost on a restart, never in S3 or the snapshot; the recording's stem is a
separate copy. For that hour the paste carries **Read again, for everybody**,
which publishes the kept audio into the room again exactly as on arrival, and
a running recording gets it again, since a recording holds what was heard.
**One reply speaks at a time, and the latest press or arrival wins**: queueing
would leave a room listening to a backlog nobody chose. On the reading bar,
drawn from `roomReaderSaying` because only the server knows when it has been
said, *Restart* becomes this same act and reads *Read again*. Replaying on
your own phone alone was rejected, since Rodrigo wants the room to hear it.

**Stop stays this phone's**: `setEnabled(false)` on the reader's track
until the room says something else. Stopping it for the room is not offered,
since a reply somebody has just asked for is not one person's to silence.

## Fallback, cost and privacy

**The phone's voice is the fallback**: no key on the server, a failure before
the first audio (one retry after `Retry-After` on a 429 or 503), a language
outside the six, and older builds. A response cut off partway is reported and
stops.

**$15 per million characters**: about 1.4¢ a *Medium* reply, 4¢ an
*Extended*. `speech_usage` is the ledger, a row per synthesis, reported by
`ts usage`; *Read again* plays kept audio and costs nothing. Samples are one
fixed sentence per voice, synthesised once per process
(`GET /speech/voices/:voice/sample`).

**`/privacy`** says, inside Claude's section and only where the server has
both keys, that a *Pro* asker's reply text goes to AssemblyAI in the United
States to be spoken, is heard by everyone and kept in the recording, and that
our copy goes after an hour (`SPEECH_PRIVACY_UPDATED`). **It claims nothing
about what AssemblyAI keeps**, which its docs did not say.

## What AssemblyAI said, 2026-11-13

From the *Text to Speech* section files `llms.txt` links to, which
ASSEMBLY_PROMPT.md points here for:

- **One model, AssemblyAI-TTS-1**, in English, Spanish, German, French,
  Italian and Portuguese; every voice speaks all six.
- **`language` is a full name** (`spanish`, not `es`) and is not detected.
- **Voices are `voice_id` slugs**, from a catalogue of thousands; defaults
  `aai-kyla` (English) and `aai-antonioluis` (Spanish), which the docs say
  may change, so ours are pinned. The four starter Spanish voices are all
  Mexican. Cloning exists and is out of scope.
- **HTTP**: `POST https://tts.us.assemblyai.com/v1/speech`, up to 5,000
  characters, streamed back by default. The status arrives with the first
  audio, a few hundred milliseconds in; a failure before then is JSON, after
  it a cut body.
- **Formats**: PCM s16le (default), μ-law, A-law, any of those in WAV, or
  MP3; 24 kHz by default, also 8, 16, 22.05, 44.1 and 48.
- **The server cleans the text**: Markdown, emoji and bullets dropped;
  numbers, dates and URLs read in words. So the reply is sent as written, and
  rewriting Claude's prompt towards speech was left out: the reply is
  written for the *Record* first.
- **1,000 requests a minute** on a paid plan; the same key and header;
  `product=tts` temporary tokens exist. Data zones US (`us-east-1`) and EU
  (Stockholm). Retention of the text is not stated.

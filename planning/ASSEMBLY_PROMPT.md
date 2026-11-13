# AssemblyAI Integration — Coding Agent Instructions

**Standing, and not ours.** This is AssemblyAI's own guidance for coding
agents, kept verbatim as a reference about their API. It is not a design and
not a plan: decision/2026-08-25-transcripts.md is the design, and where the two differ about what
this project is doing, decision/2026-08-25-transcripts.md wins.

**Taken 2026-11-13** from `https://www.assemblyai.com/docs/agent-instructions.md`,
the integration prompt that `llms.txt` points to, replacing a snapshot from
before 2026-10-03. The new one is shorter: it dropped the earlier one's
sections on the managed Voice Agent API and the sync transcription API, and
renumbered what was left.

It earns its place because memory is not evidence about this API. It corrected
two things in phase 1 that had type-checked and read fine and would have failed
at runtime — `speech_model` is deprecated in favour of the `speech_models`
fallback array, and `utterances` comes back only when diarisation is on, which
we never ask for. Read § *4. API overview*, § *5. `speech_models` semantics*
and § *14. Quick-reference gotchas* before touching
`server/src/transcription.ts`, and § *9. Streaming* before touching
`server/src/streaming.ts`.

**It says almost nothing about text-to-speech**, which arrived in 2026 as
AssemblyAI-TTS-1: one line in its discovery questions, pointing at the TTS
quickstart. The reference for that is the *Text to Speech* section files
linked from `llms.txt` (`/docs/llms-full/text-to-speech-1.txt` to `-4`).
task/read-claude-s-reply-aloud-with-assemblyai-s-speech-instead-of-the-phone-s.md
records what the parts it uses said on 2026-11-13.

Two cautions about reading it. Its § *0. Operating rules* describe a
discovery-and-approval workflow for a project that has not decided anything
yet; this one has, in decision/2026-08-25-transcripts.md, so those rules do not apply here. And it
is a snapshot of a moving API — `https://www.assemblyai.com/docs/llms.txt` is
the live version and the thing to fetch when it matters.

Everything below this line is theirs.

---

You are helping a developer integrate AssemblyAI's Speech-to-Text API into their application. Your job is to understand their context through discovery, produce a concrete implementation plan, get their approval, and then write correct, production-ready code.

This is a public API. The developer creates their own key at [assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/home).

**Official documentation.** Two ways to wire your coding agent up to live docs (both recommended — they layer):

1. **Project instructions** (every prompt): add to `CLAUDE.md`, `.cursorrules`, `AGENTS.md`, or equivalent:

   ```
   Always fetch https://www.assemblyai.com/docs/llms.txt before writing AssemblyAI code.
   The API has changed — do not rely on memorized parameter names.
   ```

   `llms.txt` is the structured index. For full content, fetch the section files it links (each under 100 KB) rather than the whole `llms-full.txt`.

2. **Docs MCP server** (on-demand lookups): `https://www.assemblyai.com/docs/mcp` — Streamable HTTP transport. Lets the agent search and fetch AssemblyAI documentation pages on demand.

   ```bash
   # Claude Code
   claude mcp add assemblyai-docs --transport http https://www.assemblyai.com/docs/mcp
   ```

   See the [Coding agent prompts](/coding-agent-prompts) page for Cursor and other clients.

---

## 0. Operating rules

1. **Discovery first, code later.** Do not write code until the developer has answered enough of Section 1 for you to make a specific recommendation.
2. **One question per message.** Never batch discovery questions. Wait for an answer before asking the next one.
3. **Plan before you build.** After discovery, present a written recommendation (see Section 2) and wait for explicit approval before generating implementation code.
4. **Prefer the official SDKs.** Use `assemblyai` (Python) or `assemblyai` (Node/JS) unless the developer has a specific reason not to. The SDKs handle polling, upload streaming, WebSocket lifecycle, and session termination correctly — which is where most hand-rolled integrations fail.
5. **Never expose the API key in client-side code.** For browser or mobile streaming, always mint a temporary token server-side. For pre-recorded, proxy uploads and submissions through your server.
6. **Authorization header is the raw key — no `Bearer` prefix.** This trips up everyone.
7. **`speech_models` is optional on pre-recorded requests.** If omitted, the request defaults to `["universal-3-5-pro", "universal-2"]`. You can still set it explicitly — see Section 5 for semantics.
8. **Always terminate streaming sessions explicitly.** An abandoned WebSocket keeps accruing charges until the 3-hour cap.
9. **Do not use deprecated transcript params:** `auto_chapters`, `summarization`, `summary_model`, `summary_type`. Use LLM Gateway instead (Section 8).
10. **If the developer's answers are inconsistent, stop and surface the conflict.** Example conflicts: "browser-only, no backend" + "streaming"; "phone call audio" + "upload a file"; "real-time" + "need speaker diarization with full names." Don't paper over these — ask.
11. **Be flexible.** If something the developer says doesn't match the shape of the API (e.g., they describe a use case that isn't supported — see Section 12), say so directly and propose the closest supported alternative.
12. **Verify parameters against live docs before recommending.** This file is a snapshot — features move between beta and GA, model-specific behaviors change, and new knobs ship regularly. Before posting the Section 2 recommendation, confirm each parameter you plan to use is supported for the chosen **mode** (pre-recorded vs streaming) *and* **model** (U3 Pro, U2, U3 Pro Streaming, Universal-Streaming). Do not assume a pre-recorded flag works on streaming, or that a parameter supported on U2 still behaves the same on U3 Pro. Pull the current reference rather than memorizing. Primary sources, in order of preference:
    - `https://www.assemblyai.com/docs/llms.txt` — the machine-readable index; fetch the section files it links (each under 100 KB) for full content
    - Per-mode docs: `/docs/pre-recorded-audio/*` (pre-recorded) and `/docs/streaming/*` (streaming), including the model-specific overview page (e.g., `/docs/streaming/getting-started/transcribe-streaming-audio` and `/docs/streaming/select-the-speech-model`) which lists *exactly* which parameters are honored/ignored by that model
    - The OpenAPI-backed API reference at `/docs/api-reference/*` for request/response schemas
    - For LLM Gateway: `/docs/llm-gateway/quickstart` lists the current valid `model` strings — don't guess short names like `claude-sonnet-4`

  If a flag you remembered isn't in the current docs (or is marked beta / deprecated / ignored for the chosen model), flag it in the recommendation's "Open questions / assumptions" block and ask the developer before proceeding.

---

## 1. Discovery questions

Ask these **one at a time**, in order. Skip any question already answered in the conversation. Adapt wording to sound natural, but cover the substance of each.

1. **What are you building, and are you adding AssemblyAI to an existing project or starting fresh?** (A short description of the product is usually enough.)
2. **What do you need: pre-recorded transcription, real-time STT, text to speech?**
   - Pre-recorded: uploaded files, URLs, batch processing, post-call analytics. → Section 6.
   - Real-time STT: live transcripts only (you bring your own LLM). Live captioning, voice-agent STT, meeting notetaking, dictation. → Section 9.
   - Text to speech: spoken audio from text, such as voice-agent replies. → [Streaming TTS quickstart](/tts/getting-started/quickstart).
3. **Where is your audio coming from?** (e.g., uploaded files, public URLs, browser microphone, mobile app, Twilio/Telnyx phone numbers, SIP trunks.)
4. **What language and framework are you using?** (e.g., Python + FastAPI, Node + Next.js, Go, Ruby, Swift, Kotlin, browser-only, LiveKit, Pipecat, Vapi, Vocode, Retell.)
5. **Do you already have an AssemblyAI API key, or do you need to create one?** (If needed: [assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/home).)
6. **Do you have a data residency requirement?** (US vs EU — this changes the base URL.)
7. **Anything beyond a plain transcript?** Don't read off a checklist. Use everything they've told you so far — the product description from Q1, the audio source from Q3, the framework from Q4 — to **infer which features are plausibly applicable**, then ask in plain language about *those*. The point is to surface things the developer might not know to ask for, not to make them choose from a menu.

   The authoritative catalog of available features and their parameters is in the live docs (see Operating Rule 12) — consult it, don't rely on memory. Section 3 of this file is a starting reference, not the final word.

   Calibrate to mode and use case. Examples:
   - Customer-support call analytics (pre-recorded) → speaker diarization and PII redaction are almost certainly relevant; sentiment may be; chapters via LLM Gateway often is. Ask about those, not about live-streaming features.
   - Browser live-captioning (streaming) → ask about multilingual support and domain vocabulary; don't bring up PII redaction or summaries-during-session (neither applies to streaming).
   - Voice agent (streaming) → keyterms prompting and turn-detection tuning matter; speaker diarization usually doesn't.
   - Medical scribe → medical domain mode is the headline feature; ask about it explicitly.

   Don't ask about things the user gets automatically with no toggle (word-level timestamps and confidence on `words[]`, streaming `SpeechStarted` events). Mention them in the recommendation as capabilities they'll have, but don't make them a choice.

   If you're confident from context that a feature is needed (e.g., they said "show who said what" → `speaker_labels`), include it in the recommendation directly with a one-line rationale rather than asking again.

---

## 2. Recommendation template (after discovery)

Before writing code, post a plan with all of the following. Get explicit approval.

````
## Recommendation

**Use case:** <one-sentence summary of what they're building>
**Mode:** <pre-recorded / streaming / both>
**Region:** <US or EU base URL>

**Model:**
- <model name> — <one-line rationale>
- <fallback model, if applicable>

**Endpoints:**
- <endpoint 1>
- <endpoint 2>

**Parameters enabled:** (before filling this in, verify each parameter is supported on the chosen mode + model per Operating Rule 12)
- `param_name`: <value> — <why>
- ...

**Auth pattern:**
<server-side key / temp token / proxied uploads — and where the key lives>

**Termination & error handling:**
<how streaming sessions are closed; how errors / retries are handled>

**Code skeleton:**
<2–6 bullet points describing the files/functions you'll generate>

**Open questions / assumptions:**
<anything you inferred that they should confirm>

Ready to proceed?
````

If they say yes, write the code. If they push back on any piece, revise the plan — don't just start coding around objections.

---

## 3. Feature selection guide (agent reference)

Use this to build the recommendation. Do not dump it on the user.

| Developer need | Parameter / approach |
|---|---|
| Speaker diarization | `speaker_labels: true` (pre-recorded, and streaming — streaming adds a `speaker_label` to each Turn event) |
| Automatic language detection | `language_detection: true` (pre-recorded; on streaming, available on Universal-3.6 Pro Realtime and Universal-Streaming Multilingual — adds `language_code` + `language_confidence` to Turn events. It only reports the language; it doesn't change transcription.) |
| Specific language | `language_code: "es"` etc. on pre-recorded; on Universal-3.6 Pro Realtime, `language_codes: ["es"]` steers the model toward the languages you list |
| Multilingual / code-switching | `speech_models: ["universal-3-5-pro"]` + `prompt` parameter — see [U3 Pro prompting guide](/pre-recorded-audio/universal-3-5-pro/prompting) |
| Domain-specific vocabulary | `keyterms_prompt: [...]` (pre-recorded: up to 1,000 terms with U3 Pro / 200 with U2; streaming: up to 100 terms, each ≤50 chars) |
| Medical domain | `domain: "medical-v1"` (pre-recorded *and* streaming; supported languages: en, es, de, fr) |
| Veterinary domain (beta) | `domain: "veterinary-v1"` (pre-recorded *and* streaming) |
| PII redaction in text | `redact_pii: true` + `redact_pii_policies: [...]` + optional `redact_pii_sub: "hash" \| "entity_name"` |
| PII redaction in audio | `redact_pii_audio: true` (original file must be ≤1 GB; redacted audio URL is available for 24 h) |
| Chapters or summaries | Transcribe first, then LLM Gateway (Section 8) |
| Word timestamps / confidence | Included by default on `words[]` |
| Webhook delivery (skip polling) | `webhook_url: "..."` (Section 7) |
| Custom voice agent (your LLM + AssemblyAI TTS) | Real-time STT + framework integration (Section 10) + [Streaming TTS](/tts/getting-started/quickstart) |
| Multilingual streaming | Universal-3.6 Pro Realtime (native code-switching; `language_codes` to steer toward known languages) |

---

## 4. API overview

- **REST base URL (US):** `https://api.assemblyai.com`
- **REST base URL (EU):** `https://api.eu.assemblyai.com`
- **Streaming WebSocket (Edge, default):** `wss://streaming.assemblyai.com/v3/ws` — auto-routes to the nearest region (Oregon / Virginia / Ireland) for lowest latency
- **Streaming WebSocket (US data residency):** `wss://streaming.us.assemblyai.com/v3/ws` — data pinned to US
- **Streaming WebSocket (EU data residency):** `wss://streaming.eu.assemblyai.com/v3/ws` — data pinned to EU
- **LLM Gateway (US):** `https://llm-gateway.assemblyai.com/v1/chat/completions`
- **LLM Gateway (EU):** `https://llm-gateway.eu.assemblyai.com/v1/chat/completions` — Claude and Gemini only; OpenAI and Qwen are US-only
- **Auth header:** `Authorization: YOUR_API_KEY` (no `Bearer`). Same header is used for REST, streaming WS upgrade, temp-token minting, and LLM Gateway
- **Content type:** `application/json` for submit/poll and LLM Gateway; `application/octet-stream` (raw binary) for `/v2/upload`

Core REST endpoints:
- `POST /v2/upload` — upload a local file (raw binary body, **not multipart**). Returns `{ "upload_url": "..." }`. Max 2.2 GB.
- `POST /v2/transcript` — submit a job. Returns transcript object with `id` and `status: "queued"`. Max 5 GB / 10 hours.
- `GET /v2/transcript/{id}` — poll. Statuses: `queued`, `processing`, `completed`, `error`. Limited to 60 requests per minute per API key and transcript ID; over the limit returns `429` with a `Retry-After` header. Poll every few seconds, not in a tight loop.

Streaming:
- `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-6-pro`
- `POST https://token.assemblyai.com/v1/token` with the JSON body `{"product": "streaming", "expires_in_seconds": 60}` — mint a temp token for browser/mobile clients. The token is reusable until `expires_in_seconds` elapses, so mint a fresh one per session. Optional `max_session_duration_seconds` (60–10800, defaults to 3 h) caps the downstream session length. At the cap, the session ends after the current turn or up to 60 s later, and that extra time is billed.

---

## 5. `speech_models` semantics

`speech_models` on pre-recorded requests is an **ordered fallback list**, not parallel execution. The first model in the array is tried; if it's unavailable (e.g., not yet rolled out to the account, or temporarily unhealthy), the next is used. A single transcript is produced by exactly one model.

Recommended default: `["universal-3-5-pro", "universal-2"]` — tries the latest model first, falls back to the stable predecessor.

On streaming, the parameter is **singular** (`speech_model=universal-3-6-pro`) — there is no fallback list. Easy to mix up.

---

## 6. Pre-recorded quick start

### SDK (recommended)

**Python:**
```python
# pip install assemblyai
import assemblyai as aai
import os

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

config = aai.TranscriptionConfig(
    speech_models=["universal-3-5-pro", "universal-2"],  # fallback handled by SDK
    speaker_labels=True,
)

transcript = aai.Transcriber(config=config).transcribe("https://assembly.ai/wildfires.mp3")
# Or a local path: .transcribe("./recording.wav")

if transcript.status == aai.TranscriptStatus.error:
    raise RuntimeError(transcript.error)
print(transcript.text)
```

For more test files by scenario (medical, multilingual, meeting, phone, call center, noisy), see [Sample audio files](/samples).

**Node/JS:**
```javascript
// npm install assemblyai
import { AssemblyAI } from 'assemblyai';

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

const transcript = await client.transcripts.transcribe({
  audio: 'https://assembly.ai/wildfires.mp3', // or a local file path / Buffer / stream
  speech_models: ["universal-3-5-pro", "universal-2"],
  speaker_labels: true,
});

if (transcript.status === 'error') throw new Error(transcript.error);
console.log(transcript.text);
```

The SDK handles upload, submit, and polling. You don't need to write the polling loop yourself.

### Raw HTTP (fallback — use only if SDK isn't an option)

**Upload a local file** (raw bytes, not multipart):
```bash
curl -X POST https://api.assemblyai.com/v2/upload \
  -H "Authorization: $ASSEMBLYAI_API_KEY" \
  --data-binary @recording.wav
# -> { "upload_url": "https://cdn.assemblyai.com/upload/..." }
```

**Submit and poll (Python):**
```python
import os, time, requests

headers = {"authorization": os.environ["ASSEMBLYAI_API_KEY"]}

submit = requests.post(
    "https://api.assemblyai.com/v2/transcript",
    headers=headers,
    json={
        "audio_url": "https://assembly.ai/wildfires.mp3",
        "speech_models": ["universal-3-5-pro", "universal-2"],
        "speaker_labels": True,
    },
)
transcript_id = submit.json()["id"]

while True:
    res = requests.get(
        f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
        headers=headers,
    ).json()
    if res["status"] == "completed":
        print(res["text"]); break
    if res["status"] == "error":
        raise RuntimeError(res["error"])
    time.sleep(3)
```

Common optional params: `speaker_labels`, `language_detection`, `language_code`, `punctuate`, `format_text`, `redact_pii`, `redact_pii_audio`, `keyterms_prompt`, `webhook_url`, `prompt`.

---

## 7. Webhooks (skip polling)

Provide `webhook_url` on submit; AssemblyAI POSTs when the job finishes:

```json
{ "transcript_id": "5552493-16d8-42d8-8feb-c2a16b56f6e8", "status": "completed" }
```

Handler requirements:
- Return 2xx within **10 seconds**. Otherwise retried up to 10 times, 10s apart. 4xx is not retried.
- On receipt, call `GET /v2/transcript/{id}` to fetch the full result — the webhook payload doesn't include it.

Optional custom auth on your webhook: set `webhook_auth_header_name` and `webhook_auth_header_value` when submitting.

**Source IPs** (for allowlists): US `44.238.19.20`, EU `54.220.25.36`.

**Local dev note:** Webhook URLs must be publicly reachable. Use ngrok, Cloudflare Tunnel, or similar during development.

---

## 8. LLM Gateway (chapters, summaries, custom analysis)

LLM Gateway replaces both the deprecated transcript params (`auto_chapters`, `summarization`, `summary_model`, `summary_type`) and the legacy **LeMUR** API, which sunset on 2026-03-31. If a developer mentions LeMUR or `transcript_ids`, point them at LLM Gateway and the [migration guide](/llm-gateway/quickstart). Workflow:

1. Transcribe normally with `POST /v2/transcript`.
2. Once `status == "completed"`, POST to LLM Gateway with the transcript text (or paragraphs from `GET /v2/transcript/{id}/paragraphs` for chapter-style output):

```http
POST https://llm-gateway.assemblyai.com/v1/chat/completions
Authorization: YOUR_API_KEY
Content-Type: application/json

{
  "model": "claude-sonnet-4-6",
  "messages": [
    { "role": "system", "content": "Produce a 5-bullet summary of the transcript." },
    { "role": "user", "content": "<transcript.text here>" }
  ],
  "max_tokens": 1000
}
```

Model IDs are exact strings — see the [LLM Gateway Overview](/llm-gateway/quickstart) for the current list. Examples: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `gpt-5.2`, `gpt-5.1`, `gpt-4.1`, `gemini-3.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash`, `qwen3-next-80b-a3b`. `claude-sonnet-4` by itself is **not** valid — always include the version suffix. EU region (`llm-gateway.eu.assemblyai.com`) supports Anthropic and Google only.

Do not submit with `auto_chapters` and `summarization` both enabled — the API rejects it (`Only one of the following models can be enabled at a time: auto_chapters, summarization.`). But the broader rule is simpler: **don't use either.**

---

## 9. Streaming — Universal-3.6 Pro

**WebSocket (default, Edge Routing):** `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-6-pro`

For data residency, swap the host: `streaming.us.assemblyai.com` (US-pinned) or `streaming.eu.assemblyai.com` (EU-pinned). The default host auto-routes to the nearest region.

**Audio format:** PCM16 signed little-endian, mono, 16 kHz. Binary WebSocket frames, **20–1000 ms per chunk** (50–100 ms recommended), no faster than real-time. Phone audio (`encoding=pcm_mulaw`, `sample_rate=8000`) is sent as-is — don't upsample.

**Auth:**
- Server-side: `Authorization` header on the WS upgrade.
- Browser/mobile: mint a short-lived token server-side and pass it as `?token=<token>` (no Authorization header).

Mint a token:
```bash
curl -s -X POST "https://token.assemblyai.com/v1/token" \
  -H "Authorization: $ASSEMBLYAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"product": "streaming", "expires_in_seconds": 60}'
# { "token": "..." }
```
`expires_in_seconds` must be 1–600. A token can start multiple sessions until it expires, so mint a fresh one per session and keep the expiry short.

### Server messages (JSON)

- `Begin` — `{ type, id, expires_at }`
- `SpeechStarted` — `{ type, timestamp, confidence }`
- `Turn` — `{ type, turn_order, end_of_turn, transcript, end_of_turn_confidence, words:[...], utterance }`
  - `end_of_turn: false` → partial; `end_of_turn: true` → finalized and formatted. Always read `transcript` for current text.
- `Termination` — `{ type, audio_duration_seconds, session_duration_seconds }`

### Client messages

- Binary PCM16 frames — audio.
- `{ "type": "Terminate" }` — graceful end. **Always send this when done.**
- `{ "type": "ForceEndpoint" }` — force current turn to end.
- `{ "type": "KeepAlive" }` — only needed if `inactivity_timeout` is set.
- `{ "type": "UpdateConfiguration", "keyterms_prompt": [...], "min_turn_silence": 100, "max_turn_silence": 1000 }` — adjust mid-session.

### SDK (recommended)

**Python:**
```python
# pip install assemblyai
import os
from assemblyai.streaming.v3 import (
    StreamingClient,
    StreamingClientOptions,
    StreamingEvents,
    StreamingParameters,
    TurnEvent,
)

def on_turn(_, event: TurnEvent):
    tag = "FINAL" if event.end_of_turn else "partial"
    print(f"{tag}: {event.transcript}")

client = StreamingClient(
    StreamingClientOptions(api_key=os.environ["ASSEMBLYAI_API_KEY"])
)
client.on(StreamingEvents.Turn, on_turn)
client.connect(StreamingParameters(sample_rate=16000, speech_model="universal-3-6-pro"))

# Feed 16 kHz mono PCM16 chunks (50–1000ms each) via client.stream(chunk)
# When finished:
client.disconnect(terminate=True)  # sends Terminate and closes cleanly
```

**Node/JS:**
```javascript
// npm install assemblyai
import { AssemblyAI } from 'assemblyai';

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
const rt = client.streaming.transcriber({
  sampleRate: 16000,
  speechModel: 'universal-3-6-pro',
});

rt.on('turn', (turn) => {
  const tag = turn.end_of_turn ? 'FINAL' : 'partial';
  console.log(`${tag}: ${turn.transcript}`);
});
rt.on('error', (err) => console.error(err));

await rt.connect();
// rt.sendAudio(pcm16Buffer) for each 50–1000ms chunk
// When done:
await rt.close(); // sends Terminate and closes
```

### Raw WebSocket (fallback)

**Node.js (`ws`):**
```javascript
import WebSocket from 'ws';

const ws = new WebSocket(
  'wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-6-pro',
  { headers: { authorization: process.env.ASSEMBLYAI_API_KEY } },
);

ws.on('open', () => {
  // Feed PCM16 16kHz mono chunks here, 50–1000ms each.
  // Example: audioStream.on('data', (chunk) => ws.send(chunk));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'Turn') {
    console.log(msg.end_of_turn ? `FINAL: ${msg.transcript}` : `partial: ${msg.transcript}`);
  }
});

function stop() {
  ws.send(JSON.stringify({ type: 'Terminate' })); // required!
}
```

**Python (`websockets`):**
```python
import asyncio, json, os, websockets

URL = "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-6-pro"

async def run(audio_source):
    """audio_source: async iterator yielding 50–1000ms PCM16 chunks at 16kHz mono."""
    async with websockets.connect(
        URL,
        additional_headers={"Authorization": os.environ["ASSEMBLYAI_API_KEY"]},
    ) as ws:
        async def send_audio():
            async for chunk in audio_source:
                await ws.send(chunk)
            await ws.send(json.dumps({"type": "Terminate"}))

        async def recv_loop():
            async for raw in ws:
                msg = json.loads(raw)
                if msg["type"] == "Turn":
                    tag = "FINAL" if msg["end_of_turn"] else "partial"
                    print(f"{tag}: {msg['transcript']}")
                elif msg["type"] == "Termination":
                    return

        await asyncio.gather(send_audio(), recv_loop())

# asyncio.run(run(my_audio_iterator()))
```

---

## 10. Voice Agent framework configs (real-time STT + your own pipeline)

This section is for developers who are wiring AssemblyAI Real-time STT into LiveKit, Pipecat, Vapi, Vocode, Retell, or similar, and bringing their own LLM. For the agent's voice, use AssemblyAI [Streaming TTS](/tts/getting-started/quickstart), which has plugins for [LiveKit](/tts/livekit) and [Pipecat](/tts/pipecat).

The defaults will not be good enough. Common tuning:

- **`keyterms_prompt`** — pass proper nouns, product names, and domain terms. For dynamic values (usernames, order IDs), update mid-session via `UpdateConfiguration`.
- **Turn silence bounds** — `min_turn_silence` and `max_turn_silence` (ms). Lower values fire end-of-turn faster but risk cutting speakers off. Higher values reduce false finalizations. Form-filling and dictation use cases often want wider windows.
- **Multilingual** — Universal-3.6 Pro Realtime code-switches natively and ignores `end_of_turn_confidence_threshold`. Pass `language_codes` (for example `["es"]`) to steer the model toward known languages.
- **Barge-in / false SpeechStarted** — ambient noise, TTS bleed-through, and PSTN echo can cause spurious `SpeechStarted` events. If the agent is interrupting itself, look here first. Framework-level knobs (e.g., LiveKit's `min_interruption_duration`) often complement, not replace, server-side tuning.
- **Phone audio** — 8 kHz mu-law (`pcm_mulaw` at 8000 Hz) should be sent as-is, not upsampled to 16 kHz. Upsampling degrades accuracy.

When the developer names one of these frameworks, ask about their specific turn-taking and interruption requirements before defaulting.

---

## 11. Browser patterns

**Never put the API key in client code.**

### Pre-recorded — proxy upload + submit through your server

```javascript
// Next.js route handler (server)
export async function POST(request) {
  const incoming = await request.formData();
  const file = incoming.get('file'); // Blob

  const upload = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: process.env.ASSEMBLYAI_API_KEY },
    body: file.stream(),
    duplex: 'half',
  });
  const { upload_url } = await upload.json();

  const submit = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_models: ['universal-3-5-pro', 'universal-2'],
    }),
  });
  return Response.json(await submit.json());
}
```

### Streaming — server mints a temp token, client connects directly

```javascript
// Server
export async function GET() {
  const res = await fetch('https://token.assemblyai.com/v1/token', {
    method: 'POST',
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ product: 'streaming', expires_in_seconds: 60 }),
  });
  return Response.json(await res.json()); // { token }
}
```

```javascript
// Client
const { token } = await fetch('/api/aai-token').then((r) => r.json());
const ws = new WebSocket(
  `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-6-pro&token=${token}`,
);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'Turn') console.log(msg.transcript, msg.end_of_turn);
};
```

### Capturing mic audio in the browser

`MediaRecorder` does not emit PCM16. You need an `AudioWorklet` (preferred) or `ScriptProcessorNode` to:
1. Capture raw Float32 samples.
2. Downsample to 16 kHz.
3. Convert Float32 → Int16.
4. Send each ~50 ms chunk as a binary WS frame.

Reference: [AssemblyAI realtime-transcription-browser-js-example](https://github.com/AssemblyAI/realtime-transcription-browser-js-example).

---

## 12. Not supported / out of scope

If a developer asks for any of these, say so directly and propose the closest supported alternative. Do not improvise.

- **Real-time translation.** AssemblyAI transcribes, it doesn't translate. Suggest: transcribe with U3 Pro, then translate via LLM Gateway.
- **On-device / offline STT.** Cloud API only.
- **Speaker identification (matching voices to known people).** `speaker_labels` does diarization (Speaker A, B, C) but does not recognize specific individuals. For pre-recorded (async) audio, add the Speech Understanding [Speaker Identification](/speech-understanding/speaker-identification) task (`speech_understanding.request.speaker_identification` with `speaker_labels: true`) to replace the generic labels with the names or roles you provide. Speaker Identification isn't available for streaming or other products yet.
- **Voice activity detection as a standalone product.** VAD is internal to the streaming pipeline and surfaced via `SpeechStarted` / turn events, not exposed separately.

---

## 13. Error handling

For the most common errors across all APIs, with fixes, and links to each product's full error and limit reference, see [Errors and limits](/errors).

### REST (pre-recorded)

- **401** — Missing/invalid Authorization, disabled account, or insufficient balance. Double-check there's no `Bearer` prefix.
- **Transcript `status: "error"`** — Read the `error` field on `GET /v2/transcript/{id}`.
- **Retries** — Exponential backoff on 5xx. For 429, respect the `Retry-After` header.
- **Limits** — `/v2/upload` max 2.2 GB; `/v2/transcript` max 5 GB / 10 hr per file.
- **Scoping** — An API key can only transcribe files uploaded under the same project.

### Streaming — handshake

- **HTTP 410** — The old `v2` streaming endpoint is deprecated. Upgrade to `/v3/ws`. This is an HTTP status on the upgrade request, not a WebSocket close code.

### Streaming — WebSocket close codes

| Code | Meaning |
|------|---------|
| `1008` | Unauthorized: missing or invalid key or token, expired temporary token, insufficient funds, or disabled key. Don't retry until fixed; tell it apart from the rate limit by the `Error` message's `error` text |
| `1008` | Too many new sessions this minute (`error` text `Unauthorized Connection: Too many concurrent sessions`); back off and retry next minute |
| `3005` | Session cancelled (server-side error) |
| `3006` | Invalid message type / invalid JSON |
| `3007` | Audio chunk outside 20–1000 ms, or sent faster than real-time |
| `3008` | Session expired (3-hour cap) |

### Streaming gotchas

- `speech_model` (streaming, singular) vs `speech_models` (pre-recorded, plural). Don't mix up.
- On Universal-3.6 Pro Realtime, `end_of_turn_confidence_threshold` is silently ignored; `language_codes` steers the model toward the languages you list.
- Always send `{ "type": "Terminate" }` when finished. An abandoned session stays billable until the 3-hour cap (`3008`).
- Chunk size matters: frames outside 20–1000 ms will close the socket with `3007`.

---

## 14. Quick-reference gotchas

- No `Bearer` prefix on the Authorization header.
- `speech_models` is **optional** on pre-recorded submits — it defaults to `["universal-3-5-pro", "universal-2"]` and is an **ordered fallback list** when provided.
- `/v2/upload` takes **raw binary**, not multipart.
- Webhook handlers must return 2xx in ≤10 seconds.
- Local webhook development needs a public tunnel (ngrok, Cloudflare Tunnel).
- Browser code never holds the API key. Proxy uploads, or mint temp tokens for streaming.
- Always `Terminate` streaming sessions.
- Don't use `auto_chapters`, `summarization`, `summary_model`, `summary_type`. Use LLM Gateway.
- Medical mode is `domain: "medical-v1"` (pre-recorded body param / streaming query param). The legacy `medical_mode` flag is **not** the right name.
- Veterinary mode (beta) is `domain: "veterinary-v1"` (pre-recorded body param / streaming query param).
- LLM Gateway model IDs are exact and versioned (e.g., `claude-sonnet-4-6`, `gpt-5.2`, `gemini-2.5-pro`). Shorthand like `claude-sonnet-4` is invalid.
- Phone audio stays at native 8 kHz mu-law (`encoding=pcm_mulaw`) — don't upsample.
- EU customers use `api.eu.assemblyai.com`, `streaming.eu.assemblyai.com`, and `llm-gateway.eu.assemblyai.com`. The default streaming host (`streaming.assemblyai.com`) is **Edge Routing**, not US-pinned — use `streaming.us.assemblyai.com` if you need data residency guarantees on the US side.
- Speech-model values are **raw strings** in the SDKs (`"universal-3-5-pro"`, `"universal-2"`). Enum aliases like `aai.SpeechModel.universal_3_pro` do **not** exist — agents that hallucinate them produce code that imports cleanly and fails at runtime.
- LeMUR has fully sunset (2026-03-31). Don't generate code that calls LeMUR endpoints or passes `transcript_ids` to a chat-completions API — use LLM Gateway with the transcript text in `messages` instead.

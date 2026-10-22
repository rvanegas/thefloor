# Integrate Claude into Conversation

1. Introduce client for Claude models. Use credentials from ~/src/mdc but save them to ~/.config/thefloor .
2. Compose a prompt from channel record of transcripts, together with the instruction to contribute to the conversation.
3. Add a card to People tab representing Claude.
4. On this case, add a button, with the same style as "ping" on other cards, with the label "prompt".
5. Pressing it sends prompt described in step 2 above, and response is introduced directly into the Record.

## Plan

Planned 2026-10-22, and revised the same day with Rodrigo's answers: a key of
the project's own rather than mdc's; the whole *Record*, not the room; open to
everybody, not `debug`; the latest Haiku by default; an indicator on the card
that everybody sees. The five steps above are the ask, and step 4's label is
the one thing deliberately changed from it (§ 3 and 4).

**The shape in one sentence:** a new route, `POST /channels/:id/claude`, reads
the channel's *Record* as text, asks Anthropic for one contribution, and
applies the answer as a **paste authored by Claude** — so it enters the
*Record* the way every paste does.

### 1. The client, and the credential

- **`server/src/claude.ts`**, wrapping `@anthropic-ai/sdk`, the server's first
  provider SDK. AssemblyAI is driven by hand-rolled `fetch`, but the SDK's
  typed errors, retries and `usage` are worth the dependency, and the test seam
  is the same shape: the class takes something with `messages.create`, and
  tests pass a fake. `available()` is true only when the key is set.
- **Model: `claude-haiku-5-5` by default**, overridable by `ANTHROPIC_MODEL`.
  The choice goes through one seam, `modelFor(accountId)`, which returns the
  default today. That is where *Pro (the subscription)* will later choose
  another model; this task builds the seam and nothing behind it.
- **The key is `ANTHROPIC_API_KEY` in `~/.config/thefloor/server.env`** — the
  file every server credential is authored in, carried to the box by
  `bin/env-push`. It is a key issued for The Floor alone, and not mdc's, on
  CREDENTIALS.md's principle that no one leak is worse than it has to be.
  **Put it in the file whenever, and push it only with the deploy that ships
  this**: once the code is there, the key's presence is what makes `/privacy`
  name Anthropic.
- **Paperwork in the same commit**: the tenth entry in CREDENTIALS.md (it
  spends per use, as AssemblyAI does; what a leak costs; rotating it is free,
  since nothing stored depends on it), a row in its index, and
  `ANTHROPIC_API_KEY=` and `ANTHROPIC_MODEL=` in `server/.env.example`, marked
  `# env-push: optional`.
- **`/privacy` names Anthropic when the key is set, and only then** — the
  AssemblyAI rule exactly (`privacy.ts`). It says what leaves (the channel's
  *Record* as text, names as kept), that it is sent only when somebody presses
  the button, and what Anthropic's commercial terms say of retention, read on
  the day rather than from memory.

### 2. The prompt

- **The whole *Record*, oldest first**, from its three sources: live lines
  (`live.linesBefore`), the batch transcripts of recordings
  (`transcripts.linesFor`, through `readableLines` so names are the frozen
  ones) and pastes (`pastes.within`), laid out in rooms as the tab lays them
  out — each room headed by its date and hours.
- **Rendered as speaker-labelled prose** with wall-clock times, as the `txt`
  export is, one block per speaker turn. Claude's earlier replies are pastes,
  so they appear in it labelled *Claude*, and a second press continues the
  conversation rather than repeating itself. All of it is one user message:
  replaying the replies as assistant turns would buy nothing that the label
  does not already give.
- **Capped from the oldest end** at the input budget below. Whole rooms are
  dropped first, then lines from the front of the oldest room kept, and the
  prompt says where the record begins.
- **The system prompt** says: you are Claude, taking part in a voice
  conversation in an app called The Floor. What follows is its record so far,
  made by speech recognition and so imperfect. Contribute one turn to it, as
  somebody in the room would: briefly, in the language being spoken, by name
  where that helps, and in plain text with no Markdown, since the *Record*
  draws plain lines. It is one constant in `claude.ts`, with a test that pins
  its ingredients rather than its wording.
- **Nothing to read, nothing sent**: a channel whose *Record* holds no text
  answers 409 with a sentence (*There is nothing in the Record yet for Claude
  to read.*) rather than prompting on nothing.

### The caps

Adopted as recommended, 2026-10-22. Shaped by the one cliff in Haiku 5.5's pricing. A prompt up to 100K tokens
costs $0.10 per million input and $0.50 per million output, and a prompt past
100K costs five times that. The context window is 1M, so the window is not the
limit; the price is.

- **Input: 90,000 tokens of *Record***, leaving headroom under 100K for the
  system prompt and the room headings. Spoken conversation runs about
  12–13K tokens an hour, so this is **about seven hours of talk** — most
  channels' entire *Record*, and the most recent seven hours of the rest.
  Measured as characters, about 3.5 to the token, rather than by a
  `count_tokens` round trip before every press; `usage.input_tokens` is
  logged to the meter and calibrates the ratio, which matters for Spanish.
- **Output: `max_tokens: 1024`, `effort: "low"`**, with the system prompt
  asking for at most about a hundred words. Haiku 5.5 thinks by default, and
  `max_tokens` includes the thinking, so 1,024 is a ceiling on the whole
  answer rather than its intended length; low effort is what makes a reply
  arrive in the time a turn takes. 1,024 tokens is about 4,000 characters,
  which never approaches `MAX_CLIP_LENGTH` (8,000) — the reducer refuses
  rather than trims, so the server must never send it more. A reply that stops
  on `max_tokens` is cut back to its last full sentence.
- **What a press costs**: at the cap, about **a cent** — 90K input is $0.009
  and 1K output is $0.0005 — and a typical channel costs a tenth of that. So
  opening it to everybody needs no quota on day one, only the meter. Prompt
  caching would cut repeated presses in one channel further, since the
  *Record* is an append-only prefix until the cap starts trimming it. It is
  cheap to add later, and not worth adding before the meter says it matters.

### 3 and 4. The card and its button

- **Drawn after the members and invitations, before `InviteCard`**, as a card
  in `ParticipantCard`'s shape: the name *Claude*, a muted line under it
  (*Reads the Record and adds to it*), and on the right rail a `Button` with
  `styles.cardPing` — the ping's style, literally.
- **The label is *Respond* / *Responder*,** not *prompt* — settled by
  Rodrigo 2026-10-22. On a card named *Claude*, a bare verb is addressed to
  the card, as *Ping* is, so *Ask Claude* would say the name twice. *Respond*
  translates one to one into *Responder*, the infinitive a Spanish button
  wants; *prompt* has no Spanish verb that is not either *ask* or wrong.
  `t.respond()` and `t.responding()` in the catalogue.
- **No section label over it.** It is not a member, guest or invitation, and a
  fifth label for one card is heavier than the card. **No presence dot, no
  clock, no profile** — none of those is true of it.
- **Drawn only when the server says it can answer**: `ChannelView` gains an
  optional `claude?: true`, set when the client is `available()`. An old
  server and an unconfigured one both leave it absent, so the card never
  offers a press that 503s.
- **Enabled for anybody present**, the paste rule (`canPasteClip`), and
  greyed otherwise in the STYLE.md § *Words on controls* sense — the action
  exists, you are just not where it can be done. No `debug` gate.
- **GLOSSARY.md and STYLE.md in the same commit**: *Claude card* and
  *Respond* in Part One and Part Three and in the one-line list; the card in
  § *Cards and rows*.

### The indicator, which everybody sees

- **It is channel state, because it has to reach every screen**:
  `ChannelState.claude: { askedBy: UserId; since: number } | null`, set and
  cleared by two server-assembled actions, `CLAUDE_ASKED` and
  `CLAUDE_ANSWERED`. Their guards are in `core/` like every other, so the
  greyed button and the 409 are computed by the same code. A build that
  predates the field ignores it.
- **Drawn as the button itself**, disabled and reading *Responding…* /
  *Respondiendo…* on every screen — settled 2026-10-22 — with the muted line
  saying who asked (*Ana asked* / *Preguntó Ana*). No dot: the
  speaking dot's filled state means *audible now*, and Claude is not audible.
  No animation either: STYLE.md has none, and a busy label is what stands in
  for it.
- **It never outlives the request.** It is cleared on the answer, on the
  failure, after a 60-second timeout, and on restore after a restart, since a
  request in flight when the server stopped is gone. A stuck *Responding…*
  would be the "On another call" bug again.
- **One request in flight per channel** is the same state read from the other
  side. A second press while it is set is refused by the guard, and the server
  answers 409 *Claude is already responding.*

### 5. Into the Record

- **The server applies `PASTE_CLIP` on the presser's behalf, with
  `clip.authorId = CLAUDE_ID`**: `'claude'` in `core/constants.ts`, with no
  underscore, so no `newId` can mint it. The reducer guards the *acting* user
  (`canPasteClip(state, action.userId)`), who is present, and does not tie
  the author to the actor. Going through the reducer is what makes the reply
  arrive: `Pastes.follow` writes the row, the snapshot carries the new
  `clip.id`, and every open *Record* refetches on that key (`ChannelView.tsx`
  `keptKey`). The length cap stays the reducer's.
- **If the presser has left by the time the answer comes, it is applied as
  the next present member**; if nobody is present, it is written straight to
  `pastes` and appears in the *Record* on its next load. Losing a paid answer
  because one person stepped out would be wrong in a room where others are
  waiting for it.
- **`Pastes`' `nameOf` resolves `CLAUDE_ID` to *Claude***, so the frozen
  `display_name` is right, and every build since 2026-10-15 draws the reply
  under Claude's name with no change. Builds before that draw it as their
  *Clipboard*'s latest paste, author unresolved. That is acceptable, and needs
  no shim.
- **It is a paste, not live lines.** Lines are speech and belong to a text
  segment, so a reply made while nothing is being kept would have nowhere to
  go. A paste is an instant that breaks nothing, is never deleted and can be
  copied, which is what a reply wants. A *Record* drawing that sets it apart —
  a glyph, not a colour — is a follow-up, not this task.
- **Not spoken.** The reply is text in the *Record*. Text-to-speech into the
  room is a different feature, with the floor rules to answer to.

### Metering, in the reports that already exist

Rodrigo's call, also 2026-10-22: no new script and no new report — it goes
where spend is already counted. Transcription's spend is read by
`bin/usage transcripts` from tables of what the provider billed
(`transcripts`, `live_sessions`, the `transcript_usage` ledger), and Claude
follows that pattern.

- **`claude_usage`, one row per press**, written when the answer (or the
  failure) comes back: `at`, `channel_id`, `account_id`, `model`, the four
  token counts from `usage` (input, output, cache write, cache read),
  `stop_reason` and `outcome`. It holds **no text** — the reply is in
  `pastes` and the prompt is the *Record*, so a copy here would be a second
  store of conversation for no reason. Like `transcript_usage` it is a ledger
  and outlives what it priced. `forget(accountId)` nulls the account, as it
  does elsewhere.
- **`bin/usage transcripts` gains a column**: *Transcription spend, by month*
  becomes *Provider spend, by month*, with `claude_usd` beside
  `recordings_usd` and `live_usd`, priced from the token counts at the model's
  rate (Haiku 5.5's, with the over-100K rate where `input_tokens` passed it).
  *Who spent it* gains Claude's presses per account. The report's name and its
  `--list` line say *transcription and Claude*.
- **Nothing on the wire and nothing the app reads**, which is `usage.ts`'s
  rule: the meter is instrumentation, queried from outside.

This is also what calibrates the 3.5 characters a token and tells Pro's model
choice what it would cost.

### Compatibility and order

Additive throughout: a new route, an optional view field, an optional
`ChannelState` field, and a reserved author id. Old builds never see the card,
and a new build against an old server sees no `claude` flag and draws none.
So the order is the ordinary one, with no shim and no SHIMS.md entry: deploy
the server with the key unset, so `/privacy` stays silent; upload the build;
then set the key and `bin/env-push` once the build is in hand.

### Tests

- `core`: the two guards (only somebody present may ask; not while one is in
  flight), and that `CLAUDE_ANSWERED` clears whatever asked.
- `claude.test.ts`, against a fake client: the request (model from
  `modelFor`, `max_tokens`, effort, the system prompt's ingredients); trimming
  oldest-first, with the begins-here line; Claude's earlier replies labelled
  in the transcript; a `max_tokens` stop cut to a sentence; an API error and a
  timeout each surfacing as one sentence, writing nothing and clearing the
  indicator.
- Route tests: no key → no flag and 503; not present → 403; empty *Record* →
  409; in flight → 409; success → a paste row authored by `CLAUDE_ID`, named
  *Claude*, inside its room's segments; the presser leaving mid-request still
  produces the row; every press, failed or not, writes exactly one
  `claude_usage` row with its token counts and no text.
- App: the card is drawn only with the flag, its button has the ping's style,
  and *Responding…* with who asked is shown on a screen that did not press.

### Not in this task

- **Renaming the *People* tab — kept as *People* for now**, Rodrigo's call
  2026-10-22. It began as *Roster*, which did not translate, then *Members*,
  which excluded guests, then *People*, which now excludes Claude. If it
  moves again: *Room* and *Voice* are already glossary terms, so neither is
  available, and *Table* / *Mesa* collides with nothing and carries the
  glossary's own *seat*. The GLOSSARY entry for *Channel tabs* should say that
  *People* holds one card that is not a person, so the next reader does not
  take it for an oversight.
- **Other models for Pro accounts**, behind `modelFor`.
- **Prompt caching**, once the meter shows repeated presses.

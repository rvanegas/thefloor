# Integrate Claude into Conversation

1. Introduce client for Claude models. Use credentials from ~/src/mdc but save them to ~/.config/thefloor .
2. Compose a prompt from channel record of transcripts, together with the instruction to contribute to the conversation.
3. Add a card to People tab representing Claude.
4. On this case, add a button, with the same style as "ping" on other cards, with the label "prompt".
5. Pressing it sends prompt described in step 2 above, and response is introduced directly into the Record.

## Plan

Planned 2026-10-22. The five steps above are the ask; what follows is how each
lands on what is already here, and the questions it leaves for Rodrigo.

**The shape in one sentence:** a new route, `POST /channels/:id/claude`, reads
the room's text, asks Anthropic for a contribution, and applies the answer as a
**paste authored by Claude** — so it enters the *Record* the way every paste
does, and nothing on the wire changes except an optional flag and the route.

### 1. The client, and the credential

- **`server/src/claude.ts`**, a class in `transcription.ts`'s idiom: an
  injected `fetch` and `baseUrl`, `available()` true only when the key is set,
  plain `POST /v1/messages` rather than `@anthropic-ai/sdk`. The server has no
  provider SDK today; AssemblyAI is driven by `fetch`, and the test seam is the
  injected function.
- **Model from `ANTHROPIC_MODEL`**, defaulting to `claude-sonnet-5-5`. A reply
  somebody is waiting for in a live room wants latency more than depth; Opus
  is one setting away. `max_tokens` sized so the answer stays well under
  `MAX_CLIP_LENGTH` (8,000 characters), which the reducer refuses rather than
  trims — and the server trims at a paragraph boundary before it gets there.
- **The key is `ANTHROPIC_API_KEY` in `~/.config/thefloor/server.env`**, not a
  file of its own: that is where every server credential is authored, and
  `bin/env-push` carries it to the box. Copied from mdc's config by hand
  (mdc reads `anthropic_api_key` from its config file, or the environment). It
  is the same key, and that is a choice: separate keys are the CREDENTIALS.md
  principle, and a key of The Floor's own from console.anthropic.com is what
  that principle asks for. **Open question 1.**
- **Paperwork in the same commit**: the tenth entry in CREDENTIALS.md
  (spends per use like AssemblyAI; what a leak costs; rotation is free), a row
  in its index, `ANTHROPIC_API_KEY=` and `ANTHROPIC_MODEL=` in
  `server/.env.example` marked `# env-push: optional`.
- **`/privacy` names Anthropic when the key is set, and only then** — the
  AssemblyAI rule exactly (`privacy.ts`): what leaves (the room's text, names
  as spoken), that it is sent only when somebody presses *Prompt*, and and what
  Anthropic's commercial terms say of retention — read them on the day rather
  than from memory. Setting the key is therefore a public
  act, and is done on the day the feature can be pressed.

### 2. The prompt

- **What "the record of transcripts" is, concretely**: the *current room* —
  the open sitting — read in time order from its three sources: live lines
  (`live.linesBefore`), batch transcripts of its recordings
  (`transcripts.linesFor`, through `readableLines` so names are frozen ones),
  and its pastes (`pastes.within`). Claude's own earlier replies are pastes
  too, and go in as Claude's turns, so a second press continues rather than
  repeats. **Open question 2** is whether it should reach further back than the
  room.
- **Rendered as speaker-labelled prose** with wall-clock times, as the `txt`
  export is, one block per speaker turn — the form a person reads, which is
  also the form a model reads best.
- **Bounded from the newest end**: a character budget (start at ~200k, well
  inside the context window) that drops the oldest lines first and says so in
  the prompt.
- **The system prompt** says: you are Claude, a participant in a voice
  conversation in an app called The Floor; what follows is a transcript of it
  so far, made by speech recognition and so imperfect; contribute one turn
  to it, as a person in the room would — briefly, in the language being
  spoken, addressing people by name where it helps; plain text, no Markdown,
  because the Record draws plain lines. Kept in `claude.ts` as one constant,
  with a test that pins its ingredients rather than its wording.
- **Nothing to read, nothing sent**: a room with no text answers 409 with a
  sentence (*Nothing has been said in this room yet that Claude can read.*)
  rather than prompting on an empty transcript.

### 3 and 4. The card and its button

- **Drawn after the members and invitations, before `InviteCard`**, as a card
  in `ParticipantCard`'s shape: the name *Claude*, a muted line under it
  (*Reads the Record and adds to it*), and on the right rail a `Button` with
  `styles.cardPing` — the ping's style, literally — labelled `t.prompt()`,
  `t.prompting()` while in flight.
- **No section label over it.** It is not a member, guest or invitation, and
  putting it under *Members* would make that word wrong; a fifth label for one
  card is heavier than the card. **No presence dot, no clock, no profile** —
  none of those is true of it.
- **Drawn only when the server says it can answer**: `ChannelView` gains an
  optional `claude?: true`, set when the client is `available()` and this
  viewer may prompt. Absent is the old server and the unconfigured one alike,
  so the card never offers a press that 503s.
- **Enabled only while you are present**, the paste rule (`canPasteClip`),
  greyed otherwise in the STYLE.md § *Words on controls* sense — the action
  exists, you are just not where it can be done.
- **"prompt" was chosen in English only.** It translates poorly — *Preguntar*
  is "ask", *Indicar* is wrong — so **open question 3**: keep *Prompt*, or
  *Ask Claude*, which says the same in both languages. Either way the catalogue
  gets the Spanish in the same commit, and GLOSSARY.md gets *Claude card* and
  *Prompt* in Part One and Part Three, with the one-line list at the top.

### 5. Into the Record

- **The server applies `PASTE_CLIP` on the prompter's behalf with
  `clip.authorId = CLAUDE_ID`** (`'claude'` in `core/constants.ts` — no
  underscore, so no `newId` can mint it). The reducer guards the *acting* user
  (`canPasteClip(state, action.userId)`), who is present; it does not tie the
  author to the actor. Going through the reducer rather than writing the row
  directly is what makes it arrive: `Pastes.follow` writes it, the snapshot
  carries the new `clip.id`, and every open *Record* refetches on that key
  (`ChannelView.tsx` `keptKey`). The length cap stays the reducer's.
- **`Pastes`' `nameOf` resolves `CLAUDE_ID` to *Claude***, so the frozen
  `display_name` is right and every build since 2026-10-15 draws the reply
  under Claude's name with no change. Builds before that draw it as their
  *Clipboard*'s latest paste, author unresolved — acceptable, and needs no
  shim.
- **It is a paste, not live lines.** Lines are speech and belong to a text
  segment; a reply made while nothing is being kept would have nowhere to go.
  A paste is an instant that breaks nothing, is never deleted, and is copyable,
  which is what a reply wants. A *Record* drawing that distinguishes it — a
  glyph, not a colour (STYLE.md spends colours on meanings) — is a follow-up,
  not this task.
- **One prompt in flight per channel**, held in memory on the server; a second
  press while one is out gets 409 *Claude is already answering.* No new
  reducer state, so nobody else's card shows a spinner — **open question 4**.
- **Not spoken.** The reply is text in the Record. Text-to-speech into the
  room is a different feature, with the floor rules to answer to.

### Who may press, and what it costs

- **Members who are present**; guests do not see the card — a guest's screen is not this
  one, as `InviteCard`'s comment says. Recommended: **`debug` accounts only for the first build**, since it
  spends money per press and has no meter — **open question 5**.
- **Metered** through `UsageMeter` as a new kind (`claude`, input and output
  tokens, account and channel), so `bin/usage` can say what it costs before
  anybody decides whether it needs a cap.

### Compatibility and order

Additive throughout: a new route, an optional field, a reserved author id. Old
builds never see the card; a new build against an old server sees no `claude`
flag and draws none. So the order is the ordinary one with no shim — deploy
the server (with the key unset, so `/privacy` stays silent), upload the build,
set the key once the build is in hand, `bin/env-push`. No SHIMS.md entry.

### Tests

- `claude.test.ts`: the request body (model, system prompt ingredients,
  budget trimming oldest-first, earlier replies as Claude's turns) against a
  fake `fetch`; a non-200 and a timeout each surface as one sentence and write
  nothing.
- Route tests: absent key → no flag and 503; not present → 403; empty room →
  409; concurrent → 409; success → a paste row authored by `CLAUDE_ID`, named
  *Claude*, inside the room's segments.
- App: the card is drawn only with the flag, and its button has the ping's
  style.

### Open questions for Rodrigo

1. Reuse mdc's key, or issue one for The Floor? (Recommended: its own.)
2. The current room only, or the channel's whole Record up to the budget?
   (Recommended: the room.)
3. *Prompt* or *Ask Claude*? (Recommended: *Ask Claude*, for Spanish.)
4. Should everybody present see that Claude is answering? (Recommended: not
   yet — it needs reducer state.)
5. `debug` accounts only at first? (Recommended: yes.)

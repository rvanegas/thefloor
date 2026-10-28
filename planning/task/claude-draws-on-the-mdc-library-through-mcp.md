# Claude draws on the mdc library through MCP

Rodrigo's, 2026-10-27. When somebody presses Claude in a conversation
(`server/src/claude.ts`, `decision/2026-10-22-claude-joins-the-conversation-as-a-paste-in-the-record.md`),
Claude can consult Rodrigo's **mdc library**: his own writing on philosophy,
some six hundred chats and documents, indexed by term, summarized, and kept on
the `commons` box. A reply could then say *you argued this in March* and
mean it. This is the first step of the integration between The Floor and mdc
that mdc's `SERVER.md` (Phases 5 and after) is heading towards.

## What mdc offers

mdc serves an **MCP server** at `https://mdc.rvanegas.co/mcp` (streamable
HTTP, live since 2026-10-27), the reading tools `mdc reply` gives the model:

- `guide` — how the library is organized and the rules for the rest; the
  other descriptions tell the model to read it first.
- `list_documents(query?)`, `lookup_term(term)` — find documents by title,
  summary or index term, with summaries and related terms.
- `read_document(path)`, `read_file(name)` — read one in full.

**It writes nothing**, since mdc `43be338` (deployed 2026-10-27): `edit_file` went back to `mdc reply` alone, and
`append_turn` was withdrawn — claude.ai edits with its own documents, and a
conversation reaches the library whole through its export and `mdc import`.

**Its guide asks for a citation convention The Floor does not use**: a reply
ends with `## Related` (library titles, as `| *Title*`) and `## References`
(other works, as `| Author (year) *Title*`), additions only. That suits a
`.chat.md`, where `mdc reply` and `mdc import` gather them into the chat's own
sections; a paste is plain lines. See *Decided* and steps 7 and 8.

It accepts a **bearer token** minted for an mdc user (mdc's
`scripts/add_token.py <user>`; only the hash is kept, in `users.toml` on the
box). A token reaches that user's libraries and nobody else's.

## How the call uses it: the MCP connector

The Messages API connects to a remote MCP server itself — **Anthropic's
servers call mdc**, run the tool loop inside the one request, and return the
final answer. Nothing in The Floor speaks MCP. Two request fields go
together, on the beta endpoint, with beta `mcp-client-2025-11-20`:

```ts
this.options.client.beta.messages.create(
  {
    ...body,
    betas: [MCP_BETA, ...(ask.fallback ? [FALLBACK_BETA] : [])],
    mcp_servers: [{
      type: 'url',
      url: 'https://mdc.rvanegas.co/mcp',
      name: 'mdc',
      authorization_token: process.env.MDC_TOKEN,
    }],
    tools: [{
      type: 'mcp_toolset',
      mcp_server_name: 'mdc',
      // An allowlist although mdc now writes nothing: see "Read, not write".
      default_config: { enabled: false },
      configs: {
        guide: { enabled: true },
        list_documents: { enabled: true },
        lookup_term: { enabled: true },
        read_document: { enabled: true },
        read_file: { enabled: true },
      },
    }],
    ...(ask.fallback ? { fallbacks: 'default' } : {}),
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  { signal }
);
```

`mcp_servers` without the matching `mcp_toolset` entry is a validation error.
The pinned SDK (0.99.0) predates these fields as it predates `fallbacks`, so
the cast `request()` already makes covers them; upgrading the SDK would type
them. Every grade goes through `beta.messages.create` once this is on,
including `standard`, which today takes the plain endpoint.

## What changes in `claude.ts`

- **The reply is still the text blocks**, but the response now also holds
  `mcp_tool_use` and `mcp_tool_result` blocks, and text Claude writes *between*
  tool calls ("Let me look that up"). `ask()` joins every `text` block
  (`claude.ts:422`); it should take only the text after the last tool result,
  or the paste opens with Claude's working.
- **Longer and costlier presses.** A press that looks things up makes several
  model turns inside one request: more latency (the `timer` in `ask()`), and
  tool results counted as input tokens. `recordUsage` reads `usage`, which
  covers them; `maxTokens` per grade may want raising, and the cost check
  against *free minutes* may want a library-press rate.
- **The system prompt** (`systemPrompt(length)`) says the library exists, is
  Rodrigo's own writing, and is to be consulted when the Record turns to
  something he has written about — not on every press. A reply that draws on
  a document names it.
- **When mdc is down** the request fails as a whole. A press should fall back
  to the same call without `mcp_servers` rather than fail, and say nothing of
  it.

## Whose library, while there is one token

mdc has one user today, and per-person authorization across mdc, The Floor
and claude.ai is a later plan (mdc's `TODO.md`). So:

- **One token, `MDC_TOKEN` in `server/.env`**, minted for `rodvandur` with the
  note "The Floor"; recorded in `planning/CREDENTIALS.md`, revoked by deleting
  its line in mdc's `users.toml`.
- **Offered only in a channel whose *Library* toggle is on** — off by default,
  turned on only by an account `MDC_IDENTIFIERS` names (his), and then for
  every press in that channel, whoever presses. Turning it on is his consent
  to his writing reaching that room's Record; see *Decided* below.

## Read, not write

mdc's server no longer offers a write, so nothing has to be switched off. **The
toolset is still an allowlist of the five**, because mdc's `SERVER.md` names
tools for later (`analyze`, `audit`, `new_session`), and a tool mdc adds
should reach a room only by a decision here, not by a deploy there. A write
from a room several people are in would be a consent question like publishing
(`decision/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`).

Keeping a conversation, or its digest
(`a-digest-of-each-call-and-of-the-channel.md`), in the library is still the
interesting later step — but by the route mdc chose for claude.ai: an export
of the whole, brought in by `mdc import`, after everybody in it has agreed,
not a write per turn.

## Decided

Rodrigo's answers, 2026-10-27:

- **A per-channel toggle, off by default.** Only when it is on does Claude
  consult the library, and then on **every** press in the channel, whoever
  presses. Neither *pressing* nor *present* — the channel is the unit.
- **Pro and Max only.** On *Standard* the toggle changes nothing; the plain
  call stays plain and fast.
- **Citation by title, in plain words**: *as you wrote in On Attention, in
  March*. No paths, no links — a paste is plain lines.
- **No Related or References section in a reply**, whatever mdc's guide asks.
  A library document is named inline, as above; a work outside the library is
  cited inline in plain words too — *as James put it in 1890*.
- **A document's own Related titles are his implicit recommendations.**
  Claude follows them with `read_document` only when needed, not as a matter
  of course, but weighs them as his judgement of what is relevant.

Not asked, and assumed: **only an account `MDC_IDENTIFIERS` names may flip
it**, since it is his library; anybody else sees it greyed with the sentence
that says why, as *Response model* is for anybody without `debug`. Change
that before step 3 if it is wrong.

## Plan

Planned 2026-10-27 against `769ffd7c`. **A wire change, done in the ordinary
order**: server deployed first, then a build. It is additive — a new optional
field and a new action, no rename — so an old client simply never draws the
toggle, an old server is never sent the action by a client that cannot see
it, and **there is no shim and no SHIMS.md entry**. Until `MDC_TOKEN` is on
the box the toggle is not drawn and nothing changes.

Each step's tests go beside the precedent's: `core/__tests__/claude.test.ts`
for the reducer, `server/__tests__/claude.test.ts` for the rest.

1. **Configuration.** `index.ts` reads `MDC_URL` (default
   `https://mdc.rvanegas.co/mcp`), `MDC_TOKEN` and `MDC_IDENTIFIERS`, and
   passes `library?: { url, token, identifiers }` through `AppOptions`.
   `MDC_IDENTIFIERS` is resolved through `accounts.byIdentifier` at every use,
   as `cohortHosts()` is (`channels.ts:2141`) — not once at boot — and kept
   separate from `COHORT_HOST_IDENTIFIERS`, which means something else and
   happens to name the same person today.
2. **The state, in core.** `ChannelState.library: boolean` (`types.ts`, beside
   `responseModel`), `false` in the initial state (`channel.ts:169`); reducer
   action `SET_LIBRARY { userId, library }` in `types.ts`, listed in
   `COMMUNITY_OWNER_ACTIONS` (`channel.ts:226`), reduced as
   `SET_RESPONSE_MODEL` is (no-op when unchanged). Read `?? false` everywhere,
   since restored rows predate it.
3. **The wire action and the guard.** `SET_LIBRARY { library: boolean }` in
   `protocol.ts` and in `CLIENT_ACTIONS` (`channels.ts:362`) **in the same
   commit** — `server/__tests__/client-actions.test.ts` fails a wire action
   the server does not list, so neither can arrive first, and until both do
   no client can send it. Beside the
   `SET_RESPONSE_MODEL` guard (`:2780`), refuse a non-boolean as `invalid`,
   and anybody whom `MDC_IDENTIFIERS` does not resolve to as `forbidden`, with
   the sentence the app shows. Also refuse it as `invalid` when the server has
   no `library` configured, so the state cannot claim what it cannot do.
   **Saving and restoring it was done in step 2**, beside `responseModel`: a
   channel's durable state is a JSON value, so there is no column and no
   migration, as this step first said there would be. Its test is here, since
   only now can the server set it: switched on, the channel still has it
   after a restart, as *the response model … survives a restart* does.
4. **The app.** A card in `ChannelSettingsView.tsx` after *Response model*,
   drawn only where the view says the server has a library (a
   `libraryAvailable` beside `claudeAvailable`, `app.ts:6350`, carried the way
   `view.claude` is). One switch; disabled for anybody but the library's owner
   with a *who* sentence; a note that it applies on Pro and Max. Words in
   `en.ts` and `es.ts` together, chosen for translation; the control's shape
   per STYLE.md, measured against 375pt; *Library* into GLOSSARY.md, list
   and entry. Whether the server tells the app *you* are the owner (a field
   on the account view) or the app just tries and shows the refusal is a
   small choice for this step — prefer the field, since STYLE.md greys a
   refusal a rule can name.
5. **Who gets it at a press.** `respond()` computes `library =
   !!options.library && channel.library && grade !== 'standard'`, and passes
   it to `request()`. Tests: toggle off → no `mcp_servers` on any grade;
   toggle on → Standard without, Pro and Max with, **whoever presses**.
6. **The request.** `request(…, library)` takes the beta endpoint when
   `ask.fallback || library` (today identical, since Pro and Max are the
   fallback grades, but say both). Betas `MCP_BETA` and/or `FALLBACK_BETA`;
   `mcp_servers` and the `mcp_toolset` as above. Export `MCP_BETA` and the
   enabled tool names beside `FALLBACK_BETA`, so a test can pin the allowlist
   to exactly the five reading tools. **Confirm the field names and
   beta id against the current MCP connector docs before writing this** — the
   shape here is from memory, and the beta has renamed things once
   (`tool_configuration` → `mcp_toolset`).
7. **The prompt.** `systemPrompt(length, library)` adds one paragraph only
   when on, so the existing test stands: the library is Rodrigo's own writing
   (named — the presser may be somebody else now); consult it when the
   conversation turns to something he has written about, not on every press;
   read `guide` first; name any document drawn on by its title, in plain
   words; the word limit covers the reply only. **It overrides the guide's
   citation convention in so many words** — the model reads `guide` after
   the system prompt and would otherwise follow it: no `## Related` or
   `## References` section, every citation inline in plain words, a work
   outside the library by author and year. And a document's Related titles
   are his implicit recommendations, to follow when the question needs more
   than the document gives.
8. **The reply text.** `replyText(content)`, pure and exported: the `text`
   blocks after the last `mcp_tool_result` (or `mcp_tool_use`, if a result is
   missing), all of them when there was no tool call. Test with a scripted
   array — working, use, result, answer — that only the answer is posted.
   **Then drop a trailing `## Related` or `## References` section** — from
   its heading to the end — in case the model followed the guide anyway:
   the paste is plain lines and the heading would arrive as literal `##`.
   Test that an answer ending in both is posted without them, and that
   inline citations are untouched.
9. **mdc down.** A library request that throws without the abort firing is
   retried once without `mcp_servers`/toolset, inside the same timer, with a
   warning naming mdc; a timeout is not retried. An `mcp_tool_result` with
   `is_error` needs nothing. Check against the live API which of the two an
   unreachable mdc produces, and whether the connector can end on
   `pause_turn` as server tools do — `respond()` would post the text before it.
10. **Time.** `CLAUDE_LIBRARY_TIMEOUT_MS = 120_000` for a library request; the
    card says *Responding…* throughout. `maxTokens` untouched until library
    rows show `max_tokens`.
11. **The ledger.** `claude_usage.library_calls INTEGER` — null when not
    offered, else the count of `mcp_tool_use` blocks — with the table's
    comment extended. `usage.input_tokens` already counts tool results.
12. **Privacy.** `/privacy` says of a press *"Nothing else is sent."* In a
    channel with the toggle on, search terms drawn from the Record go to a
    server the operator runs, and the reply may quote the operator's writing.
    One sentence, present only where `library` is configured, and a bump of
    `CLAUDE_PRIVACY_UPDATED`. **Rodrigo's wording to approve**, deployed
    before the token is set.
13. **Paperwork, same commits.** `MDC_TOKEN` in `planning/CREDENTIALS.md` (its
    row in § *What to read, and when*, and an entry: minted by
    `scripts/add_token.py`, revoked by deleting its line in `users.toml`);
    GLOSSARY.md and STYLE.md per step 4; this file becomes a dated decision
    when it ships.

### Then, by hand

Mint the token on `commons`
(`scripts/add_token.py rodvandur`, note "The Floor"), `bin/env-push`, deploy
the server; upload a build with the toggle.
On Pro, three presses in a channel whose Record touches the library and three
in one that does not, both toggled on; read `library_calls`, latency and input
tokens off the ledger.

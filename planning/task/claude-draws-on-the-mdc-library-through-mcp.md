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
HTTP, live since 2026-10-27), the tools `mdc reply` gives the model:

- `guide` — how the library is organized and the rules for the rest; the
  other descriptions tell the model to read it first.
- `list_documents(query?)`, `lookup_term(term)` — find documents by title,
  summary or index term, with summaries and related terms.
- `read_document(path)`, `read_file(name)` — read one in full.
- `edit_file(name, old_str, new_str)` — edit a `.document.md` or
  `.argument.md`, keeping numbered versions.
- `append_turn(name, speaker, text)` — add a turn to a `.chat.md`.

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
      // Reading only: see "Read, not write" below.
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
- **Offered only when Rodrigo's account presses** (by sign-in address, as
  `COHORT_HOST_IDENTIFIERS` names accounts), so nobody else's press reads his
  library. Whether it should also apply when he is merely *present* is open:
  the reply lands in a Record everybody in the room reads.

## Read, not write

`edit_file` and `append_turn` are left off. A conversation is not where
Rodrigo's documents get edited, and a write from a room several people are
in is a consent question like publishing
(`decision/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`).
`append_turn` is the interesting one later: it could keep a conversation, or
its digest (`a-digest-of-each-call-and-of-the-channel.md`), as a `.chat.md` in
the library — after everybody in it has agreed.

## Open questions

- Present, or pressing (above)?
- Which grades get the library: all three, or `pro` and `max` only?
- A per-channel switch, so a channel that has nothing to do with his writing
  never pays for lookups?
- Does a reply cite the library visibly, and how, in a paste?

## Plan

Planned 2026-10-27 against `claude.ts` as it stood at `769ffd7c`.
**Server-only**: nothing on the wire changes, so no shim and no build. It
reaches people with a deploy and the token in `server/.env`, and Ask Claude
works exactly as before until the token is set, the way it is absent without
`ANTHROPIC_API_KEY`.

### The open questions, answered as recommendations

- **Pressing, not present.** Pressing means the reply is Rodrigo's own act, so
  showing his writing to the room is his choice. Present would put his library
  into a reply somebody else asked for. Easy to widen later; hard to take back
  once a paste has quoted him.
- **All three grades.** The setting is debug-only, so this already means
  whatever Rodrigo picked. Haiku's tool use is the thing to watch on the first
  real presses, not a reason to forbid it ahead of time.
- **No per-channel switch yet.** The system prompt tells Claude not to look
  things up on every press. The ledger column below shows whether that holds;
  add a switch if it doesn't.
- **Cite by name, in plain text.** The paste is plain lines with no Markdown,
  so: *"as you wrote in On Attention, March"*, with the document's title as the
  library gives it. No paths and no links.

### Steps, in order, each with its tests in `server/__tests__/claude.test.ts`

1. **Configuration.** `index.ts` reads `MDC_URL` (default
   `https://mdc.rvanegas.co/mcp`) and `MDC_TOKEN`, then passes
   `library?: { url, token, identifiers }` through `AppOptions` to
   `ClaudeResponderOptions`. `identifiers` is a new `MDC_IDENTIFIERS`, matched
   the way `cohortHosts()` (`channels.ts:2141`) matches: resolved through
   `accounts.byIdentifier` on every press, not once at boot. Use a separate
   variable rather than reusing `COHORT_HOST_IDENTIFIERS`, because the two
   lists mean different things and only happen to name the same person today.
   Test: no token means the request carries no `mcp_servers`, whoever presses.
2. **Who gets it.** `respond()` decides `library = !!options.library &&
   identifiers resolve to userId`, and passes it to `request()`. Test: the same
   channel and grade, pressed by Rodrigo and by somebody else, yields one body
   with the toolset and one without.
3. **The request.** `request(ask, record, length, signal, library)` takes the
   beta endpoint when `ask.fallback || library`. The betas list is
   `MCP_BETA` and/or `FALLBACK_BETA`, and the body gets `mcp_servers` and
   `mcp_toolset` as above. Export `MCP_BETA = 'mcp-client-2025-11-20'` and the
   enabled tool names as constants beside `FALLBACK_BETA`, so a test can assert
   that `edit_file` and `append_turn` stay disabled. Before writing this,
   **confirm the field names against the current MCP connector docs**: the
   shape in this file was written from memory of the beta, and the beta has
   renamed things once already (`tool_configuration` → `mcp_toolset`).
4. **The prompt.** `systemPrompt(length, library: boolean)` adds one paragraph
   only when `library` is true, so the plain prompt and its existing test stay
   the same. The paragraph says: the library is the presser's own writing; use
   it when the conversation turns to something he has written about, not
   otherwise; read `guide` first; name any document drawn on by its title. The
   reply's word limit includes nothing of the working.
5. **The reply text.** Take the `text` blocks after the last `mcp_tool_result`
   (or after the last `mcp_tool_use` if a result is missing), and all of them
   when there was no tool call. This is a pure function, `replyText(content)`,
   exported for a test with a scripted content array: working text, then
   tool_use, then tool_result, then the answer. Only the answer is posted.
6. **mdc down.** If a library request throws and the abort did not fire, retry
   once with the same body minus `mcp_servers`/toolset, inside the same timer,
   and log a warning naming mdc. Don't retry on a timeout: the budget is
   already spent. Two cases the tests script with the fake client: an API error
   (the connector couldn't reach the server), and a response whose
   `mcp_tool_result` has `is_error`. The second needs nothing, since the model
   just answers without it. Check against the live API which of the two an
   unreachable mdc actually produces.
7. **Time.** `CLAUDE_TIMEOUT_MS` is 60 s for one model turn. A library press is
   several, so give it `CLAUDE_LIBRARY_TIMEOUT_MS = 120_000`. The card already
   says *Responding…* for as long as it takes. Leave `maxTokens` alone until
   `stop_reason = 'max_tokens'` shows up on library rows. Also check whether
   the connector can end on `pause_turn`, as server tools do, because
   `respond()` would currently post whatever text came before it.
8. **The ledger.** Add `library_calls INTEGER` to `claude_usage` (null when the
   library was not offered, else the count of `mcp_tool_use` blocks), using the
   usual `ALTER TABLE … ADD COLUMN` migration and with the comment above the
   table extended. This is what answers the per-channel-switch question and
   what `bin/usage` can price. `usage.input_tokens` already includes tool
   results, so token counting needs no change.
9. **Privacy.** `/privacy` says of a press that *"Nothing else is sent."* While
   the library is on, Claude sends search terms drawn from the Record to a
   server the operator runs, and the reply may quote the operator's own
   writing. Add one sentence, present only when `library` is configured (as
   the Claude section is present only with a client), and bump
   `CLAUDE_PRIVACY_UPDATED`. **This is Rodrigo's wording to approve**, and it
   goes in before the token is set on the box.
10. **Paperwork in the same commit.** Add `MDC_TOKEN` to
    `planning/CREDENTIALS.md` (its row in § *What to read, and when*, and an
    entry with how it's minted and revoked), add *library* to GLOSSARY.md if
    the word reaches a user (it does, through the privacy sentence), and turn
    this file into a dated decision when the work ships.

### Then, by hand

Mint the token on `commons` (`scripts/add_token.py rodvandur`, note "The
Floor"), add it with `bin/env-push`, and deploy. Make three presses on a
channel whose Record touches something in the library and three on one that
doesn't, then read `library_calls`, latency and input tokens off the ledger
before deciding anything about grades or a switch.

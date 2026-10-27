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

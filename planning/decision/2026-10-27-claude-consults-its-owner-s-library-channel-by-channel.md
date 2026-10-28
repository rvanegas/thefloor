# Claude consults its owner's library, channel by channel

*Ask Claude* (`2026-10-22-claude-joins-the-conversation-as-a-paste-in-the-record.md`)
can now consult Rodrigo's **mdc library** — his own writing, some six hundred
chats and documents, indexed by term on the `commons` box — so a reply can say
*as you wrote in On Attention* and mean it. The first step of the integration
mdc's `SERVER.md` (Phase 5 and after) heads towards. What remains to ship it is
`task/claude-draws-on-the-mdc-library-through-mcp.md`.

**Nothing in The Floor speaks MCP.** The Messages API's MCP connector (beta
`mcp-client-2025-11-20`) is handed mdc's URL and a bearer token, and
Anthropic's servers call mdc and run the lookups inside the one request. The
box sends mdc nothing itself. `server/src/claude.ts` is the whole of it:
`libraryFor`, `libraryRequest`, `libraryRule`, `replyText`, and `consult` /
`resumed` around `request`.

## What Rodrigo decided

- **A per-channel *Library* switch, off by default** (`ChannelState.library`,
  `SET_LIBRARY`). When on, **every** press in the channel consults it, whoever
  presses. Neither *when he presses* nor *when he is present*, the two first
  proposed: the channel is the unit, and turning it on is his consent to his
  writing reaching that room's Record.
- **Pro and Max only.** On *Standard* the switch changes nothing; the plain
  call stays plain and fast.
- **Citation by title, in plain words**, and works outside the library by
  author and year, inline. **No Related or References section** in a reply,
  though mdc's guide asks for both: a paste is plain lines.
- **A document's Related titles are his implicit recommendations**, followed
  only when the question needs more than the document gives.
- **One library, selected by mdc's own default.** The token is `rodvandur`'s
  and that user has one library, `philosophy`; mdc uses a caller's only
  library when none is named. Naming it (`MDC_LIBRARY`, passed on every call)
  was proposed and deferred until a second library exists — the day there is
  one, every library press fails with *name a library*.

## What was chosen inside that

- **Only the library's owner may flip the switch** — accounts
  `MDC_IDENTIFIERS` names, resolved by address at every use as
  `cohortHosts` are. Assumed rather than asked; refused by name to anybody
  else, `debug` included, and greyed in the app with the sentence that says
  so. On top of the channel's own guard, so in a community the owner of the
  library must also hold the controls.
- **An allowlist of five reading tools**, although mdc's server writes
  nothing since its `43be338` (which withdrew `edit_file` and `append_turn`,
  on Rodrigo's word: claude.ai edits with its own documents and imports
  later). mdc plans more tools; one it adds reaches a room by a decision
  here, not by a deploy there.
- **The prompt overrides mdc's guide in so many words**, since the model
  reads `guide` after the system prompt. And `replyText` drops a trailing
  Related or References section anyway, in case it does not hold.
- **Only the text after the last lookup is posted** — the working between
  `mcp_tool_use` and `mcp_tool_result` blocks never is.
- **mdc down is not a failed press**: a library request that throws before
  the timer fires is asked again without it, silently in the reply, with a
  warning naming mdc in the log. A timeout is not retried.
- **`pause_turn` is resumed** by sending the paused content back, at most
  twice, with usage summed for the ledger — the connector's loop stops after
  ten rounds of lookups.
- **Two minutes rather than one** for a library press
  (`CLAUDE_LIBRARY_TIMEOUT_MS`), being several model turns in one request.
- **`claude_usage.library_calls`**: null for a press that did not consult it,
  else how many lookups. `bin/usage transcripts` reads it; it is what the
  per-channel switch's value is judged on.
- **`/privacy` says so** where the server has a library and Claude: the
  search terms, drawn from the Record, go to a server the people who run The
  Floor keep, and the reply may quote that writing. Nothing claimed about
  what mdc keeps of a search, as nothing is about Anthropic.
- **`MDC_TOKEN` is the eleventh credential** (`CREDENTIALS.md`). It travels
  to Anthropic in every library request, which is how the connector works.

## Found on the way

- **Saved channel state is one JSON value**, so the switch needed no column
  and no migration, where the plan expected both.
- **A wire action cannot arrive before the server lists it**:
  `server/__tests__/client-actions.test.ts` fails any `protocol.ts` action
  missing from `CLIENT_ACTIONS`, so the action and the owner's guard landed
  in one commit, and until then no client could send it.
- **mdc's own carry-over rule was broken through MCP**: `append_turn`
  stranded a reply's Related and References mid-chat and left it unparseable.
  Fixed in mdc (`c90a459`, import gathers them at the end) and then made moot
  (`43be338`, the tool withdrawn). The Floor never offered it.
- **The Spanish owner is *el dueño***, short and masculine, on Rodrigo's word
  that day — which also replaced the community's *quien es responsable*
  everywhere and became a written rule beside the generic masculine
  (GLOSSARY.md).

## Not verified

The live API could not be reached from where this was built. The connector's
field names and beta were checked against the API reference, but **which form
an unreachable mdc takes** — a failed request, or a 200 with errored lookups —
was not; both are handled. The task file says to look on the box.

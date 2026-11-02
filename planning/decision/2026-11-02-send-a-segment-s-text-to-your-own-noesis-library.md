# Send a segment's text to your own noesis library

Rodrigo, 2026-11-02: *"there ought to be a one button function to export a
transcript and upload it to one's noesis account."* Share on a segment of the
*Record* tab now has a third answer, **Send to noesis**, beside *Audio* and
*Text*. It files the segment's text in one of your libraries as a
conversation, and asks which only if you have several.

## The rule it reverses

GLOSSARY.md said a library was *never the app's own recordings or
transcripts — nothing in a channel is written into it*. That was written for
libraries specific to a channel, a direction Rodrigo has since rejected, so
the rule went rather than being narrowed. What stays is
`2026-10-27-claude-consults-its-owner-s-library-channel-by-channel.md`'s
allowlist: *Ask Claude* has reading tools only. Here a person files their own
copy, and Claude still writes nothing.

## Other people's voices

A segment holds everybody's lines and the library is one person's. Rodrigo's
answer: that is noesis's to interpret, in the prompts it reads a `.chat.md`
with. The owner's words are their thoughts and the rest is context. noesis
knows the owner's voice by the names it keeps (`/me/names`), so before
sending, **the sender's display name here is added to those names** where it
is missing, case aside. Best effort: a failure there is logged and the text is
still sent. Whether noesis's chat prompts actually draw that line was not
checked from here.

## Permission to write is noesis's, and The Floor is a special case

The grant that *Floor Settings* connects is what Anthropic's servers use
through MCP, and it reads. Writing is **a scope noesis's operator grants this
client alone**, `import` (noesis `7e3b2f1`, `scripts/client_imports.py`).
claude.ai registers itself, so what a client says of itself at registration
is not consulted, and a self-registered client that asks for the scope is
issued a token without it. A token carrying it reaches `POST …/import` and
`PUT /me/names` and nothing else of noesis's file and run API. noesis's
sign-in page names the scope when asked for it.

- **The Floor asks for `import` at every connecting** and keeps the scopes
  noesis grants (`noesis_connections.scopes`, which a refresh keeps). A
  connection from before has none: `/me/noesis` says `canSend: false`, the
  card says why and offers *Connect again*, and Share offers no third answer.
- **The text is the app's**, the same `segmentText` that Share hands over,
  sent to `POST /me/noesis/send` with Share's filename. That way the two
  never disagree and the server needs no second formatter. noesis's importer
  already reads The Floor's shared text as a `.chat.md`, one section per
  speaker. It is sent with `replace=true`, so sending a segment again after
  it grew replaces what was filed (noesis knows a chat by its turns).

## Order of deployment

**noesis first, then mark the client, then The Floor.** The MCP SDK refuses
an `/authorize` whose scope the client was not registered with, so a Floor
asking for `import` before `client_imports.py thefloor` has run breaks
connecting for everybody. Marking keeps the client's secret, which
`add_client.py` would rotate, and rotating it disconnects every Floor
account.

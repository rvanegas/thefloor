# noesis is Pro's, and Send to noesis goes

Rodrigo, 2026-11-10: having *Send to noesis* beside *Open in noesis* on a
segment's menu is confusing, and *"noesis should be available only to Pro."*
Two changes, the second waiting on noesis.

## Everything of noesis's is Pro's

Today a free account can connect a library on *Floor Settings*, switch it on
for a channel, and send a segment's text to it; only the *channel library*
waits on a Pro member. After this, every noesis surface is drawn for a
**Pro** account alone: the *noesis library* card on *Floor Settings*, both
noesis cards on *Channel Settings*, and every noesis row in a segment's menu.
The server refuses the same, so a greyed control and a refused action cannot
disagree.

To settle while building:

- **What a non-Pro sees on the Floor Settings card.** A line saying noesis
  comes with Pro, with the way to it, rather than no card at all, so the
  feature can be found. Pro is bought only on an iPhone, so on the web this is
  a line about something that cannot be done there; say so in it.
- **A connection whose Pro lapses.** Recommended: keep the row in
  `noesis_connections` and offer nothing of noesis's until Pro returns, so
  renewing does not mean connecting again; its libraries stop being consulted
  in channels, as a library switched off. The alternative, disconnecting, is
  simpler and costs a reconnect.
- **Free accounts connected today.** Under the rule above they keep their
  connection and lose the surfaces. Say who they are (a query) before
  deploying, so it is a known number of people.

## Send to noesis goes, after noesis can copy

*Open in noesis* reaches the copy the channel library already filed, and
noesis's own *copy a document into another of your libraries* (noesis,
`planning/task/copy-a-document-into-another-of-your-libraries.md`) is how a
member keeps one of their own. **That ships first**; until it does, Send is
the only way into a person's own library and stays.

Then Send goes completely, per the no-compatibility-code rule: the menu row
and its library chooser, `api.sendToNoesis`, `POST /me/noesis/send`, the
`PUT /me/names` call in `noesis.ts`, `canSend` and the *Connect again* path on
the card, and the `noesis:import` request at connecting, with
`noesis_connections.scopes` if nothing else reads it. The channel library is
unaffected: it files with The Floor's own `noesis:keep` token
(`channelLibraries.ts`), not the member's. What it leaves behind: connections
that already hold `import` keep a grant nobody uses, harmless; documents
already sent stay in their libraries. No data migration. noesis can then
withdraw `import` from The Floor's client (`scripts/client_imports.py`).

**It is wire-visible**: builds that offer Send call the endpoint, so it goes in
two steps (`CLIENTS.md`) unless the floor is already past every build that
shows it, with a SHIMS.md entry for the first.

## Words to change with it

GLOSSARY.md's *Send to noesis* (retired), *Share*, *Library* and *Channel
library*, in the same commit as the code, the one-line list included; and a
dated decision reversing
`2026-11-02-send-a-segment-s-text-to-your-own-noesis-library.md`.

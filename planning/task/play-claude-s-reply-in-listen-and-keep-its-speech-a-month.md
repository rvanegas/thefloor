# Play Claude's reply in Listen, and keep its speech a month

Rodrigo, 2026-11-18, on the call with Rochelle (chat
`2026-11-18-claude-audio-feature-development-and-costs`). A *Pro* reply's
speech is already saved, and *Read again* says it into the room once more;
**asked: put it in *Listen*, to be heard by one person, and keep it about a
month** — "maybe seven days is enough; I'd figure a month" — since storage is
cheap (every recording so far costs about four cents a month) and a reply
scrolled back further can be synthesised again.

**This reverses a decision, and the cost of that is the work.**
`SPEECH_KEPT_MS` is an hour by Rodrigo's word of 2026-11-13, the life of *Read
again*, "short enough that this is never a store of what Claude said"; the
store is emptied on every restart for the same reason, is never put in S3, and
`/privacy` says an hour. A month means S3 or a disk that survives deploys, a
sweep, a new sentence on `/privacy`, and deciding whether the speech is kept
with the paste and deleted with it.

Open:

- **Kept, or made again on demand.** Regenerating costs the synthesis each
  time; keeping costs almost nothing, which is Rodrigo's argument for a month.
- **What is played**: the stem a running recording kept is a separate copy
  that belongs to the recording; this is the reply's own audio.
- One of the three things *Listen* would play — see
  `read-a-library-document-aloud-into-listen.md`.

Read GLOSSARY *Read aloud* and *Read again*, `server/src/speech.ts`, and
`decision/2026-10-28-claudes-reply-is-read-aloud-on-arrival.md` first.

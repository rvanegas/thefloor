# Every manual deletion has a month's grace

Decided at the prompt, 2026-11-18, reviewing
`one-delete-for-a-segment-with-what-goes-checked.md`: **anything a member
deletes by hand is marked, gone from every list at once, and swept a month
later** — one window, so the app and the privacy policy say one thing.

Today the windows differ. A recording's audio is removed "a week from now"
(the confirmation, `deleteBody`), and so is a deleted channel and its library
(`a-channel-has-its-own-noesis-library.md` § *Deleting*). Deleted live text
waits a month (`TRANSCRIPT_DELETED_RETENTION_MS`), but a filed document goes
the moment its text does (`forgetDocuments`). Start by listing every manual
deletion and its constant — `server/src/privacy.ts` and `channels.ts`'s
sweeps — and move each to the month.

**The privacy policy's *Deleting things* says a week**, so its words change in
the same commit, and so does every confirmation that names the window, in
both languages. Recovery stays by hand: the month is what that needs, not a
feature.

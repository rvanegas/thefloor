# The invite page is English only and the app is not

`2026-09-24-the-language-is-a-setting.md` made the app's language an account
setting with a Spanish catalogue, and every word the app says is a function —
`2026-09-23-every-word-the-app-says-is-a-function.md`. None of that reaches
`server/src/invite.ts`, which is a string in English.

So an invitation sent to a Spanish speaker is an English page, and it is the
page that has most to explain: planning/MARKETING.md argues it is the top of
the funnel, since somebody opening one has been asked by name.

**The reason it is not a tidy-up is that the page has no account to read a
setting from.** The reader is not signed in — that is the whole premise — so
the only honest input is `Accept-Language`, which is a design question rather
than a lookup: whether to trust it, whether to offer a switch, and whether the
same answer should govern `landing.ts`, `privacy.ts`, `support.ts` and the
guest page, which have the same problem and a wider audience.

Noticed 2026-09-25 while cutting the page to one call to action, which made it
shorter to translate than it has ever been.

**Smaller since 2026-10-12.** The invite page is a hand-over into the web app
now — two words, *Opening The Floor…*, and a *Continue* link — and the words
an invitee actually reads are the share message, which is in the sender's
catalogue. What is still English is that hand-over and the page a box with no
web app draws. The sender's language is not necessarily the reader's, which is
the same question in a new place.

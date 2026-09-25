# A refusal is the one thing in the app that cannot be Spanish

`inviteRefusalText` in `server/src/invite.ts` returns an English sentence, and
the app displays it verbatim: `AppProvider`'s redeeming effect puts
`ApiError.message` straight into `lastError`. Every other word the app says is
a function in a catalogue with a Spanish twin —
`2026-09-23-every-word-the-app-says-is-a-function.md` — so this is the one
user-visible sentence that the language setting cannot reach.

It is shared deliberately, and that is not the bug: the same refusal reaches a
person by two roads, a browser reading the page and an app that redeemed a pin
a moment after signing in, and two spellings of *already used* would be two
things to keep true. The bug is which end holds the words.

**The fix is for the server to send the code and the app to hold the words** —
`InviteRefusal` is already exactly that enum, `used | expired | self | unknown
| locked`, so the route would return it beside the message and the app would
prefer the catalogue and fall back to the sentence. That fallback is what keeps
it additive: an older app reads `error` as it does now.

Four sentences, two catalogues, and a shim entry for the `error` string once
the floor has passed the builds that need it. Noticed 2026-09-25, while giving
each refusal its own `aside`.

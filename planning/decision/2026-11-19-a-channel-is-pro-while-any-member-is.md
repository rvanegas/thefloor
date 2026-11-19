# A channel is Pro while any member is

2026-11-19, at Rodrigo's word: "one is either a Pro (or unlimited) user or
not. If so, then all settings are set to 'Pro' benefitting all users in the
channel. If not, they're all standard. Remove the 'Max' option for model
altogether." Then, in the same session: "Leave only an indication in Floor
Settings, whether user is 'basic', 'pro', or 'unlimited'", and "For Read
Aloud, user selects voice according to present status."

## What changed

**A channel's three grades are no longer chosen.** *Transcription model*
(from 2026-11-08), *Response model* (from 2026-10-22) and *Read aloud* (from
2026-11-13) were each a card on *Channel Settings* that only a *Pro* account
could change, and a choice outlived its chooser's Pro. Now a channel is a
*Pro channel* — Universal-3.5 Pro, Sonnet, AssemblyAI's voices — while any
member is *Pro (the subscription)* or marked unlimited, and *Standard*
otherwise. `isProChannel` in `server/src/channels.ts` is the rule, asked at
each use rather than stored.

**Max is gone**: Opus at medium, `2026-10-22-max-is-opus-at-medium.md`. A
library press keeps the ceiling it borrowed from it, 8192, as
`CONSULTING_MAX_TOKENS`. Ledger rows with `grade = 'max'` stay, and
`bin/usage` still prices them.

**The only word of a grade the app says is the reader's own *Plan***, on
*Floor Settings*, where the *Pro* card was: *Basic*, *Pro* or *Unlimited*.
Unlimited is `ProView.pro` with no `until`, so no wire change was needed. The
*· Pro* / *· Max* after *Ask Claude* went too: "only" in the ask was taken to
cover it.

**Which voice card *Read aloud* draws is the reader's plan**: the *Pro voice*
for Pro and Unlimited, the *Standard voice* for Basic, one card and never
both. "Present status" was read as the reader's plan now, not *present* in
the glossary's sense.

## Members, not whoever is present

"All users in the channel" was read as its members, the *channel library*'s
precedent (`participants.some(isPro)`), rather than whoever is in the room:

- a grade that moved as somebody stepped in or out would change mid-sitting,
  and a transcript or a reply asked for a moment apart would differ for no
  reason anybody could see;
- membership is a thing a Pro account does on purpose and can undo, which is
  what paying for other people's grade ought to rest on;
- a guest's Pro reaches no channel they are only seated in.

The cost: a Pro account pays, in AssemblyAI and Anthropic usage, for every
channel it belongs to, including ones it never visits. If that proves
expensive, *present* is the narrower reading and a one-line change in
`isProChannel`.

## What the simplicity cost

`WORKING.md`'s rule decided the shape: the three fields left `ChannelState`
completely and the three actions left `core/`, with no aliases. **Installed
builds up to 439 are the exception, as CLIENTS.md says**, and get a shim
gated at 440 (planning/SHIMS.md): the three actions answered as done and
ignored, and the three fields sent again on the snapshot, derived. **Stored
channel rows keep the three fields, unread**, so no migration: a channel
somebody had set to *Pro* without a Pro member is now *Standard*, and one set
to *Standard* with a Pro member is now *Pro*. That is the rule working, not
data lost.

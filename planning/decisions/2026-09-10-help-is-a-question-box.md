# 2026-09-10 — Help is a question box, not a support system

There is a **Help** screen, reached from a button at the foot of Home. You
write a question, it is stored against your account, a person reads it with
`bin/help` and writes an answer into the same row, and the answer appears under
your question the next time you open the screen.

That is the whole mechanism: one table, two routes, one shell script. What
follows is what was deliberately *not* built, which is the half that will look
like an oversight.

## What it is not

**Not a chat.** One question, one answer, no reply to the reply. A thread needs
somebody at the other end of it within an hour or it is worse than nothing, and
there is one person at the other end of this. Anything that needs a
conversation belongs in email, and the support page says so.

**Not notified.** Answering changes a row and reaches no phone. Pushing on an
answer needs a notification level people can turn off before it is anything but
a way to be woken by a support reply, and the answer being there when somebody
next looks is enough for something this rare. The cost is real and is written
down where it bites: `bin/help` says that the only way somebody learns you
replied is by coming back, so sitting on a question for a fortnight loses them.

**Not a queue with a status.** No ticket number, no *open* / *pending* /
*closed*, no promise about when. Every version of the screen that said "we
usually reply within a day" would be a promise made by a screen on behalf of
somebody who has not been asked, and the first week it was wrong would cost
more than the reassurance ever bought. The screen says the true thing instead:
asked *n* hours ago, not answered yet.

**Not Markdown.** The answer renders as plain text. Nothing else in this app
takes prose from an operator and renders it, and a link-rendering path that
exists for one writer is a surface with no second reader to justify it.

## Where the button is, which is one tier off what was asked

The request was a Help button at the bottom of the **Channels** list. It is at
the bottom of the scroll that the Channels list renders into — `HomeView` —
rather than inside `ChannelsView`.

`ChannelsView` is the list of channels and nothing else. Everything that was
not a channel left it on 2026-09-01, *Chip in* included, and the argument then
was that none of it was ever about channels. A button about the application put
back into that component would undo that for the second time. On screen the
difference is that Help also appears under the contacts list, which is right: a
question is not about either list.

It is **its own section, above Support and not in it.** That label means
*support this project* — money — and this means *get support*. One section
holding both senses of the word is how somebody taps *Chip in* looking for an
answer. GLOSSARY.md § *Help* carries the split, because the two words point in
opposite directions throughout this codebase: `/help` is questions,
`/donations` is money, `/support` is the public page App Store Connect requires
a URL for.

It is also the **only unconditional row down there.** The donate link depends
on a region, the standings and the audio bench on columns set by hand. A way to
ask a question that only some accounts have is not a help mechanism.

## The limit is on the backlog, not the rate

An account may have five questions unanswered at once (`MAX_OUTSTANDING`).
Answered ones do not count, so it never becomes a lifetime cap — somebody who
has asked and been answered forty times is exactly who this should keep taking
questions from.

A rate limit answers *how fast*, which is not the problem: one person can wait
a minute between each of two hundred questions and the reading is still
hopeless. The refusal is a 400 rather than a 429 for the same reason — 429
invites a client to retry after a delay, and no delay makes this succeed. What
makes it succeed is somebody answering.

`canAsk` and the sentence explaining it are computed **on the server** and
printed verbatim by the app, on the same principle as the donate link: a policy
compiled into the binary is one that needs an App Store submission to loosen.

## Answering has no route

`Help.answer` exists and nothing over HTTP calls it. A route would need an
authorisation model, a screen, and a way to revoke it, all for a job that is a
line of SQL done by one person; `bin/help` goes at the database through
`bin/db --write`, the way every other operational script here does.

The cost is that `answer` and `answered_at` are the only pair of columns in
this database written by hand, so they can come apart. `Help.forAccount`
therefore refuses to believe a timestamp with no answer beside it, rather than
rendering a screen that claims it was answered at four o'clock and shows
nothing.

## It is also the source the support page should be rewritten from

`/support` is a list of questions somebody guessed at in advance. This is the
list of questions people actually asked. `bin/help --all` is the report, and it
is worth reading when nothing is outstanding: a question that arrives three
times is a paragraph that page is missing.

## Deletion

Questions go with the account, unlike a donation, which is unlinked and kept.
The contrast is the argument: a donation is money that changed hands with a
counterparty holding the same record, so unlinking keeps two ends agreeing. A
question is a sentence somebody wrote about themselves, usually about their own
account; nothing refers to it, and an answer written to a tombstone is not
something anybody wants to send. The privacy page carries the claim.

## Wire order

Additive — two new routes and a new table. An old client never calls them and a
new client against an old server would 404, which is the ordinary order: deploy
first, then ship the build. No shim, so no SHIMS.md entry.

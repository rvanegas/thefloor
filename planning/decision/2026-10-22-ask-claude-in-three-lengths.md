# Ask Claude in three lengths

Built 2026-10-22, the same day as
`2026-10-22-claude-joins-the-conversation-as-a-paste-in-the-record.md`, whose
one *Respond* button this replaces. Rodrigo's ask: replace *Claude
<Respond>* with *Ask Claude <Brief> <Medium> <Extended>*, three buttons that
do what *Respond* did and differ only in the cap — 30, 90 and 270 words.

## The length is chosen at the press, not set on the channel

**`{ length }` in the body of `POST /channels/:id/claude`**, a `ReplyLength`,
and nothing in `ChannelState`. Unlike *Response model* it is a choice about
one reply rather than a property of the channel, so there is nothing to
show anybody else and nothing to persist. `ChannelState.claude` does not
carry it either, so a screen that did not press cannot say which length is
coming; nobody asked for that, and it would have been a reducer change for a
label. A length there is no button for is a 400 before anybody is asked.

## The cap is still an instruction, stated twice

Unchanged from the decision above except that the number and the shape come
from the button: `REPLY_WORD_LIMITS` pairs each cap with a sentence count —
one or two, two to four, a paragraph or two — since a word count alone gives
a model nothing to aim at. **Nothing trims**, still. Standard's `max_tokens`
went from 1024 to 2048, because 270 words is about 360 tokens before low
effort's thinking, and only generated tokens are billed. `claude_usage`
records no length: it is a ledger of what was paid, and the output tokens
already say how long each reply was.

## *Medium* when no length is sent

Builds 386 and 387 send no body. *Medium*, 90, is the nearest of the three
to the 100 words those builds were built against, so their one button keeps
meaning what it meant. A shim, gate 388, in SHIMS.md.

## *Ask Claude*, because the buttons became adjectives

With one button, *Respond* was the verb beside the name. With three, the
buttons name lengths of a reply, so the verb moved to the words before them:
*Ask Claude*, *Preguntar a Claude*, and *Breve*, *Media*, *Extensa*, feminine
for *respuesta*. Busy, the words read *Responding…* and the three grey.

## It fits 375 points, measured, with less padding

Measured at 15pt with the system font, the three buttons at the ping's 8 a
side left *Ask Claude · Pro* 5.5 points spare and the Spanish row 4.5. At 6 a
side both have about 17. *· Pro* is dropped while busy, where *Responding… ·
Pro* would not fit; Spanish on a *Pro* channel still does not, and wraps its
words rather than its buttons. STYLE.md has the numbers. **Not yet seen
rendered** — the next build's screenshot is the check.

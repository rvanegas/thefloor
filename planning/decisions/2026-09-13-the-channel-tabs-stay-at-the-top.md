# The channel tabs stay at the top, and the choice is gone

2026-09-13, a day after the setting that moved them shipped.

`tabsAtFoot` is removed everywhere: the card on *Floor Settings*, the account
setting, the wire field, the `tabs_at_foot` column, and the coin toss that
decided which side an account that had never said came down on. A channel
screen draws its six tabs pinned in the header, which is where they were
before any of this and is what an untouched account got.

See 2026-09-12-where-the-channel-tabs-go.md for what this undoes; that entry
stands as written, and the argument for pinning the tabs *somewhere* rather
than leaving them in the scroll survives it intact.

## What a second home costs

Position is the whole of how somebody finds a tab they have used before —
which is the reason the setting was careful never to reorder them or drop one.
The same argument goes one step further than the setting did: a set of
controls that is at the top on one phone and above the footer on another is a
set with two places to look for it, in a screenshot, in a support answer, and
in the glossary entry that has to describe both. Nothing else in the
application asks that question, and the tabs were not important enough to be
the first thing that did.

The toss made it worse rather than better. It is a good instrument for
learning which arrangement people prefer, and the cost of running it is that
everybody's channel screen is drawn by a preference nobody chose, including
everybody who never opens *Floor Settings* — which is most people. An
experiment whose control group has to be told it is in one, on the card, is
one the application is paying for twice.

## What the removal costs, which is nearly nothing

The tabs move back to the top for the accounts the toss put them at the foot,
and for the handful who chose the foot deliberately. That is one screen
redrawing once, with the same six tabs in the same order.

**No shim, in either direction, and this is the removal case rather than the
addition case.** The wire field goes out of the hello, the settings event and
the answer to `POST /me/settings` the moment the server restarts. Builds 193
and earlier read it as absent, which their own `DEFAULT_ACCOUNT_SETTINGS`
turns into false — the top — so an installed app lands exactly where this
decision wants it. The card on those builds goes on working the way a card
with nothing behind it works: it marks whichever side the phone has cached,
and the server ignores what it sends. `POST /me/settings` is partial and
refuses only fields it knows to be malformed, so the press is a 200 that
changes nothing rather than an error on a screen where nothing went wrong.
That is written down at the endpoint, since the absence of a validation block
is not self-explaining.

**The column is dropped rather than left in place**, on the reasoning the
`bio` migration used on 2026-08-31: what is in it is a coin toss and, for the
few accounts that answered, a preference nothing can read back. A column no
code mentions is a question every later reader of the table has to ask.

**One key is left behind on the phone**, `thefloor.tabsAtFoot`, written by
builds that had the setting. `DEAD_TABS_AT_FOOT_KEY` in `AppProvider.tsx`
exists only so sign-out and *forget this phone* still clear it; nothing reads
it.

## And `DEFAULT_ACCOUNT_SETTINGS` has no exception again

The rule adopted on 2026-09-07 — every boolean there is false for somebody who
has never said anything, everywhere — held for five days, was broken for one,
and holds again. That it was broken by the one setting whose default was
deliberately unknowable is the argument for the rule rather than against it:
the exception had to be marked at the column, the read, the client's cache,
the card and the glossary, which is five places to keep in step for a
preference about where a tab bar sits.

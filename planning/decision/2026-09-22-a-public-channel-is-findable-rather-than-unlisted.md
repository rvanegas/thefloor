# 2026-09-22 — A public channel is findable rather than unlisted

`/podcasts` lists every channel that has declared itself public: its name, its
notepad, its cover art, and how many recordings are listenable on it. It is
linked from the landing page's footer, from the colophon of every public
channel's page, and from `/privacy`. `server/src/directory-page.ts` renders it;
`publicChannels()` in app.ts is the one grouped query behind it.

**The page is the small half. The decision is that it exists at all.**

## What it changed, which was a promise

Publication shipped the day before with the audience deliberately narrow: a
public channel had a page at an unguessable address, handed to people the way
a guest link is. The app said so in those words — *the page shows the
channel's name and description to anyone **with the address*** — and
`/privacy` said "anybody holding the address". Unlisted, in the sense YouTube
means it.

A list of every public channel is a different product. The address stops being
the gate; a stranger who has never met anybody here can read the names and
descriptions of every channel that ever turned the switch on, including the
ones that turned it on while the app was promising otherwise.

**So this was put to the prompt rather than decided in the code.** Three ways
were offered: a second opt-in switch (`listed_at` beside `public_at`, off for
everyone, findability as its own act the way agreeing to publish is); every
public channel; or only channels already set up for a podcast directory, on
the theory that filling in cover art and a category is itself an opt-in. The
answer was **every public channel**.

That is the wider reading, and it is defensible — one switch is one thing to
understand, and "public" meaning *unlisted* is the sense of the word that
surprises people, not this one. What it is not is free, so:

**The copy was corrected in the same commit.** The confirmation before the
switch now says the channel "is listed publicly where it can be found by
people you have never met"; the line under it says the listing happens as soon
as the switch is on, which is the part that is not true of the recordings.
`/privacy` names the directory and links it. The landing page's "there is no
directory" became "no directory **of people**", which is what that sentence
was always about and is now load-bearing.

**Anything that widens this audience again owes the same correction**, and the
module comment in directory-page.ts says so where somebody would be standing.

## Every public channel, including the empty ones

A channel with nothing published is listed, and its row says *Nothing
published yet* where the others carry a count and a date.

This is deliberately the opposite of the rule an episode obeys. A published
recording whose transcode has not landed is hidden from the page and the feed,
because a player that does not work is indistinguishable from a broken site.
An empty channel is not that: it is a true statement about a channel that
exists, the ordinary state on the day somebody turns the switch on, and hiding
it would mean a member turning their page on and not finding it — which reads
as a failure rather than as patience.

Ordering follows from the same thought: most recent conversation first, empty
channels last by when they went public, since the one that just turned the
switch on is the one most likely to be about to have something on it.
`ORDER BY latest DESC NULLS LAST` is what puts nulls after dates rather than
before them; node:sqlite's SQLite is new enough for `NULLS LAST`, which was
checked rather than assumed.

## What was not built

**No search, no pagination, no ranking.** There are single-digit public
channels. A page that lists them all in one query is right until it is not,
and the thing that will say so is `bin/usage` — INFRASTRUCTURE.md already
carries episode traffic as the load on this box that nobody controls, and this
page is the same class of visitor arriving one document earlier.

**No opt-out short of going private.** Being listed is not separable from
being public, which is the whole content of the answer above. If that is ever
revisited, `listed_at` beside `public_at` is the shape it was offered in.

**Still nothing submitted to Apple or Spotify.** That remains what it was in
yesterday's entry — a person pressing a button on two websites — and
GLOSSARY.md now keeps *directory page* and *podcast directory* as two terms
precisely because this page is easy to mistake for having done it.

## One query, not a loop

`publicChannels()` is a single grouped `LEFT JOIN` rather than `publicChannel`
called per row. That function reads a channel's whole recording list and asks
`transcripts.linesFor` about every one of them; doing that per channel on an
unauthenticated page anybody can hit is a page whose cost grows with the
product. The join is `LEFT` and its predicates sit in the `ON` rather than the
`WHERE` — in `WHERE` they would filter out the empty channels that the section
above exists to keep.

## Tests

`server/__tests__/publication.test.ts` § *the directory at /podcasts*. What is
asserted is the boundary in both directions, because the failure mode here is
a privacy failure rather than a broken page: a private channel is absent, a
channel that goes private leaves at once, a withdrawn recording empties the
count, no member is named in the rendered HTML with the real display names in
the database, and what members typed is escaped — this page interpolates a
name and a notepad into HTML a stranger's browser parses, which is the
property html.ts's `escapeHtml` comment was rewritten for yesterday.

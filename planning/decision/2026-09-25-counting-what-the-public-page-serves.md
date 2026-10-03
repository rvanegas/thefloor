# Counting what the public page serves, and saying so on the page that promises not to, 2026-09-25

The ask was analytics for the podcast players. There were two candidates for
what that meant and they are not near each other. The app's *Podcasts* tab is
not a player at all — `PodcastsView.tsx` is a frame around the server's own
`/podcasts` document, with no transport in it. The player is one line of
`public-page.ts`: a bare `<audio controls preload="none">` per episode, on a
page served to anybody with the address.

So the thing to instrument was the public page, and the first thing that turned
up was that it had already been decided not to instrument it. That file's header
says it **carries no script**, with a reason — the episodes are served from this
box, and a page that autoloaded five of them would start five ranged reads of a
megabyte each on every visit, beside live audio, on two vCPUs.

## What was decided

**The count is taken on the server, at the route that serves the audio, and the
page is not touched.** `GET /c/:id/e/:file` already wrote a row per fetch into
`usage_bytes` for cost; it now also adds one to `episode_listens` when the read
looks like somebody starting an episode. No script, no beacon, no third party,
and the page is still the document it was.

That was not the only way. A `<script>` on the page would have given play,
pause and completion — how far into an episode people get, which is the figure
a podcaster actually wants and which nothing here can now produce. It was
turned down on three grounds, in order: it contradicts a stated decision about
that file; it would be the first script on a page whose whole claim is that it
is a document; and it collects from people who have no account here and were
never asked anything, which is a heavier thing to do than to count a request
the server was already serving.

## The part that took the thinking: what a start is

The route sees ranged reads, and one person hearing one episode is a dozen
requests — a probe of `bytes=0-1` to learn whether ranges are honoured, a
suffix read for the moov atom, then chunks forward. Every industry answer to
this de-duplicates on an address and a user agent within a window. **Both are
on the request and both were dropped at the door**, which is what made the rest
of it hard: with no identity there is nothing to tell a second request from a
second listener except what the request asks for.

`startsAnEpisode` is the whole rule. A file is begun once per play and seeked
afterwards, so a read from the first byte is the signal; a read from anywhere
else is somebody already listening. The probe is excluded by size, because it
arrives immediately before the real first chunk and counting it would double
every listen from the players that send one rather than add a stray one.

**What survives is a count of starts, and the word is chosen to stop it being
read as an audience.** A replay is two. A podcast app that downloads an episode
nobody ever hears is one. Two people playing once each look exactly like one
person playing twice, and nothing here can tell those apart or ever will
without collecting the thing that was deliberately not collected. The bound is
stated in the schema, in `bin/usage listens`' own heading where somebody
reading the figure meets it, and in GLOSSARY.md under *Episode start* — three
places, because the failure mode is somebody quoting it as listeners.

## The table keeps nav_counts' rules and not the meter's

`episode_listens` is one row per episode per day, incremented: channel,
recording, day, count. Not swept, not touched by `forget`, and holding no
identity — the same three departures `nav_counts` made on 2026-09-18, for the
same reason. There is nobody in these rows to have a thirty-day history or a
right to be forgotten.

One departure of its own: **no foreign key to `recordings` and no cascade**,
unlike `transcripts`. Those cascade because they hold what was said and must
die with the recording. There is nothing of the sort here, and a count that
vanished with its episode would leave every earlier total quietly wrong while
protecting nobody.

**And the app's own listening stays out of it.** That is a `listen` span
against an account, which is a cost question about a member. Folding the two
together would put an identity beside a stranger's listening in one table,
which is the shape this was built to avoid.

## The page had to change, again, and the scope is the new sentence

`no analytics` was outlived by the usage meter and rewritten then; *the only
measurement here that is attached to nobody* was outlived by this and is
rewritten now — there are two such measurements, and the paragraph says so.

What is new in kind is that **/privacy now states where the counting stops**,
because this is the first thing measured about somebody who has no account:
*This applies only to the published pages and feeds.* Listening inside the
application is not counted this way, nothing about an episode is joined to an
account, and nothing about a member's listening is added to an episode's tally.
`privacy.test.ts` asserts the scope sentence and not merely the existence of
the tally, so an edit that quietly widened this to in-app listening fails a
test rather than falsifying a published promise. `PRIVACY_UPDATED` moved to 25
September 2026, the substance having changed.

## What is not built

No endpoint, no field on the wire, no screen — the meter's standing rule, that
a figure the application can see is a figure the application will eventually
decide something with. `bin/usage listens` reads it from outside, like the rest.
Nothing is shown to a publisher yet; that is a feature and would need its own
argument about what a number of starts may be presented as.

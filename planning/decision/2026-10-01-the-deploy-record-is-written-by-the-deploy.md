# The deploy record is written by the deploy

`deploy-history.md` was kept by hand, on one sentence in AGENTS.md — *add an
entry there when you deploy* — and nothing in `bin/` ever read or wrote it.
That held while sessions ran the deploys. On 2026-09-13 `bin/deploy-all`
arrived and deploying moved to the prompt, and the record stopped the next day:
its last three entries are one session's, on 2026-09-14, and builds 206 to 325
went out after it with nothing written. It had always been partial — about
forty entries against something like a hundred and eighty builds — and that
day the fraction reached zero. **A rule addressed to whoever deploys lasts as
long as the same kind of whoever keeps deploying.**

So `bin/deploy` appends the line itself, and `bin/restart-services` does the
same for the media plane, the other thing done to the box by hand. Every
outcome once the box has been touched is written, not only success, since a
deploy that left the box unhealthy is the line most worth finding later.

**Not a tracked file, which was the alternative considered first.** An append
from `bin/deploy` leaves the tree dirty, and `bin/upload-ios` — the next stage
of `bin/deploy-all` — refuses a dirty tree, as does the next `bin/deploy`.
The way round that is the script committing on whatever branch is checked out,
in a checkout several sessions commit to. And the mechanical half — when, from
what to what, by whom, how it ended — is a fact about the box rather than the
source. So it lives on the box, in `~/thefloor-data/deploys.log` beside the
database, outside the tree `--delete` replaces; `bin/deploys` reads it. A file
under `~/.local/state` on this Mac was the other place considered, and would
see only deploys made from this Mac.

**What it gives up is the *why*.** The hand-kept entries said what a deploy was
for; a line says only that it happened. A deploy that needs explaining gets an
ordinary dated decision here, like any other. The hand-kept file is frozen in
`archive/` with the gap stated at its top, and is not backfilled — the
deploys in it are reconstructible from `build/<n>` tags, but what each was for
is not.

**The record dies with the box unless carried**, like the database: a re-host
(MIGRATION.md) has to copy `deploys.log` along with `thefloor.db`.

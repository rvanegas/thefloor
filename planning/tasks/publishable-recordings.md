# Publishable Recordings

**Built, 2026-09-21.** A channel may declare itself public and has a page at
thefloor.rvanegas.co/c/&lt;id&gt; where anyone with the address can listen to
recordings every participant has agreed to publish, plus a feed a podcast app
can subscribe to. Name and description show on the page; members remain
private, though they may be explicitly described in the description. Cover art,
language, explicit and category are in channel settings, so the feed is
submittable to a directory.

How and why is
`decisions/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`,
which also carries what `PODCAST.md` argued before it was deleted.

**Read that before touching any of this.** The consent model is the half that
is not obvious from the code — unanimity, one-sided withdrawal, a guest asked
at the microphone rather than at the door — and each part of it was chosen
against a plausible alternative that looks simpler.

What is left is not code.

**Submission.** Somebody pressing a button on Apple's website and on Spotify's,
each with its own review, for one channel that wants to be findable. Nothing in
the repository does it. What it needs first is a channel that is actually
published, with cover art and a category set, and a feed URL to paste — all of
which now exist. `bin/health` is not the check; a feed validator is.

**Where the bytes come from, when there is enough traffic to care.** Episodes
are served off this box, ranged, which keeps the accounting honest and the
enclosure URL ours. It is a change of URL rather than a change of design: a
separate published-audio bucket is the version to reach for, not a public path
on the existing one. INFRASTRUCTURE.md § *What the box can carry* says what to
watch — the `episode-fetch` kind in `bin/usage` — and the decision entry says
why that direction.

**Subcategories**, if anybody wants one. Apple's list is nineteen top-level
categories plus about ninety refinements, and a subcategory is a second
attribute on the same element. A top-level category alone is valid, listed and
findable, so this is a refinement rather than a gap.

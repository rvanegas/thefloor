# Publishable Recordings

**Mostly built, 2026-09-21.** A channel may declare itself public and has a
page at thefloor.rvanegas.co/c/&lt;id&gt; where anyone with the address can
listen to recordings every participant has agreed to publish, plus a feed a
podcast client can subscribe to. Name and description show on the page;
members remain private, though they may be explicitly described in the
description. How and why is
`decisions/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`,
which also carries what `PODCAST.md` argued before it was deleted.

**Read that before touching any of this.** The consent model is the half that
is not obvious from the code — unanimity, one-sided withdrawal, and a guest
being a refusal rather than a gap — and each of the three was chosen against a
plausible alternative.

What is left is the rest of that document's fork: **(b), a podcast anybody can
find**, as against the unlisted feed you paste into an app.

**Settings would include image.** The one clause that is still one clause
covering an upload endpoint, validation of dimensions and format, a bucket key
and a public serve route. Apple requires channel artwork — 1400×1400 to
3000×3000, square, JPEG or PNG, RGB — and a feed without it is not listed and
renders as a blank tile in any client showing a grid. There is still no image
anywhere in the schema: no avatars, no channel image, no upload path, and
nothing in `RecordingStore` that stores anything but audio. It is the largest
piece of new code left and the least interesting, which is exactly why it was
not allowed to gate the rest.

**The two declarations have everything but a control.** `channels.language`
and `channels.explicit` exist, `POST /channels/:id/declarations` writes them,
and the feed reads them — falling back to `en` and `false`. Neither is
derivable and both are required for a listed feed, so they belong in channel
settings beside the image, as the same screenful of work.

**Then `itunes:category`, `itunes:author`, and pressing a button on somebody
else's website.** Submission to Apple and to Spotify, each with its own review.

Two questions the built half deliberately left open:

**A guest link that says so up front.** A guest who spoke while signed in is
asked like anybody else, and one who only listened blocks nothing. What is
still unpublishable is a conversation somebody spoke in as a guest *without* an
account: there is nobody to ask, and the alternatives — dropping their audio,
or asking the members on their behalf — are each worse. The only honest fix is
a guest link that carries the possibility before somebody uses it, which is a
design rather than a guard, and which has a real tension to resolve: a notice
at the door is a standing blanket consent given before the conversation
existed, and everything good about the model here comes from consent being per
recording and withdrawable.

**Where the bytes come from, when there is enough traffic to care.** Episodes
are served off this box, ranged, which keeps the accounting honest and the
enclosure URL ours. It is a change of URL rather than a change of design: a
separate published-audio bucket is the version to reach for, not a public path
on the existing one. The decision entry says what to watch.

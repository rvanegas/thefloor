# An upright film keeps the phone upright

Reported from a phone: a Short's full screen was a tall picture that turning
the phone did nothing for. The rule this adopts is the report's own: **when the
film is upright, full screen is upright, and which way the phone is held does
not matter.**

The exception to the *portrait lock* exists because the film is better for the
turn. A Short isn't: turned sideways, a tall picture is fitted into a wide
window and comes out smaller than it was upright. So for an upright film the
phone stays locked on the card and in full screen alike. The *Full screen*
button is the only way in and *Exit full screen* the only way out, as for a
phone lying flat. `ChannelView` leaves such a film out of what it reports to
`Picture` as the lock's exception and ignores a sideways window while one is
on. `Picture` keeps the lock even while its own `fullScreen` is set.

## How a film is known to be upright, and what was refused

**By its link: `youtube.com/shorts/<id>` is upright, and anything else is
not.** `isUprightFilm` in `core/watch.ts`. A Short's own *Share* hands out
that form, so the link carries the shape whenever it came from where Shorts
come from.

**oEmbed knows, and was measured and left alone.** Asked with
`/shorts/<id>`, `youtube.com/oembed` returns 113×200 for a Short and 200×113
for an ordinary video, however the link was pasted. Asked with `watch?v=`, it
returns 200×113 for both. But calling it would be the first request this
project ever made to Google, which
2026-09-20-the-film-says-what-it-is-called.md refuses for a title and which
holds for a shape too.

**The player was the third route and could not be checked.** The title comes
from `getVideoData()`, and the documented IFrame API reports no dimensions.
Whether `getVideoData` carries any went unverified: no browser was available
to inspect one. If it does, the shape could be learned the way the title is,
in `WATCH_READY`. This rule would then apply to a Short pasted as `watch?v=`
and to an upright video that is not a Short. Both of those play today as every
film did before this.

## What it leaves as it was

**The card's picture is still 16:9**, so a Short is pillarboxed there. That is
the watch shape's business, not the lock's, and the report did not ask for it.

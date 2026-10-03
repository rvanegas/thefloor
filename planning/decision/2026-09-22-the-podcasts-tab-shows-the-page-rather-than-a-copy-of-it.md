# 2026-09-22 — The Podcasts tab shows the page rather than a copy of it

Home grew a fourth tab, *Podcasts*, between the two lists and *Support*. What
is inside it is `/podcasts` — the directory page from earlier the same day —
in a frame: a `WebView` on a phone, an `<iframe>` in a browser.
`app/src/ui/PodcastsView.tsx` and its `.web.tsx` sibling are the whole of it.

## Why a frame and not a list

Three shapes were offered at the prompt. A **native list** off a new JSON
route beside the page, which would look like the rest of the app. A **frame**
around the existing page. A **card with a button** that opens the browser.
The answer was the frame.

What it buys is that there is one implementation. The directory is a document
the server already serves to strangers, and it changes on a deploy — a row's
wording, a count, the rule about an empty channel. A native list would be a
second rendering of the same rows, frozen in whatever build a phone happens to
be running, and the two would drift: the app and the web would come to
disagree about what is public, which is the one thing on this page that has to
be true at once. A channel that goes private leaves both lists in the same
instant because there is only one list.

What it costs is that the tab does not look like the rest of the app. It is
the site's typography inside the app's chrome, and that is visible. It was
accepted with that said.

The **card with a button** was refused for the reason a tab whose whole body
is one control usually is: it spends a permanent quarter of the switch on
something that is not a place.

## A frame has no back button, so two pages stay and the rest leave

`staysInside` in `PodcastsView.tsx` keeps `/podcasts` and `/c/<id>` and hands
everything else to `Linking`. **This is narrower than *this server stays*, and
that is the decision.** The landing page is same-origin and is linked from the
colophon of both pages; somebody who tapped it would be looking at the
marketing site inside a tab with no way back but the tab strip. The two pages
that stay are the two that link to each other.

**The web half cannot do this and does not pretend to.** An iframe's
navigation is its own, so the colophon does strand a web reader in the frame.
Policing it would mean watching the same-origin frame's location on every load
and resetting it, which is a lot of apparatus for one link; the `.web.tsx`
file says so where somebody would go looking.

## What came with it, and what it cost the switch

**All four tabs gained icons.** Home's strip carried none while it was two
tabs and then three — two halves of one question need no picture — and a strip
where one tab wore a glyph and three did not would read as one tab singled
out. `ContactsIcon` (`lucide/book-user`), `ChannelsIcon`
(`lucide/messages-square`), `PodcastsIcon` (`lucide/podcast`) and `SupportIcon`
(`lucide/life-buoy`), vendored the way every other glyph here is. None of them
may be `lucide/users`: `PeopleIcon` spends that on the channel's roster, and
Contacts and People are different lists.

**Four tabs is two rows on a phone**, which is new. `MIN_SEGMENT` is 90 points
and the switch measures about 353 inside Home's padding on a 393-point phone,
so four segments come out at 88 and `segmentRowsFor` splits them two and two.
A wider phone and every iPad pane keep one row. The number was left alone: it
is the tolerance the channel screen's six tabs were tuned against, and moving
it to buy Home a row would change that screen for a reason that has nothing to
do with it.

**`List` gained a fourth member** and so did the address table: `/podcasts` is
now a frame of the web app, under `BASE` — `/app/podcasts` — which is not the
server's page of the same name at the root. They cannot collide, and
`webRoute.test.ts` pins it because they look like one address.

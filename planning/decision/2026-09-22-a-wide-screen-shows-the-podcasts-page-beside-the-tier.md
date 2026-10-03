# A wide screen shows the Podcasts page beside the tier — 2026-09-22

Above the breakpoint the directory page is the right-hand pane, and Home's
body is empty while that tab is selected. Below it nothing changes: the tier
draws the page as a body, the way it has since the tab shipped this morning.

This is a placement, not a reversal. *The Podcasts tab shows the page rather
than a copy of it* stands untouched — the document is still the server's own,
still in a frame, still the only implementation of that list. What is settled
here is only which half of a split window it goes in.

## Why the sidebar was the wrong half

The tier's other three bodies are columns of rows, and `LIST_WIDTH` is chosen
for exactly that: a list of channel names does not get better for being wider,
so every point above the breakpoint goes to the pane on the right. A document
is the other kind of thing. `/podcasts` is a page with covers on it, laid out
by the server for a browser window, and putting it in the 340pt column meant
the narrowest surface in the application was showing the one thing that wanted
room — beside a pane saying *Pick a conversation on the left*, which on that
tab there was nothing on the left to pick.

## What it is not

**It is not a `Detail`.** Nothing opened it. The four tabs are what the tier
*is*, and a value whose whole job is to say what somebody opened has no
business holding one of them; the page goes in the fallback beside `listPane`
in `App.tsx`, which is the slot that already answers *what is in the pane when
nothing is open*. Two things follow for free. Settings or Help opened over the
Podcasts tab covers the page and closing returns to it, with no state to keep
in step — and `webRoute.ts` needs no change at all, `/podcasts` already being
the frame half of the address and `named: 'none'` already being right.

The one thing a handler does own is the tap that arrives with a conversation
already open beside the tier. Lighting a tab whose page has nowhere to appear
would be the fault this whole entry is about, so in a split — and only in a
split — choosing Podcasts empties the pane. Every other tab still leaves what
is open alone, which is the behaviour they have always had and which is right
for them: a column swapping beside a conversation is not a navigation.

## The empty tier

While that tab is selected the left column is a header with nothing under it:
the title and Settings, the room you are in if there is one, and the switch.
That is not a hole. Those three are the tier's own and belong to none of its
bodies, and the thing the body would have held is on the screen, larger, a
hairline away. `HomeView` is told by `podcastsBeside`, which is `split` and
nothing else — the same shape as `onOpenProfile`, which is absent off a split
for the same reason.

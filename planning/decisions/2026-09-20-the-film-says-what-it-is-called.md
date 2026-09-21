# The film says what it is called

The watch card draws the video's title under the progress bar, on the card and
on a *second device*. `WatchParty` has a `title`, learnt from the first player
that can say, exactly as its `durationMs` is.

**The constraint that kept it off is intact.** When the URL came off the card
on 2026-09-18, nothing replaced it because a name had nowhere to come from:
fetching one would have been the first request this project ever made to
Google, for a string that decorates a card. That entry weighed exactly two
options, the link or nothing, and both are still refused.

**The third was in front of us.** A device showing the film is running
YouTube's own player, and that player holds the name of the video it loaded —
`getVideoData().title`. Reading it is not a request for a description of a
video; it is an object describing itself to the page it is already embedded in.
So the name travels the way the length does: `WATCH_READY`, which a player
sends once per party, now carries both, and the channel keeps the first answer
for each.

Both facts in **one** report is the part worth being deliberate about. It is
what makes them the same video's: whatever the first reporter was showing, the
party holds its length and its name together rather than one of each from two.

## What it costs, which is the cost already being paid

**An advert can name a party.** `getVideoData` describes a pre-roll while a
pre-roll is running, in precisely the way `getDuration` already does — see
`showingTheFilm`, which exists because of it. This adds no new exposure: the
same first report decides both, so a party misled about its name is one that
was already misled about its length, and a wrong name is the more visible and
less harmful half of that. Nothing here guesses around it with a timer, which
is what the retired `Intent` spent four days failing to do.

**`getVideoData` is not in YouTube's documented surface.** It has been on the
IFrame player for years and is not in the reference, so it is declared optional
on the web player's interface, read through `?.` and a try/catch on both
platforms, and an embed without it reports no name. A party with no title draws
what every party drew before this, which is the honest fallback and needed no
building.

## Where it is drawn, and where it is not

**Under the progress bar**, which is a departure from the *Listen* tab, where a
track's title is a `heading` above one. That card has nothing else on it, so
the title is its subject; this card's subject is the picture, and a heading
between somebody and the film would be claiming otherwise. Here it is a caption
on the transport and is drawn as one — `body`, one line, truncated.

**Not on the expanded picture.** The scrim carries the transport and *Exit full
screen* and nothing else, decided the same day. The transport is one row drawn
in two places and this is the first thing the two have not shared, so it takes
a flag rather than a second copy of the row — the copy being exactly what that
extraction exists to prevent.

## The revival

A party stored before today has no `title` in its blob, and `revivedWatch`
normalises the undefined to null rather than carrying the party whole. It
matters because `learnTitle` refuses to overwrite a title that is not null, and
undefined is not null: without the normalisation, every channel that survived a
restart would have been a party no player could ever name.

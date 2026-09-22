# 2026-09-22 — The channel remembers what it watched

A watch party has been started by pasting a link since it shipped, and that is
still the only way a video nobody here has seen gets on. What it could not do
was get back to one. A link arrives on a clipboard, is parsed, becomes a party,
and is gone the moment the party is — so a channel that watched half of
something on Tuesday had, on Wednesday, no route to it but whoever pasted it
going and finding the video again. The card had stopped showing the URL on
2026-09-18 for good reasons of its own, which closed the last accidental way
back.

The channel already knew which video it was. It had the id, the URL as pasted,
and — since 2026-09-20 — the name and the length a player had reported. All of
it was thrown away on `STOP_WATCH`.

So `WatchState.history` is a list of the `WatchParty`s this channel has
watched, newest first, and the watch card offers them back as rows.

## It belongs to the channel, not to a person

The alternative was an account's own list of everything it had ever watched
anywhere, which is what most products in this shape do. It is the wrong object
here. The thing being remembered is *what we watched*, and everybody in the
room watched it; a list held by the person who happened to hold the clipboard
would be one the other five could not reach, in a feature whose whole premise
is that the film is the room's rather than anybody's. It would also have been
the first per-account media record this project has ever kept, needing storage,
a route and a retention answer, to make something *less* available than putting
it where it already is.

Being the channel's, it rides in the channel snapshot and is written to the
durable blob with the rest of the watch state, which is the whole of its
plumbing. It survives a restart, and it has to come back whether or not a party
does — that being a different path through `revivedWatch` and the one the
server test pins.

## Written when a party ends, not when one starts

The obvious place to record a film is `START_WATCH`, and it is wrong. A party
learns its name and its length seconds after the link is pasted, from the first
player that can say; an entry banked at the start would be a bare id for ever
while the same film sat on the card with its title under the progress bar.
`rememberFilm` therefore runs on the two branches that *end* a party — the stop
and the swap — and takes what the party had managed to learn by then.

Which leaves the one case worth spelling out: a party stopped in its first
seconds is remembered nameless, and if that video had been watched properly
before, the nameless entry would replace the named one. The history would go
backwards on a tap somebody made by accident. So each half of an entry falls
back to what the previous entry for the same video knew. The two facts are a
pair from one video, so there is no way to end up with one film's name against
another's length.

Deduplication is by `videoId` rather than by URL: the same video reached by a
share link and by a watch link is one film, and a list that filled up with the
same evening would be no use to choose from. Ten deep, because these are rows
somebody presses rather than an archive — and because the list is in every
snapshot the room receives.

## A row is pressed the way a link is pasted

The row dispatches `START_WATCH` with the stored URL, not the id. That is the
whole of why there is no new action: the server parses what it is given with
`parseYouTubeUrl` either way, so a row goes through exactly the checks a
clipboard does, and nothing has to trust the history. There is no second way
into a party for a video nobody has parsed.

On an idle card the list stands behind one press — *Watched before (n)* — shut
on every mount, because the card's subject is starting something and ten old
films above the one commitment on it would be the wall STYLE.md § *A card of
many items asks for one of them* is about. On a loaded card it is open behind
*Change video*, and deliberately gains no second disclosure: that press is
already the one that says somebody means to empty four other people's picture,
and asking twice more for a film the channel has itself watched would make the
known thing harder to reach than the clipboard, which can put on anything at
all.

## What was not built

**No clearing it.** A list ten deep that rolls over by itself has no state to
get wrong, and a *Forget this* on each row would be a fourth thing to press on
a card that is already dense. If it turns out somebody wants a film off the
list, the honest version is per-row and can be added then; guessing now would
be building a control against an imagined objection.

**No count of how often, and no dates.** Both were tempting and neither changes
which row somebody presses. The order is *last watched first*, which is the one
ranking a person can reconstruct in their head.

**Nothing asked of YouTube.** Unchanged, and worth saying because a history is
exactly where a thumbnail would be argued for. Everything in an entry was
reported by a player that already had the video open. See
`decisions/2026-09-17-the-page-the-film-plays-in-may-not-claim-to-be-youtube.md`
and `decisions/2026-09-20-the-film-says-what-it-is-called.md`.

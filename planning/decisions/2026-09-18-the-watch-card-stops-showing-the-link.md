# 2026-09-18 — The watch card stops showing the link

The *Watch* tab drew `party.url` in `heading` directly under the player, and
it is gone. A YouTube link is machine text: it identifies the video only to
somebody who can read an eleven-character id, it was the longest string on the
card, and `numberOfLines={1}` meant the part actually shown was
`https://www.youtube.com/watc…` — the prefix every film shares. Drawn at
`heading` it claimed to be the subject of the card in the same type the
channel name gets, while saying nothing about which film was on.

**Nothing replaces it, and the reason is a constraint rather than a
preference.** Nothing in this application asks YouTube anything: the channel
learns exactly one fact from a player, the duration, via `WATCH_READY`, and
`WatchParty` has no title field because there is nowhere for one to come from.
Fetching one would be the first request this project ever made to Google, for
a string that decorates a card. So the choice was the link or nothing, and
nothing is the better of the two — what says a film is on is the transport,
the *Watch on* switch and, on the device showing it, the picture. A follower
device has all three.

`WatchParty.url` stays, and its comment — *kept so the interface can hand back
exactly that* — is now the whole of its job. Handing it back is **Copy video
link**, which is untouched and is the one route a URL has off this screen; the
test added with this change asserts the button is still there, because a link
nobody can reach would be a different change from a link nobody is shown.

Two tests had been using the URL's presence as their evidence that a party was
loaded, which it never really was. They assert the controls a loaded card has
and an empty one does not.

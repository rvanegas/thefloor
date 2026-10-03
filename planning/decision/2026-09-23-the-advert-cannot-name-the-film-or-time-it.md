# The advert cannot name the film, or time it

Reported 2026-09-23, during a live room: *paused and played several times and
the video is stuck*. The film had just been put on, which is what made it a
different fault from the one fixed that morning — see
2026-09-23-the-watch-transport-answers-the-press.md, whose complaint had the
same words and a different cause.

## The circle

`learnDuration` keeps the first length any player reports and keeps it for
ever. That rule is right and the reasoning behind it has not changed: a second
player disagreeing is a disagreement no rule can settle, and the first answer
is the one every clamp so far has been made against.

What nobody asked is **what the first report is**. On a party that has just
started, the first thing any player can measure is the pre-roll: `getDuration`
describes the advert while one runs. So a thirty-second spot became the film's
length, on every screen in the room, for the life of the party.

Everything downstream then did exactly what it was built to do.

- `watchPositionMs` clamps to the length, so the scrubber ran out in half a
  minute and stopped.
- `hasReachedEnd` brought the whole room to rest there. Play restarted from
  zero — `watchPlay` reads a transport at the end as a replay — and ran out
  again thirty seconds later. **That is what pressing it several times feels
  like.**
- `showingTheFilm` compares the player's length against the party's to tell an
  advert from the film. With the advert's length banked as the film's, every
  reading of the *actual film* failed that comparison, so the follower stopped
  speaking to its player at all.

The last one is the part worth keeping. **A length cannot detect the case that
poisons it.** The advert-detector's input was the thing the advert corrupted,
and the failure was therefore permanent and silent: no error, no log line, a
picture that stops and cannot be started.

It was written down and thought cheap. `learnTitle` said an advert naming a
party is "the known cost of learning anything from a player ... visible and
self-correcting in the way a wrong duration is not (somebody reads a name that
is not the film's; nothing breaks)". The parenthesis is exactly right about the
name and was never checked against the length, which travels in the same
report and breaks everything.

## What it is now

**The player says which video it is showing.** `getVideoData` carries a
`video_id` beside the `title` this already read, and during a pre-roll it is
the advert's. That is the fact the lengths were standing in for, said outright,
with no tolerance to pick and nothing circular in it.

- `PlayerReading.videoId`, reported by both players — the WebView page posts it
  with every reading, the web player reads it in `read()`.
- `showingTheFilm` answers on the id where there is one.
- Neither player reports a film to the channel unless it is showing the film,
  so the advert's length and the advert's name never leave the device.

**The lengths stay as the fallback**, for an embed whose `getVideoData` is
missing — it is undocumented, has been on the player for years, and is read
through a guard here as it is everywhere else. Such a player is no worse off
than it was this morning and no better, and the circle is still in it. There is
nothing to be done about that from inside a length.

## What was not done

**`learnDuration`'s first-answer-wins was left alone.** The tempting repair is
to let a later, larger duration overwrite an earlier one, which would have
healed this party without knowing anything about adverts. It would also have
handed every party's clock to whichever player was most wrong, and it treats
the symptom: the party was told a false fact, and the fix is not to tell it
more facts and hope.

**Nothing watches for a party whose length looks implausible.** A film that is
genuinely thirty seconds long is a film, and a guard that could not tell the
two apart is the timer this whole subsystem has spent four days getting away
from.

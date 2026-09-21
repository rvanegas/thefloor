# A pause is when nobody is watching

The roster's `· watching` suffix is drawn only while the party's film is
actually running: the guard in `ChannelView` is now `channel.watch?.status ===
'playing'` where it was `channel.watch?.party`.

The suffix is drawn from `ChannelView.watching`, which is gathered from
`Connection.screening` — a device saying which channel it *would* show a film
for. That is a standing declaration, not a picture in motion: it is set when
somebody opens a party's channel and it survives a pause on every device in the
room. So across a pause the line went on naming everybody who had the channel
open, including whoever had put the phone face down the moment the film
stopped.

Which is the wrong answer to the only question the line was added to answer.
*Watching* is there so that somebody starting a film can see whether the room
came with them; a film is paused precisely so that the room can talk about it,
and during the pause there is nothing to be with. Reporting attention the
screen has no evidence for is worse than reporting none — the same reasoning
that already retracts the declaration while a phone is backgrounded.

This is the party's own status and not a per-person one, so the effect is
all-or-nothing: while a film is paused no card carries the suffix, and every
one that should carries it again the moment it resumes. Nothing about the role,
the microphone, `watchingHere` or `screening` itself changes — only what the
roster is willing to say about them.

See GLOSSARY.md § *Watching (on the roster)* and
2026-09-20-the-roster-says-who-is-watching.md.

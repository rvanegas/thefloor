# Watch and listen outside a channel, where contacts can see it and join

Asked for 2026-11-06. Today the *Watch* and *Listen* players live only inside
a channel: a film is the *watch party*'s, a track is the channel's, and both
need somebody *present*. This is the same players with nobody else there,
used alone, and made visible to one's contacts so the solo session can grow
into a shared one.

- **Alone, outside any channel.** Somebody opens a film or a track from Home
  and watches or listens by themselves. Nobody is in a room, so there is no
  media room, no *floor*, no chimes, and nothing recorded.
- **Every contact can see it.** Their row on *Contacts* says what they are
  watching or listening to, beside or instead of *In the app now*, with the
  *film title* or the track's name: *Watching "…"*, *Listening to "…"*.
  Only while it is *playing*, as *watching (on the roster)* reads now: a
  pause is when nobody is watching.
- **A contact can join it**: from that row, open the same film or track,
  playing from the same position and following the first person's
  *transport*. Still no channel, no media room and no voices: two people
  watching the same thing apart, each seeing that the other is.
- **Then talk about it together.** A contact who joins can invite the first
  person into a channel, the two of them, to watch or listen together and
  talk. The film or track carries over into that channel's watch party or
  *Listen* tab at the position it had reached, and from there it is the
  watch party as it is today: the *room's voice*, the film chimes, and *one
  mode at a time* against recording.

Still to decide:

- **Which channel the invitation opens**: the pair's own channel, the one an
  *invite link* opens (and see *Contacts are one-on-one channels*), or a new
  one; and with three or more watching apart, whether the invitation takes
  all of them.
- **Who can see it**: every contact, as asked, or a switch on *Floor
  Settings* to keep it to oneself. What someone watches says more about
  them than *In the app now* does.
- **Following apart** needs a shared transport with no room behind it,
  which `WatchState` is not today: it is a channel's. Either a session object
  of its own, or a channel nobody is present in, which *presentOrEmpty*
  and the room's lifecycle would both have to allow.
- **The track:** *Listen* plays the channel's own track. Outside a channel
  there is no channel track, so say what is being listened to: a podcast
  episode, a recording one has shared, or something else.

*The Floor carries no video* still holds: the film is YouTube's own player,
on the device showing it.

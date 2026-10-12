# A player that stopped by itself is placed again

Golf's readout said −85.42s on a party where Golf was sure the film was at
20:03 too. It was not: 20:03 is the transport's clock, which is the room's
position on every screen, not the player's. Golf's film was at 18:37.

The journal says how. Golf's phone left the app twice in the first four
minutes, and iOS paused the film each time. The room played on. Each return
saw a paused player under a playing room and told it `play`, with no seek,
because a placed player is never seeked again: nobody corrects drift
(2026-10-03-nobody-corrects-drift.md). The film resumed where iOS had stopped
it, 79 and then 85 seconds behind, and every press after that kept the gap.

**It was not drift.** It was an interruption nobody in the room asked for,
which is the reason that decision already gives an advert its one seek. So a
player found paused while the room wants `playing`, with no pause said by this
follower since it was last seen playing, is unplaced. The ladder then owes it
the one seek that a rebuild or an advert gets. A call pausing the film is
covered by the same rule.

**A pause pressed anywhere is not one of these.** Every pause reaches the
player through the follower, which says it, so a pressed pause is never taken
for the player's own. A pause the player has been told and has not yet obeyed
does not count it as running again. The journal line `watch player stopped by
itself` marks each case.

The harness learned two things to test it. `away` moves the room and the
player with no timers firing, since that is what a suspended app is: a
follower that kept ticking catches the pause inside the tolerance and places
the player again, which is not what a phone sees. And a `play` that lands
during a seek on a paused player now plays once the seek lands, as `playVideo`
after `seekTo` does. Before, the harness dropped it.

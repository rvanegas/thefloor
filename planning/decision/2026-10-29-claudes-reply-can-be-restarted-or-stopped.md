# Claude's reply can be restarted or stopped while it is read

Built 2026-10-29. Rodrigo's ask: "During read aloud of claude's response,
there should be two controls available: restart and stop." Amends
2026-10-28-claudes-reply-is-read-aloud-on-arrival.md, whose *No switch* still
stands — these act on one reading, and set nothing.

**Over every screen, because the voice is.** `useClaudeReadAloud` sits above
the route table so that somebody back on Home still hears the reply; controls
only on the *Record* would leave that person a voice they cannot stop. So
`ReadingBar` is drawn by `App.tsx` above the panes, while a reply is being
heard and at no other time.

**At the top, not the foot.** A bar that appears on its own takes its height
from what is under it, and at the foot that lifts the channel footer — Mute,
Claim — under a thumb on its way there. Moving a header's buttons is the
cheaper of the two. Floating over a corner, as the picture does, was the
alternative that moves nothing, and was not taken because it covers whatever
is in that corner for the length of a reply.

**"Being heard" is the native reader's to say**, since only it knows when the
last sentence has played: `speak` now carries the paste's id, and `Reader`
publishes `onReading` with the id of the reply in its first queued segment or
sentence, or empty once nothing is queued. The gap while the next sentence
renders is still reading, so the bar does not blink between sentences.

**Restart is the reply being heard, from its first sentence**, not the latest
— they differ only when a second reply lands during the first. It is a stop
and the same `speak` again, with the text, locale and voices remembered by id
from the first time, so it sounds the same. Anything queued behind it is
dropped, as *Stop* drops it: the press was about this one. The stop publishes
nothing-being-read before the second speak publishes the id again, and the
hook ignores that one null so the bar does not leave and return under the
thumb that pressed it.

**Native, so it reaches a phone with the next upload.** The JS side degrades
to no bar where the module does not emit `onReading`.

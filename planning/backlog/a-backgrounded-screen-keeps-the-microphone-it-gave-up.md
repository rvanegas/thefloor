# A backgrounded screen keeps the microphone it gave up

A device that is the party's screen reports `WATCH_HERE`, and `isScreening` in
`core/micNeeded.ts` reads `watchingHere` to withhold that person's microphone
while the film plays — the trade being that one device cannot both play a film
in stereo and hold a voice-mode session open.

**Nothing takes that back when the app goes away.** The report is made under
`steppedIn` in `ChannelView.tsx` and reconciled from the channel rather than
from the foreground, so a phone that is pocketed mid-film keeps its name on
`watchingHere`: iOS suspends the WebView, the film stops, and the person is
left blind, silent and unable to be heard in a room they are still standing in.
The room is told nothing, their card having no way to say it.

**The roster's *watching* suffix does not reach this**, though it retracts the
neighbouring declaration for exactly this reason — see
`decisions/2026-09-20-the-roster-says-who-is-watching.md`. That one withdraws
`screens.showing`, which is connection state and a report about a screen;
`WATCH_HERE` is a channel action about a person, on a different guard, and the
two are deliberately separate. Since 2026-09-20 the roster is at least honest
about it: such a phone stops being drawn as watching while it says nothing
about the microphone.

**What it would take** is for the screen report to ask the same question the
retraction does — the app being frontmost — and to re-report on return. The
care needed is in the reacquisition: `keepAwake.ts` already notes that iOS
refuses a backgrounded app a new microphone, so the report coming back must
happen in front, which is where a foreground listener puts it. Worth a test
that a film playing through a background and a foreground leaves the microphone
as it found it.

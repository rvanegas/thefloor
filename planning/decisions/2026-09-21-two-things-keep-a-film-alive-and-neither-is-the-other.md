# 2026-09-21 — Two things keep a film alive, and neither is the other

Written 2026-09-21, describing what shipped on 2026-09-17 in `589ba37` *The
film plays in the app* and in `tasks/keep-alive-during-watch-party.md`. Nothing
was built for it; it is here because the question *what keeps a watch party
alive* has two answers that sound like one, and the session that finds only the
first will conclude the second is missing.

**Both are gated on `watch.status === 'playing'` and on nothing else.** A
paused party is a room somebody may genuinely have walked out of, and that is
the same judgement in both halves.

## The idle timer, which is about the glass

`app/src/watch/keepAwake.ts`, called once, from `WatchPlayer.tsx` —
``useKeepAwake(`watch:${channelId}`, watch.status === 'playing')``. Native takes
`activateKeepAwakeAsync(tag)` and releases on unmount; the tag is the channel,
so two players in one process could not release each other's hold. Both calls
swallow their errors deliberately: a device that refuses to stay awake is a
film that dims, which is a worse evening and not a broken one, and throwing
would take the player down with it.

`keepAwake.web.ts` is `navigator.wakeLock` where it exists and nothing where it
does not — Safari has it, Firefox does not, and a browser without it dims as it
always did. **The visibility listener there is not bookkeeping.** A wake lock is
lost when the tab is hidden, by the specification, and does not return on its
own; without the listener the feature works exactly until somebody glances at
another tab. It also listens for the lock's own `release`, so a lock the
browser drops for its own reasons — a battery saver — is forgotten rather than
believed in.

**This holds off the idle timer and cannot hold the foreground.** iOS offers no
such power to anybody. It matters beyond the dimming because of `isScreening`
in `core/micNeeded.ts`: a screening device gives up its microphone while the
film runs, iOS refuses a *backgrounded* app a new one, and so the reacquisition
at the pause has to happen in front. A film on the glass is what puts it there.
The deliberate swap-away needs nothing — the app stays `LISTENING` and takes
the session at the next foreground, which is the deferred promotion in
STATES.md.

## The attention clock, which is about the room

`ChannelView.tsx`: while the screen is here and the film is playing, report
`app.reportAttentive()` at once and then every `ATTENTION_REPORT_MS`.

The browser's attention clock counts a hand on the page, and somebody watching
a two-hour film produces none — a cross-origin YouTube iframe swallows even the
clicks they do make, so they never reach the document. Fifteen minutes in,
`useAttention.web.ts` would step them out of the channel the party is running
in.

**Evidence, not an exemption**, which is the distinction `state/attention.ts`
turns on. An abandoned tab is the ghost that clock hunts; a tab showing a film
somebody deliberately started, which stops itself at the end and which the
transport can pause from anywhere, is not one.

**It works across devices because `attentive` is account-scoped.**
`Channels.attentive` keys on `(channel, user)` and checks membership rather
than presence, so the laptop showing the film refreshes the clock for the room
the phone is standing in. `server/__tests__/presence.test.ts` holds that fact under *is saved by
the device watching the film, not the one holding the voice*, because it is
load-bearing and not obvious. Native needed nothing: being frontmost already
speaks for somebody who is only watching.

## What is deliberately not covered

Somebody in the room on a browser who has chosen no screen at all gets nothing
from the party. They are in a channel where a film is playing and are
demonstrably doing nothing, which is precisely the case the window exists for;
making a party evidence for *every* member would hold somebody present through
two hours they walked away from.

Nor is there any iOS keep-alive native module. `modules/keep-alive` played
silence and was deleted whole on 2026-09-08 — see
`2026-09-08-stepping-in-and-nearby.md`. Android's foreground service in
`modules/call-service` is a different thing again: it keeps a *process*, not a
screen and not a clock.

## One sentence in the record is now wrong

`2026-09-17-the-lock-screen-carries-two-controls.md` § *What the lock did
before* ends: *nothing prevented the lock in the first place; there is no
`expo-keep-awake` in this app and there should not be.* Both halves were true
of a phone alone in a call, and the second stopped being true the same day —
`589ba37` added the dependency for the player. **It is left standing, because
decisions are dated history and amending one is how the record stops being
evidence.** Read it as scoped to what it was describing: a locked phone in a
channel with no film, where keeping the glass awake buys nothing and costs a
battery. There is still no keep-awake there, and there should not be.

See `tasks/keep-alive-during-watch-party.md`,
`2026-09-17-the-screen-is-the-app.md`,
`2026-09-09-attention-is-one-clock.md`, and
`backlog/a-backgrounded-screen-keeps-the-microphone-it-gave-up.md`, which is
the open end of the microphone half.

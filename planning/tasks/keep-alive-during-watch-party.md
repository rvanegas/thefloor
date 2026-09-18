# Keep Alive During Watch Party

Since there's no speaking, there must be another way.

**Done on 2026-09-17**, and the answer turned out to be smaller than the
question, because most of it was already true.

**`attentive` is account-scoped, not device-scoped.** `Channels.attentive` keys
on `(channel, user)` and checks membership rather than presence, so evidence
gathered on any of an account's devices refreshes the clock for the room
another of them is standing in. That is the whole mechanism: the laptop showing
the film reports, and the phone holding the voice is what the report saves.
There is a test for exactly that in presence.test.ts — *is saved by the device
watching the film, not the one holding the voice* — because the fact is
load-bearing and was not obvious.

**What had to be added is one report.** A tab that is showing the film now says
so every `ATTENTION_REPORT_MS` while it plays, in `ChannelView`. Without it the
browser's clock counts a hand on the page — a click, a key, a scroll — and
somebody watching a video produces none for two hours; a cross-origin YouTube
iframe swallows even the clicks they do make.

**Written as evidence rather than as an exemption**, which is the distinction
`state/attention.ts` turns on. An abandoned tab is the ghost that clock is
hunting. A tab showing a film somebody deliberately started, which stops itself
at the end and which the transport can pause from anywhere, is not one — the
same reasoning by which somebody else being audible counts and your own
microphone does not. It reports only while the film is *playing*: a paused
party is a tab that may genuinely have been walked away from.

**Native needed nothing.** Being frontmost already speaks for somebody who is
only watching, and a phone that is put away loses its process in about a
second.

**What is deliberately not covered**, and should stay that way: somebody in the
room on a browser who has chosen no screen at all. They are in a channel where
a film is playing and they are demonstrably doing nothing, which is precisely
the case the window exists for. Making a party evidence for *every* member
would keep somebody present through a two-hour film they walked away from.

See decisions/2026-09-17-the-screen-is-the-app.md and
decisions/2026-09-09-attention-is-one-clock.md.

# Keep Alive During Watch Party

Since there's no speaking, there must be another way.

**Half done on 2026-09-17.** A browser tab that is *itself* showing the film
now reports attention while it plays — `ChannelView`, one message per
`ATTENTION_REPORT_MS` — so watching in the app no longer steps you out of the
channel you are watching in. It is written as **evidence rather than an
exemption**, which is the distinction `state/attention.ts` turns on: an
abandoned tab is the ghost that clock is hunting, and a tab showing a film
somebody deliberately started is not one.

**What is left is the other configuration**, and it is the commoner one:
a browser sitting in the room while the film plays on *another* device. There
is no hand on that tab either, nothing on it is playing, and fifteen minutes in
it steps its owner out of the room mid-film — taking their voice with it, since
presence is what the audio follows.

The shape of an answer is probably that **a party playing in a channel you are
present in is itself evidence**, for every member rather than only for the
screen. That is a wider claim than the one already shipped and wants thinking
about: it would keep somebody present through a two-hour film they walked away
from, which is exactly what the attention window exists to prevent. Possible
narrowings — visible tab, or a party somebody in the room is demonstrably
driving — are each their own argument.

Native needs nothing: being frontmost already speaks for somebody who is only
watching, and a phone that is put away loses its process in about a second.
See decisions/2026-09-17-the-screen-is-the-app.md and
decisions/2026-09-09-attention-is-one-clock.md.

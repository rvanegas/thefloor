# The support page's notifications section is iOS-only, and there is now a web client

`server/src/support.ts` § *Notifications* says that if notifications are not
arriving, check that they are allowed for The Floor in the iOS Settings app.
That is the whole of the advice, and it is a public page that `/app` and
`/beta` link to.

The web app **deliberately has none** — the reasoning is
decisions/ § *The web app is a secondary interface*, where a
secondary interface has no business waking anybody and the phone is already
there to do it. But nothing says so anywhere a browser user will look, so what
that section currently does is send them hunting for a setting that does not
exist. It wants a sentence, not a section.

The same page was already fixed once for the web client, on 2026-08-24, when it
still claimed that signing in on a second device signs you out on the first.
This is the half of that pass that was named and missed.

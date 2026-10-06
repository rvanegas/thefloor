# A contact always sees your email

Backed out on 2026-10-06: showing your sign-in address to a contact was a
separate act, made on that contact's profile one person at a time, with a
button to stop. Now every contact sees it and nobody else does — the audience
availability and the messaging handles already had.

The per-reader design (`0afaa1f4`, 2026-08-23) argued that an address is the
one thing a relationship should not release, since it reaches you outside the
app for ever. In practice the second step was one most people never took, so
a contact's profile mostly said *They are not showing you their email* and
offered nothing to reach them by. A contact here is already mutual and
accepted at both ends, the narrowest standing there is; the address goes with
it. A stranger sharing a channel still gets none of it, and removing a contact
removes it from their screen.

What went: the `email_reveals` table (dropped at startup), the button, its
strings in both languages, and the client call. What stays for builds up to
338 is in SHIMS.md under gate 339 — `myEmailShown` sent as true, and the two
routes, the stop route refusing in words. The privacy page and your own
profile's *How you sign in* line say the new rule.

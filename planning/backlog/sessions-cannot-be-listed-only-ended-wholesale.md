# Sessions cannot be listed, only ended wholesale

**Status:** not started, and a gap opened deliberately on 2026-08-24 rather
than one that was always there. Several sessions per account became ordinary
that day — see decisions/ § *Several sessions, one voice* — and
what replaced the old "signing in elsewhere ends everything else" rule is
`/auth/sign-out-others`, which ends every session but the caller's.

That is the right first move and it is blunt. Somebody who wants to sign out
one of three devices has to sign out both and sign the other back in, and
somebody who merely wants to know where they are signed in cannot find out at
all.

The reason there is no list is that there is nothing worth listing. A session
is a row in `tokens`: a hash, an account, a minted time and an expiry. Nothing
records what kind of device presented it, and a row reading "iOS, 3 August" is
not something anybody recognises their own lost handset in. Making the screen
useful means recording something at sign-in worth showing — a platform, a model
name, the address it came from — which is a schema change, a wire change, and a
privacy decision about keeping a log of where somebody signs in from. Each of
those is small; wanting them is the part that has not been established.

`device_tokens` looks like the nearer half of the answer and is not: it is a
register of push *addresses*, and an install that was never granted
notification permission has a session and no row there at all.

**What a screen would need is already half-built.** `tokens` carries
`last_seen_at` and `last_build` per session as of 2026-08-24, so "signed in on
a build-56 device, last heard from on Tuesday" is answerable today. What is
missing is anything a person could *recognise* — a platform, a model name — and
that is the schema change, the wire change, and the privacy decision about
keeping a record of where somebody signs in from. `device_tokens.platform`
already knows the first of those for push-enabled installs, and
`device_tokens.session_hash` now joins the two tables, so the join is no longer
the obstacle it was.

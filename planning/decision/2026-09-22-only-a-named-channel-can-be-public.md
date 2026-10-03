# 2026-09-22 — Only a named channel can be public

The switch that gives a channel a public page is refused until somebody has
named the channel, and a public channel's name cannot be emptied afterwards.
`setPublic` in `server/src/publication.ts` holds the first; the `SET_NAME`
guard in `server/src/channels.ts` holds the second; `Publishing` in
`app/src/ui/ChannelSettingsView.tsx` says so before either refusal is reached.

**It is a rule about what a stranger reads, not about who is deciding.** Any
member may still make the page — publication's one ordinary bar is untouched.

## What was wrong

A channel is named or unnamed, and an unnamed one is described by its roster:
`describeChannel` lists the people in it, which is how it appears on Home and
what its recordings are filed under. That is the one thing a public page may
never say. `planning/GLOSSARY.md` § *Public channel* has carried **No member
is named on it, ever** since the day publication shipped, and the episode
titles obey it — a recording still carrying its participant-derived default
name is shown by its date instead.

So the page and the directory row had nowhere to get a heading from, and both
answered `row.name ?? 'A conversation'`. Which is not a name. It identified
nothing, and on `/podcasts` — which arrived the same day, and is what makes a
public channel public in the ordinary sense — every unnamed row would have
read the same. A list several of whose entries are indistinguishable is a list
nobody can use, and the substitution hid that from the person turning the
switch on: they published a page and were never told it had no title.

## Why the name is asked for at the switch

The alternatives were to derive something, or to let the page carry the
fallback and say so.

Deriving is the one thing forbidden here: everything this channel is known by,
short of a name, is who is in it. A date would be a lie about a channel that
is not an event, and an id is not a name either.

Saying so in the app — *your page will be called A conversation* — was the
honest version of the fallback, and it loses to asking, for a reason about
where the fix is. The field is the first card on the same screen. A
precondition somebody can satisfy with one tap and a word, without leaving the
screen they are on, is not an obstacle; it is the screen telling them what
this feature needs. The confirmation already stops them for something larger.

## Both directions, because the rule is about the state and not the act

Refusing the switch alone would have left the other door open: name a channel,
make it public, clear the name. So `SET_NAME` with an empty name is refused
while `public_at` is set — out loud, with `conflict`, like the two departures
beside it rather than by the reducer's usual silence. A refused action arrives
at the app as a socket error, which nothing on the settings screen renders,
and the field there saves as you leave it — so a silent refusal would have
read as a rename that was kept until the next snapshot quietly took it back.
The screen therefore puts the field back itself and never sends the action,
and the sentence under the field says the page is what is holding the name.

Renaming a public channel to something else is untouched, and going private is
never gated: a channel that lost its name somehow must still be able to take
its page down.

## What was left alone

**The `'A conversation'` fallback stays in app.ts.** It is now reachable only
by a channel made public before this rule, and there was one on the box the
afternoon this was written — a solo test channel, named by hand rather than by
any migration. Nothing here rewrites anybody's data, and nothing takes an
existing page down: a channel that has been public for a month is not a
decision to revisit on a deploy.

**The reducer does not know about any of this**, and should not. `public_at`
is a column rather than a field of `ChannelState` — no reducer knows a channel
is public — so a guard in `core/` would have needed publication moved into the
state to hold it. The rule lives where the fact lives, which is the server.

# A declaration displaces every instance

`screens.showing` takes the film off **every other session instance of the
account**, rather than off the ones whose `Connection.screening` the server
happens to be holding. The filter that skipped the rest is gone; an instance
showing nothing is sent a null `screen`, and ignores it.

Reported from two devices: a film playing on a second device, the app updated
on the first, and the film then playing on both — two pictures and two
soundtracks from one account, and stable, because nothing afterwards said
otherwise.

## What the record is, and what it is not

`Connection.screening` is what a device last *managed to say*. The role itself
is `AppProvider`'s `screenFor`, which lives in the app and survives everything
the socket does not: a deploy, a tunnel, a lift, a suspended process. The two
come apart in the ordinary course of an evening, and
2026-09-20-a-declaration-outlives-the-socket-it-was-made-on.md is the first
half of closing that gap — `Realtime` now restates the declaration in
`onopen`, so a live client on build 263 or later puts the record back a
moment after losing it.

That repair is about a *window*. This one is about what the server does with
the record while it is wrong, which is a different question and has a worse
answer: the eviction was filtered on it. So a device the server had no record
of was skipped — which is to say the invariant was enforced against exactly
the devices that were still agreeing with it, and not against the ones that
had drifted. Every client below build 263 is in the second group permanently,
having nothing that outlives a socket to restate anything with.

## The sequence, which is ordinary

1. The film is playing on the second device. Its declaration is the only thing
   saying so, and at some point the socket carrying it goes — a deploy is
   enough, and a deploy drops every socket at once.
2. The app is updated on the first device. A fresh process has no `defaulted`
   mark for this film, and the `screening` push it is sent at connect says
   nobody else has the picture, because nobody said so.
3. Stepping in, it defaults to *this device*, declares, and displaces nothing.
   Both play.

Nothing in that sequence is a race. The state it lands in is the resting one,
and the only way out of it was for somebody to press something.

## Why not repair the record instead

Because the record cannot be made trustworthy enough to filter on, and an
invariant enforced from an untrustworthy record is not enforced. The server
cannot ask a device what it is playing; it can only remember what it was told
and by whom, and a message it never received is indistinguishable from a
device showing nothing. What it *can* do is address every instance the account
has, which costs a null to some idle sockets and settles the question by
construction rather than by agreement — the same trade `handOver` already
makes in letting the eviction clear the old screen rather than clearing it
eagerly.

The cost is honest and small. A null reaching an instance that is showing
nothing takes nothing away, and the app short-circuits it: `onScreenAsked`
returns on a null while `screenFor` is already null, so no retraction is sent
back and nothing re-renders. Only the null is short-circuited — a grant is
always acted on, redundant or not, since it carries the arrival that opens the
channel.

## What it does not fix, deliberately

**The film may now move rather than double.** A fresh process that is told
nobody else has the picture still defaults to itself, and now takes the film
off the device that was playing it — one soundtrack, on the wrong device. That
is strictly better than two and is not the end of it: the default reads
`screensElsewhere`, which is the same record by another name, so the honest
fix for the theft is the one the previous decision started — the record being
restated by every client, which is true from build 263 onward.

**A device that cannot reach the server at all goes on playing.** Nothing
server-side reaches it, and nothing should pretend to. Its clock comes from
snapshots, so what it is doing is holding a still frame.

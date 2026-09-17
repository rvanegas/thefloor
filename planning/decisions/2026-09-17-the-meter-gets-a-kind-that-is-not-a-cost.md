# The meter gets a kind that is not a cost, 2026-09-17

The floor is now metered: a `floor` span opens on the claim and closes on the
release, written from `meterCommit` like `playback` and `pair`. It retires
`backlog/the-meter-records-microphones-and-nobody-can-count-turns.md`, which
asked for exactly this and hesitated over exactly the right thing.

**What could not be answered before.** How long a turn lasts, how many turns a
conversation has, and therefore whether the claim delay — the ladder over
`floor.lastClaimedAt`, which is the central mechanic of the product — produces
the distribution of turns it was designed to produce. `durableOf` drops the
floor at every restart on purpose, and the only floor history on disk was
`recordings.floor_timeline`, which exists only for conversations somebody chose
to record. That is a sample selected by the very judgement the figure would be
used to examine, so it cannot settle the question; it is not a cheaper version
of this, it is a different and biased one. That asymmetry is what decided it.

**Why it could not be derived from what was already collected.** `mic` and
`listen` are sampled at `USAGE_POLL_INTERVAL_MS`, fifteen seconds. A turn is
often shorter than that, so the error that is noise across a month of minutes
would be the whole signal across one conversation. The floor is a transition,
so its edges are exact — and they come from the committed state, which is what
the clients were told, so they are the edges the app drew.

**Keyed on `floor.holder`, not on `isWithheld`.** The obvious hook is
`applySilenceToMedia`, which is where the floor already reaches the media
plane; it also fires for a watch party's mute, that being the other way
somebody is withheld. A room muted for a film is not somebody taking a turn,
and hanging the span off the silence mechanism would have counted it as one.
There is a test for that case rather than a comment alone.

**The holder is always an account**, unlike `participant`: `canClaimFloor` went
members-only on 2026-08-30, so a guest never reaches this and no report over
these rows has to cope with a bare identity.

**Nothing leaks.** A departing or disconnecting holder has the claim
force-released by the reducer, so every claim has a matching release
transition; a span open when the process dies is zeroed by `closeStrays` at the
next boot, which is right rather than lossy, because the floor does not survive
the restart either. Retention and `UsageMeter.forget` covered the new kind
without a line: thirty days, and deleted with the account.

## What was actually being decided

Not the cost — it is a dozen lines and no schema change. **Every other kind in
these tables measures what this box carried**: uplink, downlink, connections,
stems, bytes. It is a cost ledger, and *nothing in the application reads these
tables* is easy to keep when none of the material is the sort of thing a
feature would want. A floor span is the first row whose subject is what people
did to each other — who took turns, who held on, who never claimed — sitting in
the same table looking like the others.

So the rule now rests on discipline rather than on the subject matter being
uninteresting, and the pressure is obvious: a turn-taking figure is one screen
away from being a nudge. It was collected anyway, on the argument that the
question is about whether the product's central rule works at all. **What that
buys has to be paid for by saying so**: the schema comment calls the kind out
as not a cost and names the one question it exists for, so the next person to
reach for it has to argue against a stated purpose rather than invent one.

If that ever stops holding, the kind should go rather than the rule.

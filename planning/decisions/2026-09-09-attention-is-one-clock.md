# 2026-09-09 — Attention is one clock, and the server holds it

Three clocks answered overlapping questions and disagreed at every seam. There
is one now: **the time since somebody was last attending the application.** The
server holds it, one stamp per account, and it is what the roster shows about
anybody who is not in the room and what the tick reads to decide when they stop
being nearby or present.

## What it replaced

- **`lastPresentAt`** — the last sign of life in a channel. Still stamped, and
  now read only by `lastPresenceAt`, which orders Home. No longer a word on
  anybody's screen except through the fallback below.
- **`declaredNearbyAt`** — added that morning, timing a declaration from the
  declaration. Kept as the auto/manual bit that tells a chosen nearby from one
  a lost connection produced; no longer a clock.
- **A private attention clock in each client**, scoped to the channel that
  client was standing in, refreshed by other people's voices, and visible to
  nobody. Two copies of the rule existed, one per platform, differing in ways
  that had to be written down twice.

The defects were all seam defects: a declaration timed from an older silence, a
footer lit *Nearby* over a roster reading *Stepped out*, a card that could not
be refreshed without stepping in or out, and two members' rosters showing
different numbers about the same person.

## The four decisions inside it

**Foreground still counts on a phone.** Being frontmost is continuous evidence,
re-read every thirty seconds, alongside any touch. The narrower reading — an
act only — expires somebody who is looking at the screen and has not touched
it, which on a phone is what reading looks like. That was decided on 2026-09-06
and is kept. A browser is different and legitimately so: an abandoned tab is
exactly the ghost the window hunts, so there a hand is required.

**The audio is not attention, in either direction.** Somebody else being
audible used to refresh the clock. The person being talked at may have walked
away, and the phone in their pocket hears the voice perfectly well. What
protects a silent listener is `subscribeable` — another occupant, a track
playing, a party playing — so presence ends only when somebody is inattentive
*and* alone. Two pocketed phones satisfy that predicate and are removed by Rule
A instead, which retires a room where nothing is published unmuted.

**A clock per person per channel** — taken the other way first, for about an
hour, and corrected by Rodrigo in one sentence: *the same user is stepped out
of different channels at different times.*

One stamp per person is simpler and reports the wrong thing. It says somebody
is holding their phone, which is the same fact in every room they belong to, so
every roster would say the same words about them — *away 4 minutes* in the
channel they left five minutes ago and in the one they have not opened since
Tuesday. The difference between those two is most of what a roster carries.

What a device attends is therefore named rather than assumed, and it is two
rooms: **the one on screen**, because looking at a room is attending it, and
**the one it is standing in**, because presence is a claim actively maintained
and a phone in a hand is what says somebody is still there to maintain it.
Reading Home holds the conversation you are in and nothing else.

The consequence to know: **a declaration in a channel you are not looking at
ages normally.** Being nearby in one room while busy in another lapses at
fifteen minutes, as it did before any of this. Nearby is a claim about a room,
and the clock now agrees.

It is still a disclosure, and scoping it is what keeps it a small one: the
people in a channel learn when somebody was last attending *that* channel,
rather than everybody who shares any channel learning when they last touched
their phone.

**The roster shows it, in the same change.** Sending a clock nobody displays
would have shipped a number whose only consumer was a false sentence: *Stepped
out 4 minutes ago* backed by an attention clock is simply untrue. The word and
the number are one statement, so *away 4 minutes* and *nearby 20s* arrived
together with the clock.

## What it cost

**A message of its own**, `{ type: 'attentive' }`, rather than reading
attention off the traffic already arriving. A `ping` says the process is alive,
which a pocketed phone with an open microphone also says. Rate-limited by the
sender to `ATTENTION_REPORT_MS`; a scroll would otherwise send one per frame.

**An echo cadence**, `ATTENTION_ECHO_MS`. The stamp is read by every roster in
every channel the person belongs to, so pushing at the rate it moves would fan
a snapshot out per report per channel per member. A minute-stale stamp still
draws a correct clock, every countdown here being a stamp plus a local tick.
`NEARBY_ECHO_MS`, invented that morning for the same problem one rung down, is
now the special case.

**`isWaiting` collapsed to membership.** It applied the window itself, on a set
the server never pruned. The server prunes now, so a second judge could only
disagree with the first — and did, in the direction that matters: somebody
nearby and demonstrably attentive for twenty minutes was struck out at fifteen
on every reader's screen.

**A gate rather than a floor**, `ATTENTION_BUILD`. Builds that do not report
get no clock seeded, so nothing decides about them; they go on deciding for
themselves. Treating silence as inattention would have retired every old
install fifteen minutes after the deploy. SHIMS.md carries what leaves with it.

## What is not built

The rest of `planning/NEAR.md`: the *stand by* verb, renaming the states to
present / absent / nearby, and `nearby auto` + foreground → present. The last
needs its own argument — the ghost-presence bug `server/__tests__/presence.test.ts`
exists to prevent is the same transition, and "opening The Floor" onto Home
would re-enter a channel nobody is looking at.

Guests are unaddressed. Their cards show a status, and their connections could
report; nothing decides about them today, which is a gap rather than a
decision.

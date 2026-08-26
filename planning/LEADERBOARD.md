# The Leaderboard Of One's Contacts

A design for work not yet done. TASKS.md names it in a line; this is what that
line turns out to mean, and why. Nothing here is built — when it is, what was
decided moves to DECISIONS.md and this file goes.

## Context

The standings shipped gated on an `accounts.leaderboard` column, set by hand
with `bin/db --write` and held by nobody by default. **That gate is not a
feature.** It is the only answer anybody had to the objection that killed the
web version of this screen, recorded in DECISIONS.md § *The standings are in
the app, behind a column set by hand*: a list of real people's names is exactly
what `/privacy` and `/support` promise in writing does not exist here, and a
board of the whole population is a directory whether or not it asks for a
credential first. So the screen could only be shown to somebody trusted by
hand, and `LeaderboardView`'s own header calls it *the only screen in this
application that shows you people who have not agreed to be shown to you*.

**Scope the board to the reader's own contacts and that sentence stops being
true.** Every name on the screen arrived because two people said yes to each
other. Nothing is disclosed that a contact list does not already disclose, so
there is nothing left for the column to protect, and the screen can be open to
everybody. That — not the filtering — is the point of this change. The
filtering is the mechanism; the deletion of the gate is the feature.

The change is small in code and large in what it settles, which is the usual
ratio for anything that touches who may see whom.

---

## The three questions, answered

TASKS.md raised three. Two turn out to have answers that fall out of what is
already shipped, and the third is a genuine choice.

### Who is on it: accepted contacts, and you

Accepted contacts only. `ContactStatus` distinguishes `accepted` from
`outgoing` and `incoming`, and only the first is a relationship both people
agreed to — the whole premise here is that agreement is what licenses the row.
A board is also a bad place to learn that somebody has a request open in either
direction, which is the fact `pending_invites` and `contactsFor`'s
address-in-the-name-slot both exist to avoid answering.

**And you are on it**, always, marked as yourself. A ranking you are absent
from is a ranking of other people; the reader is the one account whose number
they are entitled to without qualification.

There is no tombstone case to handle, and it is worth writing down why rather
than defending against it: deleting an account runs `DELETE FROM contacts WHERE
a_id = ? OR b_id = ?`, so a tombstone is nobody's contact by the time anything
could list it. The scope set cannot contain one. The *counts* still walk
through tombstones, exactly as `invitedCount` documents.

### What the number means: unchanged, the whole-graph closure

This looked like the question with teeth and is not, because the disclosure it
worries about has already been made somewhere else.

`profile()` returns `invited: this.invitedCount(row.id)` — the transitive
closure over the entire graph — and a profile is readable by a contact. So for
every account that can appear on a contacts board, **the reader can already
open a screen showing exactly this number.** A board that recomputed a smaller,
reader-scoped count would not be protecting anything; it would be publishing a
second, different number for the same fact, one tap from the first.

That also disposes of the alternative on its own merits. A reader-scoped count
reads as wrong to anybody who knows their own real total and finds a smaller
one on a friend's screen, and it makes two people's boards disagree about a
third person for reasons neither can see. The existing note under the list
already says what the number is — *everybody who signed up from that person's
invitation, plus everybody those people went on to invite, all the way down* —
and it stays true verbatim.

**So the rows are scoped and the numbers are not**, deliberately. The reader
learns how many people a contact brought in, some of whom they cannot see.
That is a fact about their contact, already available on their contact's
profile, and it is the fact that makes the board worth opening.

### Whether it is still a ranking: yes, and zeros appear

The shipped query drops accounts with a count of nought by construction — an
account nobody arrived through is in no pair — on the grounds that a list whose
tail is every account that ever existed, all reading zero, is a list of
accounts rather than a ranking. **That reasoning does not survive the change of
scope, and the reason is worth being precise about.**

Against an unbounded population, an absent name says nothing, because the
reader does not know who exists. Against a contact list of a dozen, the reader
knows the population exactly. Omitting the zeros does not hide them; it says
*this person invited nobody* while pretending to be a filter. The board is
bounded, the reader can enumerate what is missing, and a screen that goes empty
for somebody with eleven contacts is worse than one that shows eleven honest
noughts.

So **every account in scope appears, including at zero**, sorted by count
descending and then display name, as today. The empty state survives only for
somebody with no contacts at all, and it should say that rather than saying
nobody has invited anybody.

---

## What is built

### One route, two scopes, and the flag changes meaning

`GET /leaderboard` stops refusing. It answers everybody, and **what it answers
depends on the column**:

- no `leaderboard` column — the reader, plus their accepted contacts.
- `leaderboard = 1` — the whole population, exactly what ships today.

The column therefore stops being an entitlement to *the screen* and becomes an
entitlement to *a wider scope*. It keeps the property that made it worth
copying from `debug`: nobody has it, no screen grants it, it is read fresh per
connection. What it no longer does is decide whether anybody may look at their
own contacts, which was never something worth deciding by hand.

**The response says which one it is**, rather than leaving the client to infer
it from a flag it was told at `hello`:

```ts
export interface LeaderboardView {
  /**
   * Whose invitations these are. `contacts` is the reader and the people they
   * have both said yes to; `everybody` is the whole population, which only an
   * account with the column set can be sent.
   *
   * Absent from a server that predates the contacts board, and read as
   * `everybody` — that is the only board such a server ever answered, and it
   * answered it only to somebody granted this.
   */
  scope?: 'contacts' | 'everybody';
  entries: LeaderboardEntry[];
}
```

The server decides the scope and the client renders it, which is this
application's rule everywhere else. A screen whose contents differ by account
is worth being nervous about; the cure is that it says so on the screen, not
that the client reconstructs it.

`LeaderboardEntry` does not change. It already carries `PublicAccount` rather
than a bare name so a row can be tapped through to a profile — and on a
contacts board **that tap now always succeeds**, where on the global board it
usually refuses. The shape was right before there was a reason for it.

### The way in

The button below *Chip in* on Home appears for everybody. `HomeView`'s
`onOpenLeaderboard` stops being conditional on `app.leaderboard`, and the
`canSupport || onOpenLeaderboard` guard on the whole *Support* section
collapses to `canSupport`, since the second half is now always true — worth
doing rather than leaving a condition that reads as though it could be false.

`hello`'s `leaderboard?: boolean` stays on the wire and keeps its shape, but
its meaning narrows to *this account may see the whole population*. Nothing in
the client needs it to open the screen any more; leave it, because the route's
answer is what governs and a client-side copy of a scope decision is exactly
what the `scope` field above exists to avoid. Update the protocol comment,
which currently says the flag decides whether to offer the screen.

### The screen

`LeaderboardView`'s header comment is the part of this change that most needs
rewriting, since it presently documents the opposite policy at length. The
rendering differences:

- The heading stays *Invitations*. Under it, one line naming the scope — *Among
  your contacts* — so that two people comparing screens can see why they
  differ. On the `everybody` scope, nothing, as now.
- Your own row is marked. Position numbers stay as they are, one per row rather
  than shared ranks, for the reason already in the stylesheet: equal counts
  getting the same number would be inventing a competition nobody entered.
- The empty state becomes about having no contacts, not about nobody having
  invited anybody — with zeros included, the only way to an empty contacts
  board is an empty contact list.
- The explanatory line under the list is unchanged, and now carries more
  weight: it is the only thing on the screen that says the number is not scoped
  the way the rows are.

### The query

`accounts.leaderboard(limit)` keeps its recursive CTE untouched. The scoped
version is not a second query:

1. Run the closure as today, which gives every account with a count of one or
   more.
2. Build the scope set — the reader, plus `contactsFor(userId)` filtered to
   `accepted` and to rows with a real `account.id` (an outgoing request's id is
   the empty string by construction).
3. Keep the rows in the set; add a zero row for every member of the set the
   closure did not return; sort by count then display name.

Padding in TypeScript rather than in SQL because the set is a dozen and the
alternative is a `LEFT JOIN` against a values list to preserve the zeros —
more SQL to make the same shape. **The limit is applied after the padding**,
not by the inner query, or a reader whose contact sits at position 101 of the
global board loses them; on the contacts scope the limit is close to
meaningless anyway.

Name it `leaderboardFor(viewerId, limit)` alongside the existing
`leaderboard(limit)`, rather than overloading one function with a nullable
viewer. Two callers, two intents, and the global one is the operator's.

---

## Order of work, and the deploy

The wire moves, so it is the ordinary two-step AGENTS.md insists on, and it
happens to be free here.

**Server first, and it breaks nothing.** A shipped client only shows the button
when `hello` set the flag, and a flagged account still receives the
`everybody` scope from the new route — the same rows in the same order, plus a
`scope` field it ignores. An unflagged shipped client would now be answered
rather than refused, and never asks. So the server can go out alone, and should,
before any of the client work.

**Then the client**, in one build: the unconditional button, the scope line,
the self row, the empty state, the header comments. A new client against an old
server is not a case that arises in this project's deploy order, but it fails
safely if it ever does — the old server 404s an unflagged reader and the screen
shows the error it already shows.

Nothing here touches `MIN_SUPPORTED_BUILD`. No shim is added and none is
removed.

### Tests

- `server/__tests__/invited.test.ts` — the `the invitation standings` describe
  block is written around the gate, and its first case, *is refused to an
  ordinary account, as a 404*, is now false by design. It becomes: an ordinary
  account is answered with the `contacts` scope; a granted one with
  `everybody`; no token is still a 401. Add: a contact who has invited nobody
  appears at zero, an `incoming`/`outgoing` request does not appear at all, and
  a contact's count is the whole-graph closure rather than the reader's view of
  it — that last one being the decision most likely to be "simplified" later by
  somebody who reads the scoping and assumes the count should match.
- `app/src/ui/__tests__/views.test.tsx` — *offers the Leaderboard from Home
  only when there is a way in* inverts to always offering it, and the
  neighbouring case about keeping it when there is nowhere to give stays. The
  `LeaderboardView` cases gain the scope line and the empty-contact-list state.
- `core/` is untouched. This is entitlement and presentation; there is no rule
  about a channel in it.

---

## What is deliberately not in this

- **A global board for everybody.** The column stays, and stays hand-set. This
  design removes the gate from the reader's own contacts, which needs no gate;
  it does not conclude that the directory objection was wrong.
- **Any way to ask for the wider scope.** No setting, no request flow. The same
  reasoning as `debug`: a screen nobody can ask for is one nobody has to be
  told no about.
- **Second-degree scope** — your contacts' contacts. It is the obvious next
  widening and it is a directory with extra steps: those people did not say yes
  to *you*. If it is ever wanted, it wants the reasoning in `radiate`'s terms
  rather than this file's, and TASKS.md § *Introduce Radiate* is where the
  distance metric already lives.
- **Caching.** Read on open and held nowhere, as now. A ranking is wrong the
  moment anybody signs up, and the contacts scope is if anything cheaper.

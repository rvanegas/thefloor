# Everybody sees the same recency

2026-11-12, reversing the half of *Home counts other people, and marks your own
step-in separately* (2026-08-26, in
`archive/DECISIONS-2026-08-24-to-2026-08-27.md`) that made the number leave you
out. The mark that decision added stays.

A channel row on Home that nobody is in says how long ago somebody was there,
and the list is ordered by the same moment. **That moment is the room's own,
`lastPresenceAt`, the reader included**, so every member looking at the same
channel reads the same interval.

## What it replaced, and why

From 2026-08-26 both the line and the order read `lastPresenceByOthers`, the
same fold with the reader's key taken out. The argument was that presence is
exclusive: stepping into one channel to announce yourself and then into the
next left the first at the top of Home, above a room two other people had spent
an hour in yesterday, and what somebody scanning the list wants is what they
missed.

It made the line a different claim for each person reading it. A room you had
just left read as days old to you and as a minute old to everybody else, and
the number on a row stopped being a fact about the room. The trade taken now is
the old complaint back, a solitary visit rising to the top, in exchange for one
answer per channel.

## What stayed

- **"Nobody else yet"**, for a channel nobody but the reader has ever been in.
  That is a fact worth words rather than an interval measuring the reader's own
  visit back to them, and it is now the only thing on the client that reads
  `lastPresenceByOthers`, and only whether it is null.
- **The step-in mark** (`steppedInAt`, `↗`). The interval says somebody was here;
  the mark says it was you. It still orders nothing.
- **Never-used channels at the bottom, by name.** Their stamp is when they were
  created, which is not a visit.

## What went

- **The middle tier of the sort**, the channels only the reader had been in,
  placed below every channel somebody else had used. It existed only because
  those channels had no number under the old measure. They now sort by
  `lastPresenceAt` among the rest, while their row still says "nobody else yet".
- **The older-server fallback** as a separate path: `lastPresenceAt` is read
  whatever the server sends, so there is nothing to fall back from.

## What changes as a side effect

- **A guest's visit can now move a row.** `lastPresenceAt` folds in
  `lastActiveAt`, which a guest's entry and exit stamp; `lastPresenceByOthers`
  never saw guests. The 2026-08-26 decision that Home's recency is a claim
  about members was a property of the number it read, and goes with it.
- **Builds already installed keep the old behaviour** until they update. The
  change is entirely in the client: the wire is unchanged, the server goes on
  sending `lastPresenceByOthers` as a moment, and the builds between 2026-08-26
  and this one draw and sort on it. Nothing needs a shim and nothing breaks;
  two people on different builds can read different intervals for the same
  room until both have updated.

The code is `describeQuiet` in `app/src/ui/availability.ts` and `byIdleness`
in `app/src/ui/ChannelsView.tsx`; planning/STATES.md § *How recent a channel
is* is the standing description.

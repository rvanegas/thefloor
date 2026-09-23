# Big files cost an agent differently than a human

Asked on 2026-09-23 whether `channels.ts` (7,460 lines) and `ChannelView.tsx`
(6,634) should be broken up, and then whether the convention against long files
means anything at all when the reading and writing is mostly done by agents.

**The line counts overstated it by about half.** `channels.ts` was 49% comment,
`ChannelView.tsx` 40%, `core/channel.ts` 58%. The code was 3,489 and 3,702
lines. Splitting on the raw number would have moved prose away from what it
explains, which is the one thing those files do well.

**Most of the human case does not transfer.** There is no scrolling and nothing
to hold in your head: `grep -n` then a range read costs the same in a
7,000-line file as in a 200-line one. What does transfer is the merge surface —
several sessions work this repository at once from separate worktrees, so two
of them in one enormous file collide where two files would not.

**One cost has no human analogue: a plain read stops at 2,000 lines and drops
the tail silently.** A human scrolls to the end; a session reads the first
2,000, concludes a function is absent, and is wrong about the file rather than
about the tool. The limit was already known here — it is why `DECISIONS` could
not stay one append-only volume — but it had only ever been applied to
`planning/`, never to source, and by 2026-09-23 fourteen tracked files were past
it. AGENTS.md § *The shape of it* now says so. **It is a reason to read in
ranges, not on its own a reason to split a file.**

**And one argument runs the other way.** A human scrolling to a function sees
the three above it, one of which is the invariant they were about to break. A
session reading a targeted range gets no such peripheral vision, so scattering
coupled logic across small files is *worse* for an agent than for a person:
grep returns what you asked for and nothing around it. The useful question is
not how long the file is but whether it can be changed correctly by somebody
who read only the range they landed in — which is why most of `ChannelRegistry`
stayed where it is.

## What was actually moved, and what was not

Two extractions, neither of them justified by length:

- **`server/src/mixes.ts`** — `startMix`, `dropHollowStems`, `mixesSettled`,
  `mix`, `recordingAudio` and `mixKeyFor`, as a `Mixer` the registry owns. The
  only cluster in that class keyed by a recording rather than by channel state:
  it borrows five dependencies and `emit`, holds the in-flight map itself since
  `mixesSettled` is all that asks, and touches none of the registry's several
  dozen maps. `channels.ts` 7,460 → 7,230.
- **`app/src/ui/channelCards.tsx`** and **`channelStyles.ts`** — the eight
  sibling components below the screen, which were already top-level functions
  closing over nothing, plus the sheet both halves draw with. The sheet was
  kept whole: eight of its seventy-two keys are used on both sides, and a
  three-way split is three places to look for one name. `ChannelView.tsx`
  6,634 → 4,813.

**`ChannelRegistry` itself was left alone, deliberately.** The obvious next
candidate is the guest and seat flow, about a thousand lines — and it reaches
24 distinct members including `channels`, `apply` and `emit`, the core mutation
path. Moving it means passing `this` across a file boundary: a file gained, no
coupling lost. The same is true of most of the rest.

**So was the body of `ChannelView`** — 22 effects and 11 pieces of `useState`
over one screen's shared state. Breaking that into subcomponents means
prop-drilling a dozen values or adding a context. If it ever becomes the actual
pain, the move is to extract *hooks* owning coherent slices, which is a real
refactor with real risk rather than a file move.

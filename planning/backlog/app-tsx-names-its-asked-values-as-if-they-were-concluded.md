# App.tsx names its asked values as if they were concluded

From planning/AUDIO-PRESENCE-REVIEW.md, a survey of 2026-09-07 whose other
findings the 2026-09-08 stepping-in redesign made moot; this section was the one
it left standing. Re-checked 2026-10-03: `app/App.tsx` still declares
`const micNeeded` and `const hasAudio` (around :238 and :278), the same names
`useSessionAudio.ts` uses for its wider, *concluded* values, and GLOSSARY.md
still has no entry for any of the family.

**The smallest fix is option 1 below and is inert.** Do not let any of it
become a merge of the two senses — § *The two senses* is why.

**Seven names, four levels, one collision.** The levels are real and sound; they
are simply not visible as levels.

| level | name | what it is |
| --- | --- | --- |
| 1 rule | `microphoneNeeded` / `channelHasAudio` | pure, `core/micNeeded.ts` |
| 2 asked | `micNeeded` / `hasAudio` in `App.tsx` | rule + `recordingAsked` |
| 3 concluded | `micNeeded` / `hasAudio` in the hook | + `holding`, `waitingAlone`, `inputAvailable` |
| 4 published | `SessionAudio.micOpen` | concluded `&& !selfMuted` |

**Levels 2 and 3 share names, and level 3 is strictly wider.** That is the whole
confusion. The hook already has a good convention — `xAsked` is what the caller
asked for, `x` is what the hook concluded — and it holds for `selfMutedAsked`,
`hasAudioAsked`, `micNeededAsked`. `App.tsx` is the file that breaks it, naming
its locals `micNeeded` and `hasAudio` when by that convention both are *asked*
values.

Renaming those two locals to `micNeededAsked` / `hasAudioAsked` is inert, is two
lines plus two call arguments, and removes the only true collision.

Also loose, in ascending order of how much they matter:

- `STATES.md` calls level 4 `micOpen`, a fifth name for the family.
- The file is `core/micNeeded.ts`, but its exports are `microphoneNeeded` and
  `channelHasAudio` — named after one of its two exports, abbreviated
  differently from that export.
- **`GLOSSARY.md` has no entry for any of them.** Not `micNeeded`, not
  `microphoneNeeded`, not `channelHasAudio`, not `hasAudio`. Per AGENTS.md the
  glossary is the source of truth for the vocabulary, and this is four names for
  three concepts with one collision — precisely what it exists for.

## Three options, in ascending size

1. **Name the levels only.** Apply the `Asked` convention in `App.tsx` and stop.
   Two production call sites change; core, tests and prose keep their names.
2. **Also rename the core predicates**, after what each *decides* rather than
   what it describes, so the pair stops sounding alike. Only two production call
   sites, but roughly thirty test and prose references follow.
3. **Collapse to one call, two fields** — `audioWanted(channel, me) -> { publish,
   call }` — so the senses are fields that cannot be mistaken for one another and
   are always computed from the same state.

**The constraint on all three**, from `STATES.md` § *Mic Open*: *"There are two
senses of this state and they are both wanted… Do not collapse them."* That
forbids merging the two **questions**, not computing them in one place — so
option 3 is compatible with it, and arguably serves it better than two
similarly-named functions do.

## The two senses, since the phrase is easy to misread

`microphoneNeeded`/`micOpen` decides whether **we publish**. `channelHasAudio`
decides what configuration **everyone's session is in**. They diverge in exactly
three places:

| situation | `channelHasAudio` | `microphoneNeeded` | `micOpen` |
| --- | --- | --- | --- |
| two people, I am self-muted | true | true | **false** |
| guest with no speech grant | true | **false** | false |
| alone, playback playing | true | **false** | false |

Collapse toward *publish* and a guest, or a solo listener with playback, gets
`IDLE` — an arriving voice then lands on the media volume rail, which the
`WAITING` decision of 2026-09-05 exists to prevent. Collapse toward *has audio*
and you open a device microphone for a guest whose token cannot publish — the
full call-profile handover, paid to publish nothing.

---

# The follower rests only on agreement

Every fault the watch party's follower had in September had the same shape. The
loop came to rest while its player was not where the room wanted it, and
nothing in the loop would ever disturb that rest. They came in three kinds:

- **A false "done".** The loop believed the player had arrived. Examples: a
  finished film ignoring Play (`hasArrived` was true for `ended` whatever was
  asked), a dead page's last `paused` reading never ageing out, and an advert's
  clock taken for the film's.
- **A false "wait".** The loop knew the player had not arrived, but its rule
  said to be patient with no limit. Examples: a player stuck in `buffering`
  from a standstill, whose cold nudges kept restarting the stall clock so the
  rescue never fired (build 327, 23 seconds), and a player started before the
  audio session was ready (build 312).
- **Deafness.** An outstanding instruction's wait was served out after the room
  had asked for the opposite (build 277).

Each was patched where it was found: an obedience window, a stall window, a
cold nudge with a clock of its own, `urgent`, staleness on readings. Each patch
was a way out of one particular false rest. Rodrigo asked for the class to be
closed instead.

## The rule

**The loop may rest without limit only in agreement. Every other rest has a
deadline, and every deadline leads up a ladder whose top is visible.**

Agreement means a fresh reading, of the film (not an advert), whose state
matches the room's, from a player that is *placed*. Since
2026-10-03-nobody-corrects-drift.md, agreement is a state and not a position.
A placed player may drift. Placement is checked once per jump (`inPlace`): a
screen arriving, a rebuild, the film back from an advert, a scrub or a replay.
It is observed, never assumed because a seek was sent.

The other rests, each with its deadline (`core/constants.ts`):

| Rest | What the loop is waiting out | Deadline |
|---|---|---|
| `waiting` | an instruction | `WATCH_RUNG_MS`, 3s |
| `buffering` | a refill mid-film, on the first rung only | `WATCH_STALL_MS`, 10s |
| `handover` | the iOS audio session changing hands for a Play | `WATCH_HANDOVER_WAIT_MS`, 4s |
| `advert` | a pre-roll | its own length + 10s, else 60s |
| `silent` | a page with no fresh reading | `WATCH_SILENT_MS`, 3s |
| `rebuilding` | a rebuilt page coming back | `WATCH_REBUILD_MS`, 15s |

The ladder (`stepFollow` in `core/watch.ts`). Each rung is entered when the one
below runs out of time, and its action is taken once, on entry:

| Rung | Action | Entered when |
|---|---|---|
| 0, told | play or pause, plus a seek if unplaced | disagreement first seen |
| 1, told again | the same, recomputed; `play` to a buffering player | rung 0's deadline passed |
| 2, seek and play | a seek to the room's position and the state | rung 1's deadline passed |
| 3, rebuilt | the page rebuilt (`recover`), and the new player told once | rung 2's deadline passed, **or** the page was silent past its deadline |
| 4, given up | nothing more; *The film stopped responding on this device* over the picture | the rebuild did not bring agreement, or was refused, or there is none; an advert that never ended |

**A change in what the room wants starts the ladder again from nothing**, and
that is the only interruption. The key is the wanted status and a count of the
room's jumps. A press made here and the snapshot that confirms it share a key,
so the confirmation does not restart the climb. **Agreement ends the climb
wherever it is.**

The property is tested directly. The core suite steps the rule over every
reading a player can give (silent, cued, buffering, paused, ended), placed and
not, and checks that each ends in agreement or on rung 4 within a bound. The
transport harness drives it end to end with players that freeze, latch, stall
and stick.

## What it replaced

The obedience window (`WATCH_OBEDIENCE_MS`), the separate stall and nudge clocks
(`WATCH_COLD_NUDGE_MS`), `urgent`, the `sending`/`watching` phases,
`followInstructions` and `hasArrived`. Their reasoning survives where it still
applies:

- **A refill mid-film is not thrown away.** Rung 0 tells a player that stalled
  while playing nothing, for the long window.
- **A press is answered at once.** A buffering player that is not refilling,
  including one stuck under a paused room, is told `play` on rung 0. That costs
  it nothing, and build 277 had Play waiting out a whole stall window.
- **The rescue is `seek+play`**, the one instruction recorded as moving a
  wedged player.
- **Seek-then-pause for a cued or ended player**, because a seek starts one.
- **The replay clause.** An ended player agrees with a run only while the room
  agrees the film is over.

## Also in this change

- **Readings are stamped by the page.** The page puts `at: Date.now()` on every
  reading. The page and the app share the device's clock, so the app ages a
  reading by the stamp rather than by when the message crossed. It refuses a
  reading past `READING_STALE_MS`, and moves a playing position on by the
  reading's age rather than reporting the age as drift. The report rate stays
  at 250ms.
- **The ladder is shown to `debug` accounts.** `DriftReading` carries `rung`,
  `rest` and `rungForMs`, and the readout has a *ladder* row: *agreed*, or the
  rung, its time and what it is waiting out. It turns red from rung 2. Other
  screens' lines carry their rung, relayed through `SharedDrift.rung` and
  `.rest`. Both are optional and validated by the server field by field. The
  journal gets `watch rung N (name): why` on every climb, and keeps
  `watch playing after Nms` (the walk's pass mark), now measured from the first
  instruction of a climb to agreement.
- **Rung 4 is said to everybody.** On native it uses the refusal's own strip,
  and on the web an equivalent overlay. The text is in both catalogues
  (`watch.gaveUp`). The follower does not run while YouTube has refused the
  video, since the refusal is already the visible end.
- **The web player can be rebuilt.** Until now only native could, and only when
  iOS announced a dead process. `recover` now answers whether it rebuilt, so a
  rebuild refused by `REBUILD_COOLDOWN_MS` (20s) or by a refusal sends the
  ladder to rung 4 rather than into a wait for a rebuild that is not coming.
- **The native follower stands down while the app is behind.** A backgrounded
  `WKWebView` has its JavaScript suspended while the app may go on running (the
  microphone is retaken on the way out). A ladder that kept climbing would
  rebuild a page that was only asleep, and greet the return with the given-up
  notice. It starts afresh when the app comes back.

## Left open

- **A page that never becomes ready** is not the follower's to judge. Before
  the first `ready` there is no port, and the ladder only runs without one once
  a climb is under way. A player whose API never loads stays black, as before.
- **Rung 4 tells the server nothing.** `WATCH_FAILED` still exists in core with
  nothing raising it. Whether one device giving up should change the room is
  the question the walk's known-unknowns already ask about refused videos.
- **The deadlines are first guesses** against what has been measured: a resume
  at about 1.2s, a seek at 400–700ms, a cold start at 563ms. The readout's
  ladder row is what will show whether they are wrong.

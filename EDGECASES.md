# Edge cases

A review list for the floor mechanic, session lifecycle, and recording rules.
Written against `the-floor-app-spec.md` and the implementation in `core/`.

Sections 1–2 are the things to *check*; section 3 is where the spec needed a
reading, and section 4 is defects found while compiling this list.

---

## 1. Covered by tests

These have assertions and boundary checks. Listed so a manual pass can skip
them, or so a behavior change tells you which test should have caught it.

### Floor eligibility — `core/__tests__/floor.test.ts`

| Case | Expected | Test |
| --- | --- | --- |
| First claim of the session | Either party may claim; condition 2 is vacuous | *lets either user make the first claim* |
| Claim while someone holds the floor | Blocked for both parties | *blocks a claim while anyone holds the floor* |
| Silenced party tries to claim | Blocked — double-silence is structurally impossible | *makes it impossible for both users to be silenced at once* |
| Other party claims right after a release | Allowed immediately, no wait | *lets the other user claim immediately after a release* |
| Same party reclaims at exactly 60.000s | **Blocked** — spec says *more than* one minute | *makes the same user wait out the one-minute cooldown* |
| Same party reclaims at 60.001s | Allowed | same |
| Self-muted party's eligibility | Unaffected, as if speaking normally | *is unaffected by self-mute* |
| Claim while alone in the session | Control disabled | *disables the claim control while a user is alone* |
| Claim at exactly 3:00 | Auto-released at the mark, not before | *auto-releases at exactly three minutes* |

### Emergent behavior

| Case | Expected | Test |
| --- | --- | --- |
| Both parties at maximal use | Strict alternation, zero gap, exactly equal totals | *produces strict gapless alternation under maximal mutual use* |
| One party never claims | Other may reclaim repeatedly, subject only to their own cooldown | *lets one party repeatedly reclaim when the other never claims* |

### Leaving, presence, lifecycle

| Case | Expected | Test |
| --- | --- | --- |
| Floor-holder leaves | Claim force-released, same as voluntary | *force-releases the departing holder's claim* |
| Holder leaves, then re-enters | Still owes their own cooldown — leaving is not an escape hatch | *applies the ordinary eligibility rule to whoever re-enters* |
| Non-holder leaves mid-claim | Holder keeps the floor | *leaves the other party's claim untouched* |
| Initiator waits alone indefinitely | No timeout while anyone is present | *does not run the empty-session timer while anyone is present* |
| Session becomes empty | Auto-ends at exactly 60s | *auto-ends one minute after becoming empty* |
| Re-entry during the empty window | Cancels the timer | *cancels the empty-session timer on re-entry* |
| Explicit end by an absent party | Allowed; irreversible; re-entry blocked | *ends explicitly and irreversibly, from either party, present or not* |

### Recording — `core/__tests__/recording.test.ts`

| Case | Expected | Test |
| --- | --- | --- |
| Recording at session start | Idle — never automatic | *is not automatic* |
| Start before the invitee has ever joined | Blocked | *waits until both parties have connected* |
| Start after the other party has left | Allowed | *stays available after one party leaves, once both have connected* |
| Pause/stop by the silenced party during a claim | Blocked | *withholds pause and stop from the silenced party during a claim* |
| Pause/stop when nobody holds the floor | Allowed for both | *leaves both parties free to pause and stop when no claim is active* |
| Claim expires mid-recording | Silenced party's controls come back | *restores the silenced party's controls when the claim ends* |
| Elapsed time across pauses | Paused time excluded from the total | *accumulates recorded time across pauses, excluding paused time* |
| Both parties leave while recording | Recording continues through the empty window | *keeps running while the session sits empty* |
| Empty-session auto-end while recording | Recording finalized, duration includes the empty minute | *finalizes when the empty session auto-ends* |
| Explicit end while recording | Recording finalized | *finalizes when the session is ended explicitly* |

---

## 2. Not covered — worth a manual pass

No assertions exist for these. Ordered by how likely they are to be wrong.

1. **Two time-driven transitions in one tick.** If a claim's 3:00 expiry and the
   empty-session 60s deadline fall in the same `TICK`, `reduce` handles floor
   expiry first, then the auto-end. Only reachable if a holder's connection
   drops without a `LEAVE` — worth confirming the ordering is what you want.
2. **Claim attempted in the same instant the session auto-ends.** The guard
   checks `status === 'active'`, but the interleaving of a user tap against the
   500ms backend tick is untested.
3. **Chained alternation with early voluntary releases.** The alternation test
   only exercises full 3:00 turns. A → releases at 0:30 → B claims → B releases
   at 0:10 → can A claim? (Should be yes: B was the last claimant.)
4. **Both parties leave, then one re-enters after 30s, then leaves again.** Does
   the empty timer restart cleanly from the second departure, or carry stale
   `emptySince`? Believed correct — `emptySince` is set fresh on each departure
   that empties the session — but untested.
5. **Recording paused, then the other party claims the floor.** Resume is
   deliberately unrestricted (see §3), so the silenced party can resume but not
   re-pause. Verify that isn't a control that looks broken in the UI.
6. **Self-mute state across leave and re-entry.** `selfMuted` is never reset on
   `LEAVE`, so a user who leaves muted returns muted. Probably right; undecided
   in the spec.
7. **`END` dispatched twice**, or `LEAVE` after `END`. Should be inert — the
   reducer returns early on non-active sessions — but untested.

---

## 3. Spec interpretations open to review

Places the spec was ambiguous and the implementation had to choose. Each is a
candidate for "actually, do the other thing."

1. **"Silenced" vs. "does not hold the floor"** (§Recording, control
   restriction). The spec equates them, but when nobody holds the floor neither
   party is silenced. Implemented per the clarifying sentence that follows:
   pause/stop are withheld **only** from the non-holder **during an active
   claim**. `canPauseOrStopRecording` in `core/recording.ts`.
2. **"After both users have connected"** (§Recording). Read as *ever* connected,
   not *currently* present, so a party left alone can still start a recording.
   Consistent with the spec's insistence that recording survives leaving. See
   `everPresent` in `core/types.ts`.
3. **Resume carries no floor restriction.** The spec names only pause and stop.
   Resuming doesn't cut off the record, so it's unrestricted — a silenced party
   may resume a paused recording. `canResumeRecording` in `core/session.ts`.
4. **Cooldown is strictly greater than one minute.** "More than one minute has
   elapsed" is implemented as `> 60_000`, so re-claiming at exactly 60.000s is
   refused. Off-by-one in the user's favour would be `>=`.
5. **The initiator is present from creation.** `createSession` puts them in the
   session immediately, so the empty-session timer never runs before the first
   join. Matches "the initiator lands in the Session view immediately."

---

## 4. Known gaps

Found while writing this list. These are real, not hypothetical.

1. **Nothing prevents duplicate sessions with the same contact.**
   `startSession` has no guard, so tapping "Start session" on Dana twice creates
   two live sessions, and Dana's Home shows two stacked invite banners from the
   same person. The spec doesn't forbid it, but it's almost certainly not wanted.
   `app/src/mock/backend.ts`.
2. ~~**`activeSessionFor` is dead code.**~~ **Resolved.** Replaced by
   `liveSessionsFor`, which backs a "Live sessions" section on Home. The spec
   requires re-entry (§Session Lifecycle) but lists no Home affordance for it,
   so previously an initiator who left had no route back, while an invitee who
   left reappeared in their own invite list — an accident of the invite query
   that read as a fresh invitation. `invitesFor` is now narrowed to parties who
   have *never* entered. Covered by `app/src/mock/__tests__/rejoin.test.ts`.
3. **Dismissed invites resurrect.** The dismissed list is local `useState` in
   `HomeView`, so navigating away and back re-shows a banner the user dismissed.
   The spec calls the banner "dismissable... persistent until acted on," which
   implies the dismissal should outlive a remount. `app/src/ui/HomeView.tsx:30`.
4. **Timers are wall-clock and unguarded.** Every rule derives from a
   caller-supplied `now` (`Date.now()`). A device clock change, or the OS
   throttling the 500ms interval while backgrounded, will skew countdowns and
   delay an auto-end. Fine for a mock; needs a monotonic clock and a
   catch-up-on-foreground pass before real sessions.
5. **No persistence.** All state lives in one in-memory singleton; a reload
   resets accounts, contacts, sessions, and recordings to the seed.
6. **Contact search is exact-match only.** `findByIdentifier` compares the whole
   string (case-insensitively, trimmed), so `+1555` or `miro` finds nothing and
   `miro@example.com` is required in full. Defensible for a
   phone-number/email lookup — you shouldn't be able to enumerate strangers by
   prefix — but there's no feedback distinguishing "typo" from "no such user."
7. **`authBypass` must be deleted, not merely switched off.** Email delivery now
   works, so the bypass is only load-bearing for phone identifiers. Once SMS
   lands, the flag and the `authBypass` branches it feeds in `server/src/app.ts`
   have to come out of the code. A bypass that survives because a boolean
   defaults to false is the version that eventually ships.
8. **Phone sign-in is refused outright** (`sms_unavailable`), so a phone number
   is currently an identifier you can be *found* by but cannot sign in with.
   Contact search still accepts one, which is a coherent state but a confusing
   one until SMS exists.
9. **Requesting someone who already requested you silently accepts.**
   `sendContactRequest` treats an inbound pending request as an acceptance
   rather than erroring. Reasonable, but it means the pair goes straight to
   `accepted` with no confirmation step. `app/src/mock/backend.ts`.

---

## Running the suite

From the repo root, across both packages:

```bash
npm test           # core (33) + app (12)
npm run typecheck
```

Or one package at a time: `npm test --prefix core`, `npm test --prefix app`.

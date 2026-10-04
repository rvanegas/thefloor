# Untested behaviour

No assertions exist for these. Ordered by how likely they are to be wrong.

1. **Two time-driven transitions in one tick.** If a claim's 3:00 expiry and the
   empty-channel 60s deadline fall in the same `TICK`, `reduce` handles floor
   expiry first, then the auto-end. Worth confirming that ordering is intended.
2. **A claim in the same instant the channel auto-ends.** The guard checks
   `status === 'active'`, but the interleaving of a tap against the 500ms tick
   is untested.
3. **Chained alternation with early voluntary releases.** The alternation test
   only exercises full 3:00 turns. A releases at 0:30 → B claims → B releases at
   0:10 → can A claim? (Should be yes: B was the last claimant.)
4. **Both parties leave, one re-enters after 30s, then leaves again.** Does the
   empty timer restart cleanly from the second departure, or carry a stale
   `emptySince`? Believed correct, untested.
5. **Recording paused, then the other party claims.** Resume is deliberately
   unrestricted, so a silenced party can resume but not re-pause. Verify that is
   not a control that looks broken.
6. **Self-mute across leave and re-entry.** *Closed 2026-08-21.* The spec still
   does not say, so it was decided: every departure clears it, in `stepOut`
   itself rather than case by case, and `connectivity.test.ts` now asserts both
   that and the half that did not change — a mute survives a reconnection
   inside the grace period. decision/ § *Every departure clears
   the self-mute, and the microphone is not the reason why*.
7. **`END` dispatched twice**, or `LEAVE` after `END`. Should be inert — the
   reducer returns early on non-active channels — but untested.
8. **The guest page has never been walked in a browser.** Nothing in any
   package loads `server/web/guest.ts`, so both asks — *be my contact* and
   *join this channel* — the inline sign-in, the two accept routes and the
   `joined` hand-over have been exercised at the server and not through the
   page that calls them. A guest link in one browser, the asking member in
   another, and the sign-in walked with a fresh address so the account
   creation and the hand-over are both real. Added 2026-10-03 from the two
   guest designs, `decision/2026-08-30-asking-a-guest-to-be-a-contact.md` and
   `decision/2026-09-16-three-asks-not-one.md`, each of which asked for it.
   Placed last for numbering's sake; it is likelier to be wrong than any of
   the reducer cases above.

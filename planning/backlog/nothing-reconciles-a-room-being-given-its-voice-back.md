# Nothing reconciles a room being given its voice back

`reconcileSilence` in `server/src/channels.ts` is the floor's standing
correction — it compares what the room is actually carrying against what was
last stated about it and restates the pairs that disagree, once a tick. Its own
docstring says why it has to exist: a `setSilenced` is a statement about a
*track id*, and a client that flaps comes back publishing a new track that the
old statement does not cover.

It begins:

    const holder = state.floor.holder;
    const muted = isPartyMuted(state);
    if (holder === null && !muted) return;

So it runs **only while somebody is being withheld.** Withholding is corrected
every tick; *un*-withholding is not corrected at all. The moment a floor is
released or a film is paused, the predicate goes false and the reconciliation
switches itself off — leaving the restoration resting entirely on the single
best-effort `assertSilence` shot fired from `commit`.

Which is the half `assertSilence` explicitly does not guarantee. Its comment:
"it does not know who is actually in the media room, and a pair it cannot state
— either end absent, the speaker publishing nothing yet — is left to
`reconcileSilence`, which does." It delegates to something that, at exactly
that instant, has just stopped looking. A pair that misses its one shot stays
unsubscribed with nothing behind it and every screen saying the room is open.

Found 2026-09-26 while reading the party-mute path for
decisions/2026-09-26-a-hold-can-move-the-session.md. **Nothing in the shipped
log showed it biting** — the `sub +` landed at every pause in that session — so
this is a hole read off the code rather than a reported fault, and it is
independent of the engine bug that entry fixes. It is the more dangerous
direction of the two: a stranded *withholding* is somebody audible who should
not be, which the reconciliation catches, and a stranded *restoration* is a
room that has gone quiet for good.

The fix is not simply dropping the guard — the reconciliation costs an
`audioTracks` round trip per tick per channel, and running it against every
idle channel forever is what the guard is for. Something narrower: keep
reconciling for a few ticks after the last withholding clears, or key the guard
on *anything stated and not yet unstated* (`silenceStated` is already the
record) rather than on whether anybody is withheld right now. The second is
closer to what the routine is actually for.

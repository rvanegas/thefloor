# The film is a dependency of the session effect

> **Corrected the same day, twice. 2026-09-26-the-film-keeps-its-stereo.md is
> where this report actually ends**, and
> 2026-09-26-a-hold-can-move-the-session.md is the step between. The dependency
> added here is gone with the parameter it named — `useSessionAudio` takes no
> `screening` — so this is a correct rule about something that no longer
> exists. It was **not** what
> was reported: the premise below — that a run ending "moves nothing else at
> all" — is wrong, because a party mute is a server-side *unsubscription*, so
> the pause brings every remote track back and moves `othersAudible`, which was
> already a dependency of that effect. Both directions were masked, not one.
> The reasoning about the two directions failing differently is wrong for the
> same reason. Read the correction first.

Reported 2026-09-26: two people watching a party in the app, one pauses, and
neither can hear the other afterwards. Stepping out and back in restores it.

`screening` became an input to `useSessionAudio`'s microphone effect on
2026-09-23 — it picks `SCREENING` over `CALL` through `wantFor`, and `muted`
over `capturing` through `intentFor` — and was not added to that effect's
dependency array. The fix is the one line; what is worth writing down is why
it was invisible for three days.

**The two directions of the edge do not fail alike.** A run *beginning* is
also the server withholding the room, so every remote subscription drops,
`othersAudible` moves, and the effect is woken by that instead — it then reads
the current `screening` out of the fresh closure and does exactly the right
thing. A run *ending* moves nothing else at all: the pause lifts the mute
server-side and the subscriptions come back, but they come back against tracks
that both devices are holding muted, and there is no other input to the effect
that a pause disturbs. So the entering half worked, by accident, and the
leaving half left both microphones shut with nothing left to reopen them.

That is the general shape and it is why an accidental wake is not a substitute
for a dependency: the wake comes from the media plane, and the media plane is
exactly what is quiet in the state this bug leaves behind.

**Both directions are now pinned**, in `app/src/audio/__tests__/screening.test.tsx`,
which toggles `screening` alone with nothing else about the channel moving.
The entering direction is asserted even though it worked, so that the two
halves stand on the same dependency rather than one of them standing on the
SFU's timing.

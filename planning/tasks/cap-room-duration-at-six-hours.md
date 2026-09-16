# Cap room duration at six hours

End a room six hours after it opens. **Unconditionally, not only while a server
is draining** — that is what makes it worth doing, because it bounds the drain
without there being a drain mode to write. Winding a server down for maintenance
then means refusing it new rooms and waiting: six hours, worst case, with no
migration machinery, no transitional state and no coordination with anybody.

A room that ends can be restarted immediately by whoever is still talking, and
because the node is draining, the new one lands elsewhere. So the cap does the
whole job of the drain and the ordinary case pays for it.

**It is also social guidance, which is most of why it is tolerable.** Six hours
is generously past anything observed, so the population that ever meets it is
small, and the answer to the one question it raises is a sentence that does not
mention servers. Why are you on the phone for six hours anyway.

**Live migration between LiveKit nodes was considered and rejected**, twice
over. The mechanism exists but is Cloud-only — `DisconnectReason.MIGRATION` says
so in `@livekit/protocol`, and the client half ships in the SDKs
(`LeaveRequest{reason: MIGRATION, action: RECONNECT}`, with `SyncState`
reconstituting the session) while the node-side orchestration does not. Building
it on `forwardParticipant`/`moveParticipant` needs an identity-swap dance per
participant, doubles latency through the bridge for the duration, and requires
the floor, presence and recording layers to model a channel that spans two
rooms — see `STATES.md` for how much those layers already cost to keep
honest. A user-coordinated manual migration avoids all of that, by making
quiescence a precondition to check rather than an invariant to preserve, and was
rejected on a different ground: a control like that is explained to everybody
forever and used by almost nobody, and the explanation is about our topology.
A limit explains itself; a mechanism does not.

Open, for whoever picks this up: where the cap is enforced and what the last
minutes look like — whether there is a warning, and what happens to a recording
or a media player still running when it lands. The backlog entry *A migrated
room must carry durations, not stamps* is the residue of the migration argument
and can go if this ships.

# The meter records microphones, and nobody can count turns

**Status:** not started. Found 2026-08-24, writing `bin/live`, which reports
what *is* answerable and says in its header what is not.

An open `usage_spans` row is the only evidence outside the server's memory that
a conversation is happening at all, and `closeStrays` closing every span at boot
is what makes that trustworthy — an open row cannot be a leftover. So "which
channels are live, who is in them, since when" is answerable from the database
alone, to within `USAGE_POLL_INTERVAL_MS`.

**Who is speaking is not.** The `mic` kind means a participant publishes an
audio track: `MediaPlane.audioTracks` does not filter muted ones, so somebody
self-muted and somebody silenced by another's floor claim both count. And the
floor itself is durable nowhere — `durableOf` omits it deliberately, along with
`present` and `selfMuted`, all being facts about the process rather than the
channel, and a restart drops it. The one floor record on disk is
`recordings.floor_timeline`, written per run and only while a recording is
running, so turn-taking is countable exactly for the conversations somebody
happened to record.

The shape, if it is ever wanted: a `floor` span kind, opened on claim and
closed on release from the same transitions that already drive
`assertSilence`. That is cheap — the edges are exact rather than sampled, since
a claim is a transition rather than something polled — and it would make "how
long did each person hold the floor" a query. What it would also do is put a
count of turn-taking in a table, which is the kind of figure worth deciding
about before collecting; the meter's standing rule is that nothing in the
application reads these tables, and that rule is what keeps the collection
honest.

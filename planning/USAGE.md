# Metering what this box actually carries

**Temporary.** This is the design for TASKS.md § *Track Usage*, written before
any of it exists. It goes when the work ships, with whatever is still worth
knowing moving to DECISIONS.md. If you are reading it and the tables described
below are in `server/src/db.ts`, it is stale and should already have been
deleted.

---

## Why

Nothing here measures anything. Every claim this project makes about load is
reasoned rather than counted, and several of them are load-bearing:
`track_cpu_cost: 0.15` in `/etc/livekit/egress.yaml` caps the box at about ten
simultaneous recorded participants, and nobody knows how close it has ever
come. MIGRATION.md argues sizing in both directions on judgement alone. The
deploy history says which builds kept working; it says nothing about what the
server was carrying while they did.

The request is per-user minutes and timestamps for WebRTC, for media playback
including recordings, for recordings attributed to whoever started them, bytes
of egress and export, and minutes of conversation shared by pairs — all of it
expiring after a week.

**What it is not for.** There is no read surface: no endpoint, no protocol
addition, no screen in the app. Two tables and a set of queries to run against
the box. That is deliberate and it is what keeps this instrumentation rather
than a feature — a number nobody can see cannot start deciding anything on its
own.

---

## The four streams, and who is the authority for each

The design rests on one observation: a channel's WebRTC cost decomposes into
four streams, and this server is the authority for three of them. It does not
have to ask LiveKit what it is doing itself.

| Stream | Published by | Authority |
| --- | --- | --- |
| Mic uplink, per person | the phone | **the room**, via `MediaServer.audioTracks` |
| Downlink, per listener | the SFU | derived — present listeners × publishing speakers |
| Playback | **this server's own participant** | `ChannelState.playback` |
| Egress, per stem | **this server's own jobs** | the `capturing` handles |

Only the microphone is published by a device this process does not control, so
only the microphone needs asking about. Polling LiveKit about playback or
egress would be asking it to confirm something this process did itself, and
would introduce a second answer that can disagree with the first for no gain.

**The microphone can be modelled, and the model is not good enough.**
`microphoneNeeded(channel, me) && !selfMuted[me]` is exactly what the app
computes to decide whether to publish, and the server holds every input to it.
The room is created with `stopMicTrackOnMute: true`, so a closed microphone
genuinely unpublishes — mic-open really does name a stream on the wire, with no
third state to model. It would work.

It fails in the case STATES.md § *Audio Connected* is about: the LiveKit room
can be dead while the websocket is alive. A tester hit it on 2026-08-18 when a
Telegram VoIP call seized the audio session — the channel looked live, the
roster was right, and the audio was dead until the app was force-quit. Presence
says a stream exists; there is no stream. The over-count is rare, one-directional
and **unbounded in duration**, since the socket recovers on foreground and the
room does not. Asking the room costs one round trip per occupied channel per
interval and removes the whole class.

`audioTracks` already exists and `reconcileSilence` already calls it once a
tick. It is gated behind a floor claim because *that* consumer needs 500ms
latency. A meter does not.

---

## Shape

Two tables. Spans are opened with a null `ended_at` and stamped when they
close, which is the convention `recordings` already uses and for the same
reason: a span interrupted by a restart has to be recoverable rather than
silently absent.

```sql
CREATE TABLE IF NOT EXISTS usage_spans (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,   -- 'mic' | 'listen' | 'playback' | 'egress' | 'pair'
  account_id   TEXT,            -- null on channel-level spans
  peer_id      TEXT,            -- 'pair' only; ordered by pairKey
  channel_id   TEXT NOT NULL,
  recording_id TEXT,            -- 'egress' only
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,         -- null while open
  source       TEXT NOT NULL    -- 'room' | 'state'
);

CREATE TABLE IF NOT EXISTS usage_bytes (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,   -- 'export' | 'playback-fetch' | 'mix-read' | 'mix-write'
  account_id   TEXT,            -- null when nobody asked for it directly
  recording_id TEXT,
  bytes        INTEGER NOT NULL,
  at           INTEGER NOT NULL
);
```

`source` is not a hedge. It records which authority wrote the row, and the two
authorities are used for different streams on purpose — a `'mic'` row that ever
reads `'state'` means the poll stopped running and the meter fell back, which is
a defect and should be visible as one rather than averaged into a total.

**No migration.** Both tables are new and there is nothing to backfill. There
is no honest figure for a week that was never measured, and inventing one is
precisely what this exists to stop.

### Where spans open and close

`commit` is the chokepoint for everything the server is authoritative about,
and `trackFloorWindows` is the precedent for the shape — open-ended windows
opened and closed off `before`/`after`, in the one place where the state
transition is already known to be real.

- **playback** — on `status` crossing `'playing'`. Note that the playback
  *participant* opens on the first track and stays for the channel's life
  publishing silence between tracks, so that its stem keeps its place in a
  recording. Participant lifetime and playing time are different quantities and
  the meter wants the second one.
- **egress** — one span per identity, opened as it joins `run.requested` and
  closed as it leaves. `commit` already walks that set to stop the stems of
  people who left mid-run. Attributed to the **initiator**, which is what the
  request asks for, and carrying the run id, which is also the recording row id.
- **pair** — on any change to `present`: close the channel's open pair spans and
  reopen one per co-present pair, canonically ordered by `pairKey`.

`mic` and `listen` come from `reconcileUsage`, on its own timer at
`USAGE_POLL_INTERVAL_MS = 15_000`, beside the hourly sweep rather than folded
into the 500ms tick. An identity in the `audioTracks` map with a non-empty track
list has an open microphone; absent or empty, it does not. The playback
participant appears there too and is skipped, being metered from state.

**Sampling error is bounded by the interval and is not corrected for.** A
microphone opened and closed inside one window is invisible, and every span edge
is accurate to ±15s. Over a week of minutes that is noise; over a single
two-minute conversation it is not, and a query that slices this data thinly
enough will find it. It is a sampling rate, not a measurement.

### Restarts

`restore()` calls `closeStrays`, alongside what it already does for stray
recordings. An open span at boot belonged to the dead process, and it is closed
at **its own `started_at`** rather than at boot: the process died at an unknown
moment, and crediting it the whole of the downtime would invent minutes nobody
spent. The span is kept at zero length rather than deleted, because "a span was
open when the server died" is a fact about a restart and worth being able to
count.

---

## Bytes, and what cannot be seen from here

`RecordingStore.get`/`put` are the only paths by which this process moves
recording audio, so the counts are exact where they are visible. They are taken
at the call sites that know who asked rather than inside the store, which does
not: the export route and the play route, both with an account; the stem reads
and the mix write inside `mix`, with none, because nobody asked for those
directly and they are the cost of a recording existing at all.

**Stated bound: stem uploads are invisible.** The egress jobs write to S3 on the
`thefloor-egress` PutObject-only credential, never through this process. Those
bytes — the largest single category, being every participant's raw audio — do
not appear in `usage_bytes` and cannot be made to without a second source. They
are derivable from recorded duration times bitrate, or from S3's own metrics.
A total read off this table is egress *this server served*, not egress the
bucket carried, and the two are far apart.

---

## Expiry, and throwing the early rows away

Seven days, as `USAGE_RETENTION_MS` in `core/constants.ts` — its own constant
beside `DELETED_RETENTION_MS` rather than a reuse of it, because they mean
different things and a future change to one must not silently move the other.
Swept hourly on the existing `sweepTimer`:

```sql
DELETE FROM usage_spans WHERE ended_at IS NOT NULL AND ended_at < ?;
DELETE FROM usage_bytes WHERE at < ?;
```

Open spans are deliberately left alone. One open for more than a week is a leak,
and deleting it would hide the leak rather than the row.

**The early data is disposable and should be disposed of.** The first weeks are
metered across a mixed population, and once everybody is on build 52 or above
the figures from before that are not worth keeping:

```sql
DELETE FROM usage_spans; DELETE FROM usage_bytes;
```

The seven-day sweep reaches the same place on its own a week later. The manual
truncation just makes it immediate, and it is only worth running while the
population is small enough that "everybody has updated" is a checkable claim —
`oldestBuild` on `/healthz` is what checks it.

**Account deletion takes usage with it.** `deleteAccount` removes rows naming
the account in either table, on both `account_id` and `peer_id`. The privacy
policy promises that nothing identifying remains, and a metering row naming a
deleted account would falsify it.

---

## The privacy policy stops being true

`/privacy` currently reads "There is no analytics, no advertising, no tracking
of any kind, and no third-party service that receives your activity." The last
two clauses survive. The first two do not, and the paragraph is rewritten in the
same commit as the tables — privacy.ts's own header says every paragraph is
checkable against the source and that a change to what is stored has to walk
past it. This is the first time that has been tested.

`PRIVACY_UPDATED` moves, since the substance changes and not the wording.

**The page is served live and is not versioned per build**, so there is no
population left reading the old claim while being metered: the moment
`bin/deploy` runs, everyone on every build reads the amended page. That is why
there is no build gate on the meter itself — a gate would only matter if people
had to update in order to re-consent, and a served page does not work that way.

**Which is also why this does not deploy until build 51 is out of App Review.**
The page is under review as it stands. The code can land on master; the deploy
waits.

---

## The queries

Nothing in the codebase reads these tables. These are the point of them.

```sql
-- Minutes per person per stream, over whatever is retained.
SELECT account_id, kind,
       SUM(COALESCE(ended_at, unixepoch() * 1000) - started_at) / 60000.0 AS minutes
FROM usage_spans
GROUP BY account_id, kind
ORDER BY minutes DESC;

-- Conversation minutes by pair.
SELECT account_id, peer_id, SUM(ended_at - started_at) / 60000.0 AS minutes
FROM usage_spans
WHERE kind = 'pair' AND ended_at IS NOT NULL
GROUP BY account_id, peer_id
ORDER BY minutes DESC;

-- Peak simultaneous recorded participants, against the ~10 the egress
-- track_cpu_cost implies. This is the query with an operational answer
-- attached, and the one currently unanswerable at all.
SELECT MAX(concurrent) FROM (
  SELECT (SELECT COUNT(*) FROM usage_spans b
          WHERE b.kind = 'egress'
            AND b.started_at <= a.started_at
            AND (b.ended_at IS NULL OR b.ended_at > a.started_at)) AS concurrent
  FROM usage_spans a WHERE a.kind = 'egress');

-- Bytes this server served, by kind. Not what the bucket carried — see above.
SELECT kind, SUM(bytes) / 1073741824.0 AS gb FROM usage_bytes GROUP BY kind;

-- Did the poll ever fall back? Any row here is a defect.
SELECT COUNT(*) FROM usage_spans WHERE kind = 'mic' AND source <> 'room';
```

---

## One move that is not about metering

`microphoneNeeded` and `anyMicrophoneOpen` live in `app/src/audio/micNeeded.ts`
and import nothing but `core/recording` and `core/types`. They move to
`core/micNeeded.ts` as part of this work, unchanged.

The server needs the predicate to cross-check the room's answer, and it cannot
reach it where it is. But the reason to move it rather than restate it is the
reason `core/` exists at all: two statements of the same rule drift, and this
one would drift silently — as wrong minutes, months later, with nothing to
point at.

The importers are `app/App.tsx:16` and the module's own test; the prose
references in `session.ts`, `useSessionAudio.ts`, `speaking.ts` and
`AppProvider.tsx` name the file rather than import it, and STATES.md cites the
full path three times — § *Self-Mute* once, § *Mic Open* twice. All of them move
with it.

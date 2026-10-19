# Watch party sync

Where the authority over a watch party's timing lies, and how it flows from a press to every screen. **Read it before touching the transport, the follower (`useFollow`, `stepFollow`), `WATCH_STARTED` / `WATCH_READY`, or `serverNow`.** Maintain it in the same commit as a change to any of those.

Traced at `master` `14e7c7cd` through `core/watch.ts`, `core/channel.ts`,
`app/src/watch/drive.ts`, `Picture.tsx`, `WatchPlayer.tsx`, `Transport.tsx` and
`app/src/state/AppProvider.tsx`, plus the decisions
`2026-10-03-nobody-corrects-drift.md` and `2026-10-01-the-drift-readout-shows-every-screen.md`.

**In short:** the server's `WatchState` is the only authority. A client can
change it only by pressing a control, plus one tightly limited report of when
its player actually started.

## The authoritative state

`WatchState` lives on `ChannelState`, in server memory, and is written to SQLite.

| Field | Meaning | Who writes it |
|---|---|---|
| `status` | idle / paused / playing | Presses (`WATCH_PLAY` / `WATCH_PAUSE`), plus the server tick at the film's end |
| `positionMs` | Position saved at the last transition | Presses; `watchPause` from the clock |
| `startedAt` | Server time the current run began, or null | `watchPlay` (now + 2 s grace), and once from `WATCH_STARTED` |
| `party.durationMs`, `title` | Facts about the film | First `WATCH_READY` from a player; never overwritten |

The live position is never stored. Every party works it out the same way:

```
watchPositionMs = positionMs + max(0, now - startedAt)    // capped at the film's end
```

(`core/watch.ts:57`). Because `startedAt` is a server timestamp, `now` has to
be server time too.

## The flow

```
 ┌──────────── PRESSES (authority: controls, needs presence) ────────────────┐
 │ Transport.tsx -- WATCH_PLAY / PAUSE / SEEK --> server                     │
 │      │                                          reduce(), now = server    │
 │      └- onPress() --> this device's follower   watchPlay:  startedAt =    │
 │         (acts at once; `pressed` holds it          now + 2000 (grace)     │
 │          <= WATCH_PRESS_HOLD_MS 3s until        watchPause: banks clock   │
 │          the snapshot agrees)                  watchSeek:  startedAt=now  │
 └───────────────────────────────────────────────────────────────────────────┘
 ┌──────────── REPORTS (authority: being in the room; tightly limited) ──────┐
 │ WatchPlayer - onStarted(pos) -> WATCH_STARTED -> watchStarted():          │
 │   sent on every move into     accepted only while now < startedAt         │
 │   `playing`                   (grace still running), |pos-bank| <= 5s;    │
 │                               the first report wins; the room's clock     │
 │                               is set so the reporting player is in step   │
 │ WatchPlayer - onFilm(dur,title) -> WATCH_READY -> learnDuration/Title     │
 │   only while showingTheFilm (not an ad)       (recorded once)             │
 └───────────────────────────────────────────────────────────────────────────┘
 ┌──────────── SERVER TICK (500ms) ──────────────────────────────────────────┐
 │ watchHasReachedEnd -> watchPause  (only once a duration is known)         │
 └───────────────────────────────────────────────────────────────────────────┘
                         │ snapshot (ChannelView + serverNow)
                         ▼
 ┌──────────── EACH SCREEN (no authority) ───────────────────────────────────┐
 │ AppProvider: clockOffset = serverNow - Date.now()  (every snapshot/pong)  │
 │ app.serverNow() --> useFollow clock, Transport scrubber (same source)     │
 │ useFollow tick (500ms, also woken by any transport change):               │
 │   desiredFor(watch, serverNow) -> want                                    │
 │   unplace on: room jump · advert · player stopped by itself               │
 │   stepFollow -> play / pause / seek only to place, or rescue a stall      │
 │ publishDrift -> watch.drift -> server -> relayed to debug only            │
 └───────────────────────────────────────────────────────────────────────────┘
```

## Who is authoritative for what

1. **The server's clock is the room's clock.** Every `now` in the reducer is
   server time. Clients only ever use it through `app.serverNow()`
   (`drive.ts`, `Picture.tsx`); their own `Date.now()` serves only as a
   stopwatch between snapshots.
2. **Presses decide intent.** The server checks presence (`canControlWatch`,
   `canPlayWatch`). The device that pressed acts ahead of the server's answer,
   but if the server refuses or the message is lost, that device follows the
   room back within 3 s (`WATCH_PRESS_HOLD_MS`).
3. **One player sets when the film started, once per run.** Play schedules the
   start 2 s ahead (`WATCH_STARTUP_GRACE_MS`), and the position holds still
   until then. The first player to report gets to pin the real start, which
   also repairs the pause's overshoot (players stop 350–1,100 ms after the
   command). Reports more than `WATCH_REPORT_SLACK_MS` (5 s) off are refused.
   After the grace period, nothing a client says can move the clock.
4. **Players are the only source of the film's length and title**, again first
   report wins, and only while `showingTheFilm` is true. Without a length, the
   film never ends on its own.
5. **Nobody corrects drift** (`2026-10-03-nobody-corrects-drift.md`). Followers
   seek only to *place* a player: on arrival, after a rebuild, after an ad,
   after stopping by itself while the room played (backgrounded, or a call;
   since `959f68d7`), or after the room jumps (a scrub, ±15 s or a replay).
   The one exception is the stall rescue at rung 3. Drift is measured and goes
   only to `debug` accounts (`watch.drift`); it never enters the snapshot.

## Two things noticed but not changed

- **`clockOffset` doesn't account for network delay**
  (`AppProvider.tsx`, `clockOffset.current = value - Date.now()`). It is
  measured on arrival, so each device's `serverNow()` runs behind the server by
  however long the message took to arrive. That gap differs between devices and
  between snapshots. Since drift isn't corrected, this mostly matters at
  placement: a joining screen is placed slightly behind the room. It also leaks
  a little into the `WATCH_STARTED` comparison.
- **`watchStarted` measures the reporting player's position against the
  server's arrival time**, so the message's travel time is baked into the
  room's clock as offset for everyone else. Again, it's small and nothing
  corrects it.

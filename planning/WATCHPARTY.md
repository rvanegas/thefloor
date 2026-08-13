# Watch Party

A design for work not yet done. FEATURES.md names it in one line; this is what
that line turns out to mean, and why. Nothing here is built — when it is,
what was decided moves to DECISIONS.md and this file goes.

## Context

FEATURES.md says: *"Independently of this functionality, a watch party plays
video, and disallows recordings."* Reading that against shared audio suggests
widening `PlaybackTrack` to carry video, and that is the wrong shape. The
videos people want to watch together are on YouTube. Nobody has an mp4.

So the feature is not a second media pipeline. **The Floor carries no video at
all — it carries a shared transport clock over a link, and each person's own
player follows it.** The server never fetches, decodes, publishes or stores a
frame; `server/src/playback.ts` and the LiveKit media plane are untouched.

That is also what settles the terms question DECISIONS.md already recorded.
The YouTube objection there is against *separating audio from video and
fetching it server-side*. This does the opposite: everybody watches the real
YouTube player, visible and unobscured, and the audio arrives with its own
video on the same device. Nothing is extracted, so there is nothing to
redistribute — which is the same reason recordings are refused rather than
merely lossy.

Two surfaces follow the clock, and they are honestly different:

- **The phone is the remote.** It holds the transport controls, shows where the
  party is, and can hand the link to the YouTube app. It cannot correct
  anything it has opened that way — a hand-opened player runs on its own clock.
- **The follower page is the screen.** A page the server serves, opened on a
  desktop or an iPad, running YouTube's official IFrame API and following the
  channel over the existing websocket. It is the surface that can be driven, so
  it is the one that stays in step.

An in-app player is deliberately not in this change. It means
`react-native-webview`, a native module and a rebuild, and this project's
history with those — build 2's black screen — argues for it landing on its own.

---

## What travels

One new field on `ChannelState`, shaped deliberately like `PlaybackState` so
two features do not measure elapsed time two different ways:

```ts
/** A video everybody is watching, on their own screens. */
export interface WatchParty {
  /** YouTube's own id, parsed from whatever was pasted. */
  videoId: string;
  /** The URL as given, kept so the interface can hand back exactly that. */
  url: string;
  /**
   * How long it runs. Null until a follower's player says — nothing here ever
   * asks YouTube anything, so this is the one fact the channel learns from a
   * client rather than deciding.
   */
  durationMs: number | null;
}

export type WatchStatus = 'idle' | 'playing' | 'paused';

export interface WatchState {
  party: WatchParty | null;
  status: WatchStatus;
  positionMs: number;
  startedAt: number | null;
  failure: string | null;
}
```

There is no `volume`, and the absence is the point. `PlaybackState.volume` is
shared because the server applies it to the samples before publishing, so it is
part of what the channel sounded like. Here nothing is published; how loud your
own screen is is your device's business.

---

## Core

**New — `core/watch.ts`**, mirroring `core/playback.ts` almost line for line:
`initialWatchState`, `watchPositionMs` (clamped to `durationMs` when known),
`hasReachedEnd`, `startParty`, `stopParty`, `watchPlay`, `watchPause`,
`watchSeek`, `learnDuration`, `failWatch`. Same derivation of position from
`positionMs + (now − startedAt)`, same "comes to rest where it got to" on
failure.

Plus one function neither playback nor the server has an equivalent of:

```ts
/** Parses a pasted YouTube link. Null when it is not one. */
export function parseYouTubeUrl(url: string): { videoId: string } | null
```

It belongs in core for exactly the reason core exists: the app needs it to
decide whether the paste button lights up, and the server needs it to decide
whether to accept — and those two must not disagree. It handles
`youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, and an `embed/` path,
ignoring extra query parameters.

**`core/types.ts`** — add `watch: WatchState` to `ChannelState`, and the
actions:

| Action | Guard |
| --- | --- |
| `START_WATCH { userId, url }` | `canStartWatch` |
| `STOP_WATCH { userId }` | `canControlWatch` |
| `WATCH_PLAY` / `WATCH_PAUSE` / `WATCH_SEEK { positionMs }` | `canControlWatch` |
| `WATCH_READY { userId, durationMs }` | presence only — a fact, not a control |
| `WATCH_FAILED { reason }` | none; reported, like `PLAYBACK_FAILED` |

**`core/channel.ts`** — the guards:

- `canControlWatch(state, userId)` is the same rule as `canControlPlayback`
  (`core/channel.ts:318`) for the same reason, and should call a shared
  `holdsSharedControl(state, userId)` helper rather than repeat the body. The
  floor confers exclusive control of what is attended to; a video on everyone's
  second screen is squarely that.
- `canStartWatch` = `canControlWatch` **and** `recording.status === 'idle'`.
- `canStartRecording` (`core/channel.ts:217`) gains `state.watch.party === null`.
- `START_WATCH` clears any loaded audio track via `clearTrack`
  (`core/playback.ts:75`); `SET_TRACK` clears any party. A channel attends to
  one thing, and mutual replacement means neither button is ever dead.
- `settleEmpty` (`core/channel.ts:~703`) pauses a playing party when the channel
  empties, for the same reason it already pauses playback — a film running
  itself out for nobody is not shared watching.
- `endChannel` pauses it. `tick` pauses it at the end when `durationMs` is known.

**Tests — `core/__tests__/watch.test.ts`**, following the `T0` /
`joined()` / `apply([[action, at]])` pattern of
`core/__tests__/playback.test.ts`. `purity.test.ts` needs nothing: the new
module imports only constants and types.

---

## Server

Striking property worth stating up front: **there is no `applyWatchToMedia`.**
The whole feature is the reducer plus the fan-out that already exists. Because
mutual exclusion happens in the reducer, the audio track's media participant is
torn down by the `applyPlaybackToMedia` path already watching committed state
(`server/src/channels.ts:1611`), with no new code at all.

**`server/src/channels.ts`** — add the actions to the `CLIENT_ACTIONS`
allowlist (`:104`), leaving `WATCH_FAILED` out of it as `PLAYBACK_FAILED` is.
Add `watch` to `durableOf` (`:~1946`) — unlike playback, which is excluded
because its temp file died with the process, a party needs nothing external to
revive. `restore` brings it back **paused at its position**: the clock ran on
with nobody driving it, so resuming it would be a lie.

New method `watchToken(channelId, userId)`, mirroring `mediaToken`
(`:~1898`): participant check, active channel, then mint.

**`server/src/accounts.ts` + `db.ts`** — the credential, and this is the part to
get right. It **cannot** be a session token: `issueToken`
(`server/src/accounts.ts:313`) revokes every other session for the account, so
minting one would sign the phone out, and `accountForToken` would then accept a
link that leaked as a full credential.

So a separate table, in the spirit of the deliberately-separate credentials in
AGENTS.md:

```sql
CREATE TABLE watch_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Additive; no existing row is touched. `issueWatchToken` / `watchTokenFor` reuse
`sha256` and `insertWithUniqueKey` already in that file, and the expiry sweep
(`accounts.ts:~89`) gains a second count. TTL is **6 hours** — long enough for a
film, since `ws.ts` re-checks a socket's credential and a 15-minute token would
cut the page off in the third act.

**`server/src/ws.ts`** — `Connection` gains a scope. A watch-scoped socket may
watch exactly its one channel and send exactly one action, `WATCH_READY`.
Everything else is refused. The page is a *follower*: control lives on the
phone, which is what the product says, and it means a leaked link exposes what
is being watched rather than the ability to change it.

**`server/src/app.ts`**

- `POST /channels/:id/watch-token` → `{ url }`, the link to open elsewhere:
  `https://thefloor.rvanegas.co/watch/<channelId>#<token>`. **The token is in
  the fragment**, so it never reaches an access log or a `Referer` header —
  the page reads it in JS and never sends it anywhere but the websocket.
- `GET /watch/:channelId` → the follower page.

---

## The follower page

**New — `server/src/watch-page.ts`**, exporting the page as a template string
rather than sitting on disk as an asset: one file, no runtime path resolution,
no build step, and nothing a `--delete` rsync can leave behind.

What it does, and it is small:

1. Reads the token from `location.hash`, opens the existing `/ws`, sends
   `watch.channel`.
2. Loads YouTube's IFrame API and creates a player for `watch.party.videoId`,
   with its own controls disabled — the phone is the remote.
3. Requires one tap to begin, because browsers will not start audio without a
   gesture.
4. On every `channel` snapshot: keeps `offset = serverNow − Date.now()`,
   follows `status` with `playVideo`/`pauseVideo`, and every two seconds
   compares `getCurrentTime()` against `watchPositionMs(watch, Date.now() +
   offset)`, calling `seekTo` when they differ by more than
   `WATCH_DRIFT_MS` (1500 — new in `core/constants.ts`). Correcting for
   smaller drift is worse than the drift: a seek is a visible stutter.
5. Sends `WATCH_READY` once, with the duration its player reports.

Same clock discipline as everything else here — `serverNow` accompanies every
snapshot precisely so countdowns do not run on a device's own idea of the time.

---

## App

**`app/src/ui/ChannelView.tsx`** — a "Watch together" card, sibling of "Shared
audio" (`:420-550`) and built from the same pieces: `Card`, `SectionLabel`,
`Button`, `Field`, `Empty` from `app/src/ui/components.tsx`, and
`formatDuration` and `SKIP_MS` as the audio transport uses them.

- **Empty:** "Watch something together", a `Field` for the link, and a Start
  button enabled only when `parseYouTubeUrl` returns something — which is why
  that function is in core.
- **Loaded:** the video's link, elapsed time from `watchPositionMs(watch,
  now)`, a progress bar when `durationMs` is known and a plain elapsed readout
  when it is not, then −15s / Play-Pause / +15s / Stop, all disabled unless
  `canControlWatch`. Reuse the sentence the audio card already uses to explain
  why a control is greyed while somebody holds the floor (`:540-552`).
- **Open on this phone** → `Linking.openURL(url + '&t=' + seconds)`, already the
  pattern in `app/src/ui/markdown.tsx:192`. Labelled so it is clear this hands
  off rather than follows: it starts at the right second and drifts thereafter.
- **Watch on another screen** → `api.watchLink(...)`, then React Native's
  `Share.share({ url })`. No new dependency.
- **Recording card** (`:552-631`) — disabled while a party is loaded, with the
  reason said out loud rather than a dead button.

**`app/src/api/http.ts`** — `watchLink(token, channelId)` beside `mediaToken`
(`:176`).

**Tests** — `app/src/ui/__tests__/views.test.tsx`, following its `mockApp` /
`showChannel` / `textOf` / `findButton` pattern: the card renders loaded and
empty, controls grey while another holds the floor, Record is refused with its
reason, and a bad link leaves Start disabled.

---

## What is refused, and an assumption in it

- A recording in progress refuses a watch party; a loaded party refuses a new
  run. **Assumed, not asked:** the alternative is that starting a party ends a
  run in progress, and that is one tap silently ending something the other
  person may be speaking on the strength of. Both buttons grey with a reason.
  Cheap to reverse — it is two clauses in `core/channel.ts`.
- No YouTube audio ever reaches the LiveKit room. Not a limitation to fix
  later: routing it there would be exactly the extraction the terms forbid, and
  it is what keeps a recording genuinely free of the video rather than
  incidentally so.

---

## Deploy shape

Wire-additive: a new field on the channel snapshot and new `ClientAction`
members. Old builds ignore `watch` and never send the actions, so build 27 goes
on working — with the one dent that it can start a recording the server will
refuse, and will see the audio track vanish when somebody else starts a party.
The migration adds one table and touches no existing row; `watch` defaults
correctly in the state blob for every channel that has never had one, so rows
rewrite on their next change rather than up front — the same story as
`mediaRoom` and `invited`.

Deploy the server first, as always.

---

## Verification

```bash
npm test        # core + app + server
npm run typecheck
```

New suites: `core/__tests__/watch.test.ts` (transport, guards, mutual exclusion
with both the track and recording, empty-channel pause, end-of-video) and
`server/__tests__/watch.test.ts` — built like `server/__tests__/playback.test.ts`
with `buildApp({ dbPath: ':memory:', media: new MemoryMediaServer(), ... })` and
a manual clock. The server suite must assert the things a unit test of the
reducer cannot:

- a watch token is refused as a session credential on any authenticated route,
  and a session token is refused at `/watch/:id`;
- a watch-scoped socket cannot send `WATCH_PLAY`, `INVITE`, or watch a second
  channel;
- starting a party while a track is loaded closes the playback participant —
  assert against `MemoryMediaServer`, which records every command;
- restart revives a party paused at its position.

Then the part no test reaches, which is where this feature will actually
surprise somebody — the same lesson as the choppy pump: **a promise resolving
is not evidence of what it waited for, and nothing here is confirmed until two
people have watched something.**

1. Two phones in one channel, one desktop browser each. Paste a link, Start,
   Play. Both browsers should be within a second or two of each other, and stay
   there for ten minutes without a visible correction.
2. Seek from one phone; both browsers jump.
3. Claim the floor from one phone; the other phone's transport greys out and
   the video keeps playing — a claim confers control, it does not pause.
4. Record is greyed with its reason. Load an audio file: the party ends and the
   media participant appears in the room.
5. Both step out; the party pauses. Step back in; it is still paused, where it
   was.
6. Restart the server; the party comes back paused at its position and both
   pages reconnect.

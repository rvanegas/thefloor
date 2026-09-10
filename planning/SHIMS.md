# Shims, and the build each one is waiting for

Every piece of code that exists only to go on answering an older install, with
the build number that retires it. **One entry per shim, and the table below is
the index**: raising `MIN_SUPPORTED_BUILD` is the only event that makes any of
this actionable, and this file is what turns the new number into a list of
deletions.

The rule it serves is in `server/src/release.ts`, on `MIN_SUPPORTED_BUILD`
itself: **a compatibility shim may be deleted once the floor has passed the
build that needed it, and not before.** That rule was decidable and unfindable
— each shim named its own gate in its own doc comment, so knowing what a floor
of 80 freed meant grepping the tree for build numbers and hoping the wording
matched. Two of the entries below carry no build number in the code at all and
were found only by reading `planning/BACKLOG.md`; one of those,
`ChannelView.pingableAt`, had been free to delete since the floor passed 56 and
nobody knew.

**This file does not license raising the floor.** Since build 51 went public on
2026-08-19, raising it takes installed apps off the air — an app below the
floor replaces itself with an update screen and disconnects. The floor moves
when `oldestBuild` on `/healthz` has already passed the number, for its own
reasons; then you come here. Never the other way round. AGENTS.md § *Never ship
a wire change to a server before the client can speak it* is the other half.

## The table

Gate is the lowest `MIN_SUPPORTED_BUILD` at which the shim may go.

| Gate | Shim | Lives in |
| --- | --- | --- |
| 21 | `HomeView.recordings` | `core/protocol.ts`, `server/src/app.ts` |
| 56 | `ChannelView.pingableAt` optionality | `core/protocol.ts` |
| 78 | `ChannelView.notificationLevel` optionality | `core/protocol.ts` |
| 110 | The legacy heartbeat budget | `core/constants.ts`, `server/src/release.ts` |
| 121 | The `device` parameter's token fallback | `server/src/ws.ts` |
| 123 | `bio` accepted and ignored | `server/src/app.ts` |
| 159 | The two renamed settings | `server/src/settings-wire.ts` |
| — | `mediaRoom` | `core/channel.ts`, `server/src/channels.ts` |
| — | `declaredNearbyAt` optionality | `core/channel.ts` |
| 175 | The pre-attention fallback | `server/src/channels.ts`, `server/src/release.ts`, `app/src/ui/ChannelView.tsx` |

The floor is **51**. `oldestBuild` read **80** on 2026-09-09, so the first
three are already free and the rest are not.

`mediaRoom` has no gate because the client half that would fix one has not
shipped. It is here rather than omitted because it is a wire field whose
removal has the same shape as everything else in this table, and leaving it out
is how it gets deleted by somebody who checked the table and found nothing.

## The convention

**A shim gets an entry here in the commit that adds the shim**, not later. The
gate is knowable at exactly that moment and at no other: it is the build the
new client ships in, which is the next one uploaded, and a week later it takes
`git tag --contains` and a guess about which commit was the relevant one.

An entry says four things — what the shim answers for, the build that retires
it, every file it touches, and **what must not be deleted alongside it**. That
last is the one that is not reconstructable. `HomeView.recordings` looks like
it should take `recordingsFor` with it and must not; the legacy heartbeat
budget looks like it takes the whole `build`-on-connection apparatus and does
not.

**Delete the entry in the commit that deletes the shim.** This file is only
what is outstanding, exactly as BACKLOG.md is, and an entry for something
already gone is worse than no file — it sends somebody looking for code that
is not there.

To find the gate for a shim being added now: the client that speaks the new
shape ships in the next build uploaded, so read `buildNumber` in `app/app.json`
and add one. Check it against `git tag -l 'build/*'` before landing, since
another worktree may have uploaded in between — this is the mistake
`FAST_HEARTBEAT_BUILD` already made once, and its comment in `core/constants.ts`
is the account of it.

---

## Gate 21 — `HomeView.recordings`

The app shows recordings on the channel they were made in. The server still
sends the flat Home list, because build 20 and earlier render it and would
otherwise lose every recording at a deploy.

Once nobody is on 20, the field goes: `homeFor` stops calling `recordingsFor`,
and `RecordingView` leaves `HomeView` in `core/protocol.ts`. What must *not* go
with it is `recordingsFor` itself — the export and playback endpoints both read
it, and it is the one place the access rule is written down.

What else goes with it: the "does not list recordings" test in
`app/src/ui/__tests__/home.test.tsx`, which exists only to assert that the app
ignores the field. And `RecordingRow` in `app/src/ui/components.tsx` is in that
shared module solely because Home and the channel screen both drew recordings
and must not have called them different things — with Home gone it has one
production consumer, `ChannelView.tsx`, and can move there.

---

## Gate 56 — `ChannelView.pingableAt` optionality

Optional in `core/protocol.ts` so that a client older than the field does not
see it; every build up to 55 ignores it, offers the ping button anyway and is
told no, which is what the server would have said regardless.

The floor has passed this. The server sets it unconditionally at
`server/src/ws.ts:531`, so the field can become required and the
`view.pingableAt?.[…] ?? null` reads in `app/src/ui/ChannelView.tsx` collapse.

**A type tidy rather than a wire change**, and the distinction is why this is
small: making a field required asserts the server always sends it, which has
been true since it shipped. Nothing on the wire changes and no install notices.

---

## Gate 78 — `ChannelView.notificationLevel` optionality

The same shape as `pingableAt` above and the same treatment. Optional so an
older client reads absence as `DEFAULT_NOTIFICATION_LEVEL`, which is also what
the server assumes for anybody who has never touched it, so the missing case
and the untouched case agree.

Set unconditionally at `server/src/ws.ts:536`. The floor has passed 78. The
client-side fallback is `app/src/ui/ChannelSettingsView.tsx`.

Its doc comment names no build, which is why it was missed: the gate here comes
from `git tag --contains` on the commit that added the field, and pinning it
in this table is most of the point of the file.

---

## Gate 110 — the legacy heartbeat budget

`HEARTBEAT_TIMEOUT_LEGACY_MS` in `core/constants.ts` is the silence budget for
a client that pings every five seconds, which is everything up to and including
build 107. Judged against the current budget those phones are always a moment
from exceeding it, so they keep the old one. `FAST_HEARTBEAT_BUILD` is the
first build that may be judged against `HEARTBEAT_TIMEOUT_MS`, and
`heartbeatTimeoutFor` in `server/src/release.ts` is the branch between them.

When the floor passes 110 there is no connection left that can claim the old
budget: the constant, `FAST_HEARTBEAT_BUILD`, the branch, and the tests in
`server/__tests__/ws.test.ts` that drive a client at `FAST_HEARTBEAT_BUILD - 1`
all go together.

**Build 110 was never cut** — the first tag is `build/111` — which changes
nothing, the gate being a floor rather than a build that must exist.

What must not go with it: the `build` field on the connection, `claimedBuild`,
and the census. Those exist for `oldestBuild` and `silentBuilds`, which is what
makes the floor movable at all, and the heartbeat branch is only their second
reader.

---

## Gate 121 — the `device` parameter's token fallback

A socket names which copy of the app it is, so `displaceOtherSessions` can tell
two browser tabs sharing a token apart. A client too old to have an opinion
sends nothing, and `deviceKey` in `server/src/ws.ts` falls back to the token —
the rule that shipped before the field existed.

When the floor passes 121, `deviceKey` stops needing its branch and
`Connection.device` stops needing to be nullable. `claimedDevice` stays: it is
the bound on an unbounded string a client hands the process, and that is not a
compatibility concern.

---

## Gate 123 — `bio` accepted and ignored

`POST /me` accepts a `bio` field and does nothing with it. Every build up to
and including 122 sends one whenever somebody edits their profile, and the
column it was written into went on 2026-08-31 — so a 400 would turn every one
of those saves into an error on a screen where the name beside it saved fine.

When the floor passes 123, the field can stop being tolerated. It is a comment
and an absence rather than code: `server/src/app.ts` never reads `bio`, so what
goes is the paragraph in the route's doc comment explaining why an unknown
field is ignored here and refused elsewhere.

---

## Gate 159 — the two renamed settings

`tapToStepIn` and `controlCards` became `tapToLook` and `hideControlCards` on
2026-09-07, each the negation of what it replaced, so that every boolean
account setting defaults to false — see
`decisions/2026-09-07-every-boolean-setting-defaults-to-false.md`. Every build
in anybody's hands at the time reads the old names, so the server sends both
and accepts either: `server/src/settings-wire.ts` is that whole arrangement,
and it is written to be deleted in one piece, along with the two tests in
`settings.test.ts` that name it and the legacy keys the answers carry in
`ws.test.ts`.

**Delete it once the floor has passed 159**, which is the first build that
speaks the new names. Not before: an install below the floor is shown the
update screen and disconnects, and until that is true of every build that
predates this, one of them is out there reading the answer to
`POST /me/settings` and finding neither of its channel settings in it.

The three places settings go out — the hello, the settings event, and the
answer to `POST /me/settings` — all pass through `settingsForWire`, deliberately:
a client that learnt one shape from the hello and another from the event would
be the same bug in a harder place to find.

The app's cache of the last answer has the same shape and the same expiry:
`LEGACY_TAP_TO_STEP_IN_KEY` and `LEGACY_CONTROL_CARDS_KEY` in `AppProvider`,
read only when the current key is missing, negated on the way in, and removed
the moment the server states anything. That half is cheaper to be wrong about —
it is a cache, so the cost is one second of the wrong answer at a cold start
rather than a setting — but it goes with the other half.

---

## Gate 175 — the pre-attention fallback

Attention became a clock the server holds on 2026-09-09, fed by an
`{ type: 'attentive' }` report the client sends. Builds before 175 send no such
report, and three pieces of code exist for them.

**`ATTENTION_BUILD` in `server/src/release.ts`**, which is what decides who is
in the new world. Below it no clock is seeded on connection, so
`expireInattentive` has none to read and leaves those installs alone. Note the
clock is keyed `channelId:userId`, so "no clock" is per room: an old install is
unknown everywhere, and a new one is unknown in the rooms it has not attended.

**The unknown-clock arm of `ChannelRegistry.expireInattentive`.** An old
install goes on deciding for itself and sending `ATTENTION_EXPIRED`, exactly as
it did — but `isWaiting` in `core/` is now membership, and somebody has to
strike out a nearby whose fifteen minutes has run. That arm is the only reader
left of **`nearbyMs`**, and of the `STILL_HERE` branch that refreshes
`declaredNearbyAt`. All three go together.

**The roster fallback in `ParticipantCard`.** Where `attentiveAt` has no entry
the card shows the old numbers and the old words — *Nearby for 4 minutes*,
*Stepped out 16 minutes ago* — rather than the attention clock. Mixed
vocabulary between rows during the transition is the accepted cost; it
self-heals as installs update.

**Do not delete `idleMs` with any of it.** Home orders rooms by
`lastPresenceAt`, which reads the same stamps, and *Stepped out* still counts
from them for anybody the fallback is drawing.

**Nothing is needed in the other direction.** A build below 175 ignores
`attentiveAt` on the snapshot, and the server goes on accepting the
`ATTENTION_EXPIRED` those builds send — that action is not a shim and does not
leave with this entry; it is what the tick itself dispatches.

---

## No gate — `declaredNearbyAt` optionality

One `?.`, in `nearbyMs` in `core/channel.ts`, reading a field added on
2026-09-09. A snapshot from a server that predates it has no such object, and
an unguarded index would throw on every roster row rather than degrade.

**The one entry here whose retiring event is not a floor move**, which is why
it has no gate rather than a distant one. `ChannelState` travels server →
client and nothing else; the client renders snapshots and never runs the
reducer, so the only build that can produce a state without this field is a
*server*, and the only way to meet one is a rollback of the box. A deploy
retires it, not a number — and since the deploy precedes the client that reads
it, the guard is already redundant on the day it ships. It is here because a
wire field's absence handled in code is exactly what this table is an index
of, and the alternative was a `?.` nobody could account for.

**The other direction needs nothing and is not a shim.** A client older than
the field ignores it and goes on timing declarations from `lastPresentAt` —
"Nearby for 4 minutes" on a tap one second old, and a window that lapses early.
That is the bug the field fixes, still present on old installs, which is
degradation rather than breakage and is not fixable from the server.

**Do not delete `idleMs` alongside it.** The two clocks answer different
questions and both are live: `idleMs` is how long since anybody heard anything,
which is what a dropped connection is timed by and what *Stepped out* counts.

---

## No gate yet — `mediaRoom`

`ChannelState.mediaRoom` is the LiveKit room a channel's audio flows through.
Its own comment says the field could in principle go, and gives the reason it
does not: rows written while conversations moved between channels are still on
disk, where a destination inherited the room name so it would not change under
a live connection and the channel left behind took a fresh one. Restoring
either as its own id would put whoever walks in now into a room somebody else
is still holding tokens for.

**That is no longer true of this database.** Of 74 channel rows, 57 carry a
`mediaRoom` equal to `id`, 17 predate the field and are defaulted to `row.id`
by `revive`, and **none differ**. Nor can one appear: `mediaRoom` is written in
exactly one place, `createChannel`'s `params.mediaRoom ?? id`; nothing in
production passes `params.mediaRoom`; and no reducer case reassigns it. The
only non-default in the tree is a fixture, `core/__tests__/participants.test.ts`.

**The client half is inert and can be done at any time.** Every reference in
`app/src/audio/useSessionAudio.ts` is an effect dependency, a `!!mediaRoom`
presence guard, or a comment — the hook never names a room in a request, the
join credential being fetched against `channelId`. So it takes two parameters
that are always equal, keys one effect on both and another on one alone, and
carries a comment explaining a distinction that no longer exists. Collapsing
them to a single identifier touches no wire and no server.

**The server half is a wire change and needs the two-step.** `protocol.ts`
sends `channel: ChannelState` whole, so `mediaRoom` is a wire field and
`App.tsx` reads `live.mediaRoom`. A server that stops emitting it hands every
installed build `undefined`, which fails `!!mediaRoom` and leaves the app
connected to no audio at all — silently, which is the shape the two-step exists
to prevent.

**So the gate is unset because the client collapse has not shipped.** If it
ships in build *N*, the field may be deleted once the floor has passed *N* —
and *N* is whatever the next upload is, read from `app/app.json` on the day.
**Do not raise the floor for this**; wait until it has passed *N* for its own
reasons, then delete. Fill the gate in above in the commit that ships the
client half.

What goes when it does: the field from `ChannelState` and `durableOf`, the
`durable.mediaRoom ?? row.id` default in `revive`, about twenty mechanical
`state.mediaRoom` → `state.id` substitutions in `server/src/channels.ts`, and
the fixture. Two staleness guards read `now.mediaRoom !== room` and become
vacuous — but their `!now` and `status !== 'active'` halves must stay, since a
channel can still end under an async media call.

The storage half is not gated: `revive` already defaults an absent `mediaRoom`
to `row.id`, so old rows are safe whatever happens to the field.

One argument for keeping it, recorded rather than endorsed: a separate room
name is the natural mechanism if a wedged LiveKit room ever needs rebuilding
under a live channel. Speculative, and today the field buys nothing while
costing a wire field, a duplicated parameter and a misleading comment.

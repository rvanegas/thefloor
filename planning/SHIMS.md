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
matched. Two entries carried no build number in the code at all and were found
only by reading `planning/BACKLOG.md`; one of those, `ChannelView.pingableAt`,
had been free to delete since the floor passed 56 and nobody knew. The floor
went to 80 on 2026-09-13 and this file was what said which three went with
it — which is the whole of what it is for.

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
| 110 | The legacy heartbeat budget | `core/constants.ts`, `server/src/release.ts` |
| 121 | The `device` parameter's token fallback | `server/src/ws.ts` |
| 123 | `bio` accepted and ignored | `server/src/app.ts` |
| 159 | The two renamed settings | `server/src/settings-wire.ts` |
| — | `mediaRoom` | `core/channel.ts`, `server/src/channels.ts` |
| — | `declaredNearbyAt` optionality | `core/channel.ts` |
| 175 | The pre-attention fallback | `server/src/channels.ts`, `server/src/release.ts`, `app/src/ui/ChannelView.tsx` |
| 188 | `RejoinableView.nearby` / `InviteView.nearby` optionality | `core/protocol.ts`, `app/src/ui/ChannelsView.tsx` |
| 189 | `RejoinableView.nearbyCount` / `InviteView.nearbyCount` optionality | `core/protocol.ts`, `app/src/ui/ChannelsView.tsx` |
| 195 | `ChannelView.pingedWith` optionality | `core/protocol.ts`, `app/src/ui/ChannelView.tsx` |
| 196 | `HomeView.tried` optionality | `core/protocol.ts`, `app/src/state/useIntroduction.ts` |
| 196 | The keychain hand-up of the four tried rungs | `app/src/state/tried.ts`, `app/src/state/useIntroduction.ts` |
| 198 | `thefloor.intro.arrival` read as the old latch | `app/src/state/useIntroduction.ts` |
| 206 | `HomeView.helpAnsweredAt` optionality | `core/protocol.ts`, `app/src/state/helpSeen.ts` |
| 212 | `HomeView.cohortEligible` optionality | `core/protocol.ts`, `app/src/state/AppProvider.tsx`, `app/src/state/notificationAsk.ts` |
| 215 | `Guest.asks` / `Guest.invites` optionality, and `'accepted'` | `core/types.ts`, `app/src/ui/ChannelView.tsx` |
| 259 | `ChannelView.watching` optionality | `core/protocol.ts`, `app/src/ui/ChannelView.tsx` |

The floor is **80**, raised there on 2026-09-13 once `oldestBuild` had
already read 80. Everything it freed — `HomeView.recordings`,
`ChannelView.pingableAt` and `ChannelView.notificationLevel` — went in the same
commit, so nothing above is free today.

`ChannelView.watching` is optional so that a client which draws the roster's
*watching* suffix can meet a server which does not gather it, and reads an
absent field as nobody watching — which is the roster as it was drawn before
this existed. 259 is the build in `app.json` at the moment this landed, which
is the next one to be uploaded and therefore the first that speaks the field.

`Guest.invites` is the same shape as `Guest.asks` before it and gated the same
way: both are optional on the wire so that a client which knows about them can
meet a server which does not, and `'accepted'` is a value an older app renders
as an unlabelled ask. 215 is the build in `app.json` at the moment this landed,
which is the next one to be uploaded and therefore the first that speaks these
fields.

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
what is outstanding, exactly as backlog/ is, and an entry for something
already gone is worse than no file — it sends somebody looking for code that
is not there.

To find the gate for a shim being added now: the client that speaks the new
shape ships in the next build uploaded, so read `buildNumber` in `app/app.json`
and add one. Check it against `git tag -l 'build/*'` before landing, since
another worktree may have uploaded in between — this is the mistake
`FAST_HEARTBEAT_BUILD` already made once, and its comment in `core/constants.ts`
is the account of it.

---

## Gate 196 — `HomeView.tried` optionality

Which of the introduction's four *try* rungs an account has behind it, moved
off the phone and onto the account on 2026-09-13 —
`decisions/2026-09-13-the-tried-rungs-belong-to-the-account.md`. Optional
because a server that predates it sends no such key, and the client reads
absence as *none of them*, which is the ladder every build drew before the
account held anything.

Set unconditionally in `homeFor`, `server/src/app.ts`, from `Accounts.tried`.
The client-side fallback is the `?? NOTHING_TRIED` in `useIntroduction`.

**What must not be deleted with it**: nothing here is the `marked` overlay's
business. That is the half-second between doing a thing in a channel and the
Home push arriving, and it is needed against a current server exactly as much
as an absent field.

Gate 196 because build 195 is already tagged: the client that speaks this
ships in the next upload.

---

## Gate 196 — The keychain hand-up of the four tried rungs

The same move, from the other end. Every account that existed on 2026-09-13
has its four answers in `thefloor.intro.tried.*` on a phone and **nowhere
else** — nothing on the server records that a floor was ever claimed, so there
was nothing to backfill from. So the client reads the four keys once per
sign-in, offers whatever it finds to `POST /me/tried` in one request, and
deletes them only when that request succeeds.

`legacyTried` and `TRIED_KEYS` in `app/src/state/tried.ts`, and the `handUp`
block in `useIntroduction`'s load effect. Nothing writes those keys any more.

**What must not be deleted with it**: the four keys' entries in
`INSTALL_KEYS`, `app/src/state/storage.ts`, until the keys themselves go — and
`storageKeys.test.ts` enforces that pairing, so it will say so. Nor
`forget`'s call to `api.forgetTried`, which is the debug button's server half
and has nothing to do with the migration.

Gate 196 for the reason above, and the gate is honest here rather than
conservative: an install below the floor cannot run at all, and every install
at or above 196 performs the hand-up on the first sign-in it manages.

---

## Gate 195 — `ChannelView.pingedWith` optionality

What a ping said and who said it, for every participant whose ping window is
still open — the field the profile card quotes under "Pinged." Optional because
a server that predates it sends no such key, and the client reads absence as *a
ping with no words*, which is the card exactly as every build drew it: the
state, the countdown, and nothing quoted.

Set unconditionally in `pushChannel`, `server/src/ws.ts`, from
`Channels.pingTexts`. The client-side fallback is the `?? null` on
`view.pingedWith?.[viewing.id]` in `ChannelView`, which feeds `ProfileView`'s
own `pingedWith = null` default.

**What must not be deleted with it**: `ProfileView`'s `sentText`, which is not
a shim. It quotes the ping you have just sent during the half-second before any
snapshot carries it, and is needed against a current server exactly as much as
an old one. Nor the `by: null` arm — that is how the card says *these are your
own words* and has nothing to do with the server's age.

Gate 195 because build 194 is already tagged: the client that speaks this ships
in the next upload.

---

## Gate 189 — `RejoinableView.nearbyCount` / `InviteView.nearbyCount` optionality

How many people **other than the reader** are nearby in a channel, which Home
reads as a second way of being live: a room nobody is in and two people are
standing beside is one step in from being a conversation, and is hoisted rather
than sorted down among the rooms nobody has opened in a week.

Optional on both shapes because a server that predates it sends no such key,
and the client reads absence as nought — which files the channel exactly where
every build filed it, under the idleness line and not under LIVE.

Set unconditionally in `rejoinableFor` and `invitesFor`,
`server/src/channels.ts`, from `othersWaiting` in `core/channel.ts`. The
client-side fallbacks are the two `?? 0` in `inviteCard` and `memberCard`,
`app/src/ui/ChannelsView.tsx`.

**What must not be deleted with it**: the seat entry's explicit
`nearbyCount: 0`, in both files — who is standing beside a room is not a
guest's to read, so that is a rule rather than a fallback. Nor the
`presentCount === undefined` arm of `isLive`, which belongs to a different
shim and reads an older server's silence the other way about.

Gate 189 because build 188 is already tagged: the client that speaks this ships
in the next upload.

---

## Gate 188 — `RejoinableView.nearby` / `InviteView.nearby` optionality

The bit that tells Home which channels the reader is nearby in, so the tier can
pin a bar for each the way it pins the channel you are standing in. Optional on
both shapes because a server that predates it sends no such key, and the client
reads absence as *not nearby* — which draws no bar and leaves the channel as
the row every build drew before there was a bar to draw.

Set unconditionally in `rejoinableFor` and `invitesFor`,
`server/src/channels.ts`. The client-side fallbacks are the two `?? false` in
`inviteCard` and `memberCard`, `app/src/ui/ChannelsView.tsx`.

**What must not be deleted with it**: the seat entry's explicit `nearby: false`,
in both files. That is not a fallback for an older server — a guest is never in
`waiting`, the rung being a member's — so it stays when the optionality goes.

Gate 188 because build 187 is already tagged: the client that speaks this ships
in the next upload.

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

**One of the two settings is now dead, which makes half of this cheaper and
none of it optional.** Nothing has read `hideControlCards` since 2026-09-13:
the channel screen's repeated cards were deleted and the Home settings toggle
with them — `decisions/2026-09-13-the-cards-a-footer-made-redundant.md`. The
field is still on the wire, still a column, and still sent both ways, because
builds below the floor are still reading the answer and a missing key is a
different thing from a key nobody uses. So the gate does not move; what
changes is that whoever reaches 159 can delete the alias *and* consider
retiring the field itself in the same two-step, rather than preserving a
setting for a screen that no longer offers it.

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

**The roster fallback in `ParticipantCard`, which is now one line rather than
two.** Where `attentiveAt` has no entry the *Nearby* line falls back to
`nearbyMs` — the declaration, or the last sign of life. *Stepped out* is not
part of this any more: it counts presence for everybody, fallback or not, since
the correction of 2026-09-09 (`decisions/…-one-clock-ends-two-states-but-times-one.md`).
So the mixed vocabulary during the transition is confined to one line and one
number; it self-heals as installs update.

**Do not delete `idleMs` with any of it, and this is no longer a shim's
reason.** *Stepped out* counts from `lastPresentAt` permanently, and Home
orders rooms by `lastPresenceAt`, which reads the same stamps. Nothing about
retiring this entry touches either.

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

---

## Gate 198 — `thefloor.intro.arrival` read as the old latch

**Nothing writes this key any more and one thing still reads it.** It held how
an account arrived — `invited` or `alone` — and decided whether Home drew a
one-line card or the ladder. Both went on 2026-09-13 when the first rung
started ticking against a starting line rather than against nought: nothing is
born ticked, so there is no cohort to draw a card for.
`thefloor.intro.contactsBase` inherited the key's other job, which was to say
that this install has seen a snapshot before.

What is left is the handover between the two. An install that was already
climbing the ladder holds an arrival and no starting line, and its line is
**nought** whatever its contact count is today — latching from today's count
would un-tick a rung somebody earned. So the load effect reads the arrival,
writes a line of `0`, and deletes the arrival; an install with neither key has
never seen a snapshot and latches from its first one.

The `else if (storedArrival !== null)` branch in `useIntroduction`'s load
effect, and `LEGACY_ARRIVAL_KEY` above it.

**What must not be deleted with it**: `'thefloor.intro.arrival'` in
`INSTALL_KEYS`, `app/src/state/storage.ts`, until the read itself goes —
`forgetInstall` is the only way to clear a key from outside the app, and
`storageKeys.test.ts` pairs the two. Delete both in the same commit.

Gate 198 on the same reasoning as 196 above: an install below the floor cannot
run at all, so once the floor has passed the build this shipped in, every
install still running has done the handover.

---

## Gate 206 — `HomeView.helpAnsweredAt` optionality

When the newest answer to any of an account's help questions was written, added
to Home's snapshot on 2026-09-15 so that the *Support* tab can wear a dab
without the help view being fetched —
`decisions/2026-09-15-the-two-dabs-are-not-symmetrical.md`. Optional because a
server that predates it sends no such key, which is what an installed build
meets between its release and the deploy that follows.

Set unconditionally in `homeFor`, `server/src/app.ts`, from
`Help.lastAnsweredAt`. The client-side tolerance is `answersWaiting` in
`app/src/state/helpSeen.ts`, which takes `number | null | undefined` and reads
every absent case as *nothing waiting* — the quiet direction, so an old server
means no mark rather than a mark nobody can clear.

**What must not be deleted with it**: the `undefined` arm of `answersWaiting`
is the shim; the `null` arm is not. Null is what a current server sends for an
account whose questions are all unanswered, which is most of them, and will go
on sending for ever. Nor does this touch the `loaded` gate in `ListSwitch` —
that is the half-second before the keychain answers, and it is needed against a
current server exactly as much as against an old one.

Gate 206 because build 205 is already tagged: the client that speaks this ships
in the next upload.

## `chime` negotiates its own argument count

**Gate: none. This one is not waiting for a floor**, and is the only entry here
that is not — it is listed because it is exactly the shape of thing this file
exists to keep track of, and because deleting it would be silent.

`modules/audio-route/index.ts` calls the native `chime` with four arguments,
then three, then two, then one, keeping the first form the binary accepts.

**What it protects is development, not installs.** An Expo `Function` throws
when it receives more arguments than it declares —
`validateArgumentsNumber` in `expo-modules-core`, on `received > argumentsCount`
— and the caller's `catch` turned that into `false`, which is exact silence.
On 2026-09-15 `chime`'s signature moved four times in a day while a quiet chime
was being chased, and each move silenced any bundle running ahead of its binary:
a new symptom, arriving mid-investigation, wearing the face of the one being
investigated. A JavaScript reload does not rebuild native code, so this is the
normal state of a working session, not an edge case.

**So it goes when the signature stops moving, and not before.** There is no
build number that frees it — the thing it shims is the gap between a Metro
bundle and the binary under it, which has no floor. `chimeArity()` reports which
form was taken and the lab prints it, so a reading taken off chips the sound
never had is visible rather than assumed.

**Since 2026-09-17 the step down is no longer only a loss of detail.** `via` is
the first argument dropped, and it now carries the choice of path — so a bundle
negotiating down to three arguments or fewer plays the chime down the alert
path, which a phone in silent mode does not play at all. That is the exact
fault the path change was made to fix, reappearing on a stale binary and
looking like the fix not having worked. `chimeArity()` reading less than four
is the reading that tells them apart, and the answer is a native rebuild rather
than another day in the renderer.

Covered by `app/src/audio/__tests__/chimeArity.test.ts`, which is the only jest
coverage this module has: `load()` returns null off iOS, so everything else in
it is a null check under test.

## Gate 212 — `HomeView.cohortEligible` optionality

Whether a *getting-started channel* is waiting on this account turning
notifications on, added to Home's snapshot on 2026-09-15 alongside the
placement gate —
`decisions/2026-09-15-a-cohort-seat-goes-to-somebody-who-can-be-told.md`.
Optional because a server that predates it sends no such key, which is what an
installed build meets between its release and the deploy that follows.

Set unconditionally in `homeFor`, `server/src/app.ts`, from
`ChannelRegistry.wouldPlaceInCohort`. The client-side tolerance is the `?? false`
in `AppProvider.tsx`, where absent reads as *no cohort is waiting* — the quiet
direction, and the behaviour of every build before this one: the notification
question then falls back to needing `somebody`, exactly as it did.

**What the deletion is not.** Removing the optionality means removing the
`?? false` and the `?` in the interface, and nothing else. The parameter on
`worthAsking` stays: it is not a shim but the second reason this policy has,
and a build that dropped it would refuse to ask a lone arrival about the one
permission that would fetch them a room.

Gate 212 because `build/211` is already tagged: the client that speaks this
ships in the next upload.

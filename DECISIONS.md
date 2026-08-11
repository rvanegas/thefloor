# Decisions

What was built, why it was built that way, and what it cost to find out. Also
what was considered and deliberately not built, which is the half most likely to
be mistaken for an oversight.

This is history rather than work. Nothing here is outstanding; see BACKLOG.md
for that. It is kept because the reasoning is the expensive part and it does not
survive anywhere else — a commit message is read once, by whoever is already
looking at the diff, and never again by the person about to make the same
mistake.

**On vocabulary.** What this project used to call a session is now a channel,
renamed on 2026-08-10 when it stopped being a short-lived conversation and became
a permanent place. Historical passages below still name types and files as they
were at the time — `SessionView`, `SessionState` — and those are now
`ChannelView` and `ChannelState`. Two other things in this codebase are also
called sessions and are unrelated: the auth session behind a bearer token, and
LiveKit's `AudioSession`. Neither was renamed.

---

## Shared audio playback during a channel

**Status:** built and deployed to the server 2026-08-09. Raised the same day as
"can we play YouTube so both people hear it, audio only", and answered as
something narrower: a file the user supplies, played to both parties by the
server.

The client shipped to TestFlight pointed at `https://thefloor.rvanegas.co`.
TestFlight only — the app has not been submitted for App Store review.

### iOS build 2 did not start at all, and why

**Build 2 rendered a black screen for every tester.** It shipped without
`expo-document-picker`'s native module, because `bin/release-ios` ran
`expo prebuild` *without* `--clean` and prebuild reused the existing `ios/`,
never linking the newly added pod. `ExpoDocumentPicker` appeared nowhere in
`Podfile.lock`.

What turned a missing optional module into a dead app is the import graph.
`expo-document-picker` resolves its native module at module scope —
`requireNativeModule('ExpoDocumentPicker')`, with no optional variant — and
`App.tsx` → `SessionView` → `api/upload.ts` reached it at startup. So it threw
while the bundle was still evaluating: React never mounted, and the root view
showed the app's own background colour, `#0E1013`. It looked like a rendering
bug and was a linking failure.

Three things changed as a result:

- **`bin/release-ios` uses `--clean`.** Regenerating costs a couple of minutes;
  shipping an app that cannot launch costs a build and everyone's time.
- **It verifies linking before archiving**, comparing `Podfile.lock` against
  the autolinker's own list. The expected pods come from
  `expo-modules-autolinking resolve` rather than from guessing pod names off
  package names — `expo-status-bar` is JS-only and has no pod, so the naive
  mapping fails the release for a module that was never meant to be there.
- **The picker loads lazily** (`api/upload.ts`). Choosing a file is one
  feature, and failing to load it should cost that feature rather than the
  whole app, however well the linking is guarded.

The general lesson: a native dependency added to `package.json` is not a native
dependency in the build, and nothing between the two fails loudly. The gap is
only visible in `Podfile.lock`.

**Playback is confirmed working on a device** (2026-08-09, iOS build 3): a file
uploaded, both parties heard it, and the transport controls behaved.

**The recording half is still unverified.** No channel has yet recorded while a
track was playing, so nothing has confirmed that a media stem is captured,
uploaded, and mixed into an export. The only recording in the database predates
the feature by fifteen hours. To test it, one channel must start recording,
play something, claim the floor, then end — and the export checked for the
track and for the silenced speaker still being gated.

### It was choppy first, and why

The first device test played badly. The pump was paced on
`AudioSource.captureFrame` resolving when audio had played out, which it does
not do — it awaits the FFI acknowledgement that the native side took the
buffer, and the promise it keeps for playout is consumed by `waitForPlayout`
alone. So the loop ran at ffmpeg's decode speed, many times real time, and
overran the one-second native queue.

Pacing now comes from the wall clock, and the decoder pauses its pipe past a
high-water mark rather than accumulating a whole decoded track in memory —
which the pacing fix would otherwise have made considerably worse. Both are
pinned by tests.

The lesson worth keeping: **a promise resolving is not evidence of what it
waited for.** The plan for this feature asserted that `captureFrame` provided
backpressure, in bold, and built the pacing on it. Nothing checked until a
person listened.

Either party uploads an audio file; the server decodes it and publishes it into
the LiveKit room as a third participant, so both hear the same thing at the
same moment. It is included in the recording as its own stem.

### What the floor does to it, which is not what the note assumed

The original note asked "does a claim pause it? does it duck? does the silenced
party still hear it?" — all three framed around protecting a speaker from
competing sound. That framing was rejected on 2026-08-09.

> **A claim does not pause playback. It grants the claimant exclusive control
> of it.**

The purpose of the floor is to be in control of what is heard, not merely to be
heard. So a claim changes nothing about what the track is doing and everything
about who may change it: while someone holds the floor, only they may load,
play, pause, seek, re-level or remove it. While nobody holds it, either party
may.

This is also the cheaper design. It is one guard — `canControlPlayback` in
`core/channel.ts`, derived from `floor.holder` rather than stored — where
pausing would have been coupled state transitions that every path moving the
floor had to drive correctly, including expiry and a holder dropping off.

### YouTube is still out, for the reasons already recorded

The YouTube API Services Terms require the embedded player to be visible and
unobscured, and prohibit separating audio from video; fetching the audio
server-side is a clearer violation again. Nothing here changes that. What was
built is the "audio the user already owns" option, which carries no third-party
terms at all.

### How it works

- **A pump per channel** (`server/src/playback.ts`) produces a continuous
  stream of 10ms frames for as long as a track is loaded: decoded audio while
  playing, silence otherwise. `ffmpeg` decodes; `@livekit/rtc-node` publishes.
- **Seeking and resuming are the same operation** — both re-open the decoder at
  a position. Volume scales the samples in passing, so it lands on the next
  frame rather than after a respawn.
- **The recording gets the same frames**, tee'd into a second `ffmpeg` that
  encodes the stem live. What is stored is what was heard — the seeks, the
  pauses and the volume are in it because they are the same bytes, not because
  anything replayed them afterwards.
- **Alignment is the pump's job.** A track loaded partway through a recording
  has exactly that much silence prepended to its stem, so the export mixes it
  against the speakers' stems by plain concatenation. `server/src/export.ts`
  needed no change at all.
- **The media participant is not a speaker.** It never claims the floor, is
  never silenced, and carries no windows in the floor timeline.

### Decisions taken while building, worth knowing

- **The uploaded file lives on the server's local disk** for the channel's
  lifetime and is deleted when it ends. No presigned URL, no new credential.
  Stems upload with the PutObject-only key LiveKit already has.
- **100 MB and an ffprobe check.** Duration comes from ffprobe rather than the
  client, because it drives the scrubber and the end-of-track transition.
- **One track at a time.** Loading another replaces it, and does *not* re-open
  the media participant — swapping the file mid-recording would otherwise break
  the stem in a way the export cannot express.
- **Default volume is 0.7** (`PLAYBACK_DEFAULT_VOLUME`), on the grounds that
  shared listening runs underneath a conversation rather than instead of one.

### The risk that was accepted deliberately

**Exports carry whatever was played.** This was chosen with the trade-off
stated: a conversation with a copyrighted track mixed into it is a different
thing to redistribute than a conversation. The media is a separate stem, so
excluding it is a change at encode time rather than a re-architecture — drop
the `media` key from `stems` in the export route and it is gone.

### Not done

- **No scrubber and no volume slider.** Seeking is ±15s buttons and volume is
  ±10% buttons, because a draggable control means `@react-native-community/
  slider`, a native module, and a rebuild. The state supports any position and
  any level; only the input is coarse.
- **Nothing has been run on a device.** The pump, the publisher and the live
  stem encoding are covered by tests against fakes and by integration tests
  against `MemoryMediaServer`, but no real audio has travelled through
  `@livekit/rtc-node` in this project. That is the first thing to do when this
  is picked up, and the most likely place for a surprise.
- **No back-pressure story if the decoder stalls.** A starved frame is
  published as silence, which keeps the clock honest but would sound like a
  dropout. Untested, since a local file decodes far faster than real time.
- **A second `@livekit/rtc-node`** now sits alongside `livekit-server-sdk`.
  Both are needed — the latter has no media plane — but it is a second native
  dependency on the deployment box, with `linux-x64-gnu` bindings.

---

## Multiple users in a channel

**Status:** implemented 2026-08-09. Channels hold up to six people
(`MAX_CHANNEL_PARTICIPANTS`, then `MAX_SESSION_PARTICIPANTS`); the roster is
chosen at creation (`POST /channels`, then `/sessions`, takes `contactIds`) and
any participant may invite more mid-channel
(the `INVITE` action — the invitee must be a contact of the *inviter* only). A
claim silences every other participant to every listener, the silenced from
each other included. Stems now carry a per-segment `startMs`, so someone who
joins mid-recording is placed at the right offset by the export; legacy plain
key lists still export by concatenation. The DB gained a `participants` JSON
column on `channels` and `recordings`, backfilled from the legacy two-party
columns at open. Wire compat broke deliberately (`SessionView.participants`,
`RejoinableView.others` etc.); build 4 needs replacing alongside the server
deploy.

Deliberately deferred, as designed below: with four or more, everyone outside
the two most recent speakers ties at zero delay and races.

The design that was implemented:

The original note said the channel does not display who you are speaking with.
It does — the other party's name is the largest thing on the screen — so that
step is done and the work is the rest.

### The eligibility rule, generalised

> **Whoever spoke longest ago may claim immediately. Everyone else waits ten
> seconds for each person who spoke longer ago than they did, up to twenty.**

Anyone who has never claimed counts as having spoken longest ago.

The invariant that shapes it: **someone must always be able to claim without
delay.** Since somebody is always last in that ordering, somebody is always at
zero, and the floor can never sit free and unclaimable. An earlier draft ranked
by the last two claims and gave 20s / 10s / 0s by class — which left two people
at 10s and 20s with nobody at zero, and so produced dead time.

What it yields:

| | |
| --- | --- |
| Two people, both eager | Gapless alternation — the original guarantee, intact |
| Three, all eager | Gapless rotation; the least-recent speaker is always free |
| Two eager, one quiet | The pair are held 10s and 20s while the quiet one is at zero |

That third row is the point. The gap is not a pause added for fairness; it is
the pair being held back while the person who has not spoken has the floor to
themselves, should they want it. If they do not take it, the pair resumes ten
seconds later and nothing is lost.

### Known limitation, deliberately deferred

**With four or more, everyone outside the two most recent speakers is at zero
together, so they race.** Whoever taps first wins. The rule bounds how often any
one person can hold the floor, but does not order the people waiting. To be
addressed as a later feature — noted here so it is not mistaken for an
oversight.

### What it costs in state

`floor.lastClaimant: UserId | null` becomes a timestamp per person —
`lastClaimedAt: Record<UserId, number>` — from which the ordering is derived, so
nothing needs maintaining separately. `FLOOR_SAME_USER_COOLDOWN_MS` is replaced
by a ten-second step with a twenty-second cap.

`SessionState.initiator` / `invitee` become a participant list, and
`otherParty`, `bothPresent` and the protocol's singular `other` all follow.
Recording already generalises: stems are per participant and the floor timeline
is per identity, so neither needs changing.

### Decided at implementation

- People are added at creation *and* during a channel, by any participant.
- The maximum is six.
- A claim silences everyone else, present or not — and pairwise: two silenced
  people do not hear each other either, so the full matrix is N×(N−1)
  subscription statements per transition rather than one.

---

## Multiple auth per user — done

**Status:** complete as of 2026-08-09, both sides. The server enforces one
session per account, and the client catches up: `api/http.ts` turns any 401
into a sign-out via the `onSignedOut` listener, and `ws.ts` re-checks each
socket's token on the heartbeat sweep, closing revoked ones with 4401 — which
`api/socket.ts` treats as terminal. (Commit `12e35bc` fixed exactly the two
items below; they are kept for the reasoning.)

The server enforces one session per account as of 2026-08-09.
`issueToken` revokes every existing token for the account before minting a new
one, so signing in anywhere ends the session everywhere else. `Accounts.
revokeAllForAccount` is the operation behind it, and the only one that can
reach a session whose token you do not hold — signing out on the device in your
hand cannot revoke the one you lost.

That was the point. A token is good for ninety days, and nothing in the product
lists or cancels a session, so signing in elsewhere is the only signal
available that a device may have left the owner's hands. The accepted cost is
that a genuine second device signs the first one out.

### What the app still does badly with it

The server is right; the client has not caught up, and this is now reachable
rather than theoretical — any second sign-in produces it.

- **A revoked token is only noticed at launch.** `AppProvider` handles a 401
  when restoring a stored token, and nowhere else. Mid-session, a revoked
  device's next HTTP call surfaces the raw error instead of signing out.
- **An open websocket is never re-checked.** `ws.ts` authenticates once at
  connect, so the kicked device keeps its live conversation — microphone
  included — until something makes it reconnect.

Neither is dangerous: the revoked token cannot start anything new, and the
session it is still in was already one it was entitled to. But the experience
is a stale screen and a confusing error rather than "you signed in on another
device."

When picked up: treat a 401 from any call as a sign-out (`api/http.ts` is the
one place all of them pass through), and have the server close sockets whose
token has been revoked. Both need a TestFlight build to reach anyone.

---

## Spec interpretations open to review

Places the spec was ambiguous and the implementation chose. Each is a candidate
for "actually, do the other thing."

1. **"Silenced" vs. "does not hold the floor"** (§Recording, control
   restriction). The spec equates them, but when nobody holds the floor neither
   party is silenced. Implemented per the clarifying sentence that follows:
   pause/stop are withheld **only** from the non-holder **during an active
   claim**. `canPauseOrStopRecording` in `core/recording.ts`.
2. **"After both users have connected"** (§Recording). Read as *ever* connected,
   not *currently* present, so a party left alone can still start a recording.
   Consistent with the spec's insistence that recording survives leaving.
   `everPresent` in `core/types.ts`.
3. **Resume carries no floor restriction.** The spec names only pause and stop.
   Resuming does not cut off the record, so a silenced party may resume.
   `canResumeRecording` in `core/channel.ts`.
4. **Cooldown is strictly greater than one minute.** "More than one minute has
   elapsed" is `> 60_000`, so reclaiming at exactly 60.000s is refused. The
   off-by-one in the user's favour would be `>=`.
5. **The initiator is present from creation**, so the empty-channel timer never
   runs before the first join. Matches "the initiator lands in the Channel view
   immediately."
6. **The floor is cut at the listener, not the speaker.** The spec calls it "a
   hard cut at the transport/mic level". It still is — LiveKit stops forwarding
   those packets, so the audio never reaches the other device — but it is made
   by unsubscribing the listener rather than silencing the speaker. Acting on
   the speaker was tried twice and both ways broke them: a server cannot un-mute
   a track it muted, and revoking publish permission tears down iOS's audio
   unit. `setSilenced` in `server/src/media.ts`.
7. **Capture is not the privacy boundary; the export is.** Stems contain what a
   silenced speaker said, and the floor is applied when the recording is
   encoded. The bucket is server-only and stems never reach a client, so the two
   conditions that matter — not heard live, not heard in an export — both hold.

---

### Not a defect: requesting someone who already requested you

Considered and declined (decision, 2026-08-08). `requestContact` treats an
inbound pending request as an acceptance, so the pair goes straight to
`accepted` with no confirmation.

That reads intent correctly — requesting someone who has requested you is
consent to be their contact — and reaching it means walking past the obvious
affordance to find an obscure one: incoming requests sort to the top of the
contact list with Accept and Decline beside them, while this path requires
scrolling to Add Contact and typing their address instead.

The only cost is silence: the user learns of it by noticing the person is now
accepted. If it ever wants improving, the fix is a sentence rather than a rule
— "they had already requested you, so you are now contacts" — and not a change
to the model.

---

### Not a defect: recording has no maximum duration

Considered and declined (decision, 2026-08-08). A channel with someone present
records until stopped, and nothing caps it.

Running away with it requires a phone left foregrounded and unattended — and
note that a screen lock does not reliably prevent this, since the app survived
five minutes backgrounded with its connection intact, and capture is
server-side egress that does not care what the phone is doing. It ends only
once the socket actually dies — now detected within about twelve seconds by the
heartbeat, then a minute of grace, then the empty-channel minute. Before the
heartbeat existed that bound was theoretical: a half-open socket went unnoticed
for hours, so nothing was ever removed and a forgotten recording really could
run indefinitely.

Against a cap: the spec puts no bound on channel length, and cutting off a long
conversation mid-sentence is a poor trade for an app whose premise is
protecting someone's speaking time. Both parties also see a persistent red dot
throughout, which is the answer the spec already gives to this question.

Worth knowing operationally rather than fixing in code: **egress is billed per
minute per stem, and per-speaker capture runs two**, so a recording costs twice
what a room mix would. Watch it on the LiveKit dashboard rather than in the
reducer.

---

## Profiles, and why a bio is not on every account

Built 2026-08-10. A person has a display name they can change and a Markdown
bio, edited on their own screen, reached from Home.

**The bio is deliberately not on `PublicAccount`.** That type is embedded in
every roster, every invitation and every recording row that crosses the wire,
so putting a paragraph on it would repeat that paragraph per participant per
snapshot, to be displayed in none of them. A profile is its own type, fetched
when somebody asks to see one.

**Who may read one:** yourself, a contact, or anyone who shares a live channel
with you. The third case is the point of the feature — you are talking to
somebody an acquaintance brought in, and you want to know who they are. It is
membership rather than presence, so it survives either of you stepping out.

Anyone else gets a 404, identical to the answer for an id that does not exist.
Without that, the endpoint would be a directory anyone could walk to discover
which account ids are real.

**Writes are partial.** A field left out of the request is left alone, so
saving a bio cannot blank a name the client did not happen to send. An empty
name is refused outright rather than trimmed to nothing: somebody with no name
is an empty space in every roster they appear in, which is worse than a failed
request. A blank bio does clear it, because having nothing to say is a
legitimate thing to mean.

The Markdown is the same subset a channel description uses, rendered by the
same `InlineMarkdown` and stored as the source somebody typed — see the
description work for why the renderer is written here rather than depended on.

---

## Presence is not a screen

Built 2026-08-10. You can walk back to Home from a channel without leaving the
conversation: look up a contact, read a profile, start a second channel, and the
first one is still in your ear.

The reducer has always treated presence and navigation as unrelated — `present`
changes only on ENTER, STEP_OUT, LEAVE_CHANNEL or a grace period running out,
and never on anything the client renders. The app was the only place the two
were conflated, and only by accident of structure: `useSessionAudio` was called
inside the channel screen, so unmounting that screen tore down the LiveKit
connection. A plain back button would have looked like navigation and silently
ended the call.

The connection now lives in `App.tsx`, above the screen switch, and follows the
channel the *server* says you are present in rather than the channel whose
screen is mounted. Going Home dispatches nothing and does not unwatch — the
snapshot has to keep arriving, since it is what reports that you are still
present.

**The risk this introduces is a live microphone behind a screen that gives no
sign of it**, which would be worse than having to step out first. So Home
carries a bar naming the channel and how many people are in it, tapping it
returns, and it announces itself as a button rather than being a mystery
rectangle to anyone using VoiceOver.

---

## Connecting to somebody you met in a channel

Built 2026-08-10. Tap a person in a channel's roster to see their profile,
and ask them to be a contact from there.

The obstacle was never the interface. Contact requests went by email address,
and meeting somebody in a channel an acquaintance opened gives you their name
and their account id and nothing else — so the existing path would have meant
showing you their address first, which is theirs to give out rather than ours
to disclose so that a button can work. Hence a by-id request route, sharing its
whole second half with the by-address one: the difference between them is only
how the other person is named.

**Sharing a channel is what entitles you to ask.** Account ids travel in every
roster, so without that check an id would be a way to pester anyone who ever
appeared in one. Refusals answer 404, identical to a nonexistent id, so the
route cannot be used to find out which ids are real — the same rule, and the
same reasoning, as reading a profile.

**Being in a channel together is permission to ask, not consent to be
anybody's contact.** It sends an ordinary pending request and the other person
decides, exactly as an emailed one does. Somebody who has already asked you
gets the existing treatment: the request goes straight through as an
acceptance, on the grounds that asking somebody who asked you is agreement.

---

## Presence is exclusive

Fixed 2026-08-10, after being reachable in the shipped app: go Home from a
channel, tap a second one, and you were left marked present in both.

Nothing had gone wrong in the reducer, which is the point. Entering is a fact
about one channel and stepping out is a fact about another, and no rule
connected them, because the reducer sees one channel at a time and cannot.

What made it worse than merely leaving is that `rejoinableFor` filters out
channels you are present in — reasonably, since you would be looking at one
rather than needing a way back to it. So being wrongly marked present made the
first channel invisible on your own home screen at the same moment it became
unreachable, while everybody still in it saw you as Present with your audio
connected somewhere else entirely.

A person has one microphone and one pair of ears, so entering somewhere now
steps you out of wherever you were, applied in the registry — the only place
that can see a person across channels. Everything that ordinarily follows a
departure follows this one: a floor claim is released, and a recording left
with nobody in it stops and files itself.

---

## Notifications, and why the server talks to Apple itself

Shipped 2026-08-10. Until this, a channel could only reach you if your app was
already running: the invite travelled over the websocket and rendered as a
banner on Home, and if the socket did not exist nothing arrived. That was a
deliberate scope decision, and the cost of it was that the first thing anybody
does is check the lock screen, where finding nothing reads as the app being
broken.

Two events now produce a notification, and the second is the one the interface
implies most strongly:

- **An invite**, when a channel is created — the same event the socket already
  carries, delivered a second way.
- **A channel becoming active**, meaning presence going from nobody to
  somebody. A channel is a permanent place, so what is worth knowing about one
  is not that it exists but that there is currently a person in it.

### Direct APNs rather than Expo's push service

The server holds an APNs `.p8` auth key and signs its own provider JWTs against
`api.push.apple.com` over HTTP/2, in `push.ts`, with no dependency: Node 24 has
`node:http2` and `node:crypto`, which matches the no-native-dependencies stance
in `db.ts`.

The alternative was `getExpoPushTokenAsync` plus `exp.host`, which is less code.
It was declined because it puts a third party in the path of every notification
and pulls in EAS credential management, which BACKLOG deliberately defers until
Android arrives. The APNs key is a fourth credential alongside LiveKit,
`thefloor-egress` and `thefloor-server`, held the same way and scoped the same
way, and the local `xcodebuild` release pipeline needs nothing added to it.

The one place this is sharper than it looks is the JWT signature. Node's default
ECDSA encoding is DER; JWS requires the raw `r||s` form, and APNs answers a DER
signature with a bare `InvalidProviderToken` that names nothing about the
encoding. `dsaEncoding: 'ieee-p1363'` is the fix, and there is a test asserting
the signature is 64 bytes and verifies — the bug is otherwise invisible without
a round trip to Apple.

### Nobody with the app open is sent one

`Reachability.inApp` — the socket layer's `hasConnection`, exposed the way
`HomeNotifier` is — filters every recipient. Somebody holding a live connection
is already being told, so a notification would be a second copy of what is on
their screen. The client sets a notification handler that suppresses the banner
too, for the moment the two disagree, which is a reconnect.

This is why the plumbing goes through a `PushNotifier` rather than being called
directly: `ChannelRegistry` decides that something is worth telling people
about, and has no business knowing about device tokens, Apple, or who happens
to be looking.

### A five-minute quiet window per channel

Presence is derived from the websocket, so one person on a bad connection
produces a run of empty-to-occupied transitions that are a network artefact
rather than anything happening in the room. Without the window every flap rings
everybody. It is held in memory: a restart resetting it costs at most one extra
notification, which is not worth a column.

The window has to outlast a reconnect, and `DISCONNECT_GRACE_MS` is a minute,
so anything shorter would let a single flap through.

### Device tokens are stored in the clear

Unlike `tokens` and `otp_codes`, which are hashed. A device token is an address
rather than a credential — holding it lets you ask Apple to show that device a
notification and nothing else — and hashing it would only make it unusable,
since the whole point is to send it back.

The row is keyed on the token rather than on a pair, which is what makes
registration an upsert. A phone that signs out and signs in as somebody else
keeps the address Apple gave it, so the row has to *move*; a second row would
put one person's conversations on another person's lock screen. That is the
defect the registry test exists for.

### The entitlement is pinned to production

`app.json` passes `{ "mode": "production" }` to the `expo-notifications` plugin
rather than taking its default. The plugin writes `aps-environment` into the
entitlements once, at prebuild, with no knowledge of Debug versus Release, and
its default is `development` — which would have the app asking for a sandbox
entitlement on a build headed for TestFlight. The failure that follows is a
`BadDeviceToken` naming the token rather than the environment.

Pinned rather than left to the export to sort out. The export *does* re-sign for
distribution and did produce `production` from an app requesting `development`,
so the default might have worked — but "might, because a later signing step
overrides what we asked for" is not a thing to depend on for the setting most
likely to be silently wrong.

Pinning it means a locally built app is also production-entitled, so testing
push against `expo run:ios` takes flipping `mode` and setting `APNS_ENV=sandbox`
together. That is the right way round: the build that reaches people is the one
that should work without anybody remembering a setting.

### `voip` and `remote-notification` stay out of UIBackgroundModes

A visible alert needs neither. `remote-notification` is for silent
content-available pushes, and `voip` only becomes load bearing under PushKit,
which this does not use. AGENTS.md records that reviewers object to an app
declaring a background mode it does not use, and that reasoning did not change
because a different notification feature shipped.

### The volume buttons change step size below 10%

Quieter and Louder move a tenth at a time down to 10%, then a single point at a
time below it. Music playing under a conversation lives in that bottom range,
and there a whole tenth is the difference between a bed and silence — 10% to 0%
in one tap, with nothing in between where the useful settings are.

Both directions snap to a multiple of the current step rather than adding to
whatever is there, so a volume that is not already on the grid — the 70% a
track starts at, a value from some other client — walks onto it instead of
carrying an offset forever. The boundary is asymmetric on purpose: at exactly
10%, Louder takes the coarse step to 20% and Quieter takes the fine one to 9%,
which is what makes a tap reversible by the opposite tap.

It lives in `app/src/ui/volume.ts`, not in `core/`. This is how the controls
behave, not a rule anyone is held to: the reducer accepts any volume and only
clamps it to 0–1, so a client offering a slider instead would be no less
correct.

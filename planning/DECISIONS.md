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

**And a channel is never called a room.** The word belongs to Clubhouse, and a
product that borrows a competitor's vocabulary invites the comparison it should
be avoiding. The media layer does use it — `closeRoom`, `setSilenced({ room })`,
`issueToken({ room, identity })`, `new Room(...)` in the app — because it is
LiveKit's own term for a LiveKit thing, and none of it reaches a screen. The
test is whether a user could ever read the word: in the code it is the media
plane's vocabulary; in the interface it does not exist.

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

What made it worse than merely leaving is that `rejoinableFor` used to filter
out channels you were present in — reasonably, it seemed, since you would be
looking at one rather than needing a way back to it. So being wrongly marked
present made the first channel invisible on your own home screen at the same
moment it became unreachable, while everybody still in it saw you as Present
with your audio connected somewhere else entirely. That filter is now gone; the
next section is why.

A person has one microphone and one pair of ears, so entering somewhere now
steps you out of wherever you were, applied in the registry — the only place
that can see a person across channels. Everything that ordinarily follows a
departure follows this one: a floor claim is released, and a recording left
with nobody in it stops and files itself.

---

## A recording belongs to the channel it was made in

Recordings used to be a flat list on Home, belonging to whoever had been in the
run and outliving everything else — the channel could end and its recordings
stayed, reachable for ever by their original audience. They now belong to the
place: shown on the channel's own screen, visible to its members, deleted with
it.

**Membership of the channel is the whole access rule**, and it cuts both ways
deliberately. Someone invited today can play a conversation recorded last year;
someone who leaves loses recordings of conversations they were in. The
alternative — membership *and* having been in the run — was considered and
declined: it keeps a recording reachable by a person the channel no longer
belongs to, and it makes "who can hear this" a different question from "whose
channel is this", which is exactly the question this change exists to collapse.

The consent question that hangs off the widening half is real and is not
answered here. See BACKLOG.md, "Two-party consent".

### The last member cannot leave, only delete

Leaving means the others keep it. With nobody else, the same tap now destroys
the channel *and* every recording in it, and an action that means "see you
later" for everyone else must not quietly mean that. So `canLeaveChannel`
refuses the last member and `canDeleteChannel` admits only them: one control in
one place, wearing a different name, a different colour and a different
confirmation depending on which it is.

Both refusals are stated out loud by the registry rather than left to the
reducer's inertness, which is how every other guard here works. A client that
deleted nothing and was told nothing walks the user back to Home as though the
channel were gone — and build 20 and earlier send `LEAVE_CHANNEL` as the last
member, that having been how a channel ended, so they get a sentence naming
what to do instead of a button that does nothing.

**The confirmation is two dialogs.** One is the pattern everywhere else in this
app and is not enough here: what goes is unrecoverable, it is the only copy
anybody has, and the tap that starts it sits where "leave" sat in every
previous build. The second says the count out loud — somebody about to lose
four recordings should have read the word "four" before it happens.

### Marked, then swept a week later

Deleting sets `deleted_at` on the channel and on its recordings. Nothing is
removed for `DELETED_RETENTION_MS`, which is seven days.

Not an undo: there is no way back in the app, and the recordings are
unreachable from the moment the channel goes, there being no members left to
reach them. What the week buys is that a mistake is still recoverable *by
hand* — the rows are marked rather than gone, and so are the objects they name.
It also keeps `recordings.channel_id` pointing at something real for the whole
week, which a delete-now-cascade-later scheme would not.

Two orderings in the sweep are load-bearing:

- **The bucket is emptied before the row is dropped.** A row is the only record
  of which objects belong to a recording, so the other order leaves objects
  nobody can ever identify, paid for indefinitely. A failed delete leaves the
  row for the next sweep, which is the recoverable direction.
- **A channel goes only once nothing points at it**, so a recording whose
  objects would not delete keeps its channel alive rather than orphaning the
  row or failing the constraint.

`deleted_at` is its own column rather than a reading of `ended_at`, and that
distinction protects real data: channels that ended under the old rule — where
the last member leaving ended the channel and *kept* its recordings, as the
interface said in as many words — are ended and not deleted. Inferring one from
the other would have the first sweep destroy exactly what that rule promised.

### Playing one back is loading it as the channel's track

There is no second playback mechanism, and that is the whole design.
`POST /recordings/:id/play` mixes the stems exactly as an export does, writes
the result to the same kind of per-track temp directory an upload uses, and
hands it to `loadTrack`. From that moment it *is* the channel's shared track:
played, paused, sought and levelled by the controls already on the screen,
published into the room by the media participant that was already there, and
governed by the same rule that whoever holds the floor decides what plays.

Nothing in `core` changed for it. The reducer already had `SET_TRACK`, which is
server-minted and unreachable from a client — the same protection the upload
path relies on, and for the same reason: only the server knows where a file
landed.

**The channel is the recording's own, never one the caller names.** It is read
from `channel_id`, so a recording cannot be piped into a different room. The
permission check is `recordingsFor`, the same function the export endpoint
asks, so what may be played and what may be downloaded cannot come apart.

The duration is probed from the mix rather than copied from `duration_ms`: one
is what was captured and the other is what the file came out as, and the
scrubber runs on the second. The mix is encoded per request, like an export —
the stems are the durable artefact, so a change to how the floor is applied
reaches old recordings instead of leaving a stale file that lets a silenced
remark through.

Two consequences worth knowing. Playing a recording while recording puts it in
the new recording, because that is what the room heard — the same as any
shared track. And a long recording takes seconds to mix before it is loaded,
which is why the row that was tapped says "Loading…" rather than the screen
going quiet.

### The recordings with no channel left were deleted

Four recordings belonged to channels that ended under the old rule, where the
last member leaving ended the channel and kept what was recorded in it. Their
channel was gone, so channel membership could not answer for them, and the
screen they would now live on did not exist.

They were shown on Home for a day, under a section that said there was nowhere
left to find them and to export anything worth keeping, and they kept the rule
they were made under — whoever was in the run. On 2026-08-12 they were marked
for deletion instead: 1 to 61 seconds each, from the first two days of the
project, and nobody wanted them.

So the section is gone, and so is the branch in `recordingsFor` that answered
for them. Nothing can enter that state now that ending a channel means deleting
it, which is what makes removing the branch safe rather than merely tidy — and
the four rows were confirmed gone from the query before the code went.

What stays, and must: `deleted_at` is still its own column rather than a
reading of `ended_at`. There are still channels that are ended and not deleted,
and a sweep that confused the two would take recordings nobody asked it to.

### Renaming one, and why an empty name is refused

`PATCH /recordings/:id` takes a name and writes it to the row every member
reads. The reach test is `recordingsFor`, the same one play, export and delete
ask, so anybody in the channel may rename anything in it — including a run they
were not in and did not start. That follows from the recording belonging to the
place rather than to whoever pressed record, which is the sentence the rest of
this section is built on.

The consequence is that a rename is not a private label: it changes what the
recording is called for everyone at once, which is why the field says so above
the button. Anything else would have needed a per-viewer name, and a per-viewer
name is precisely what settling the name at stop time was built to get rid of —
two people who were in one conversation should be able to say its name to each
other.

**An empty name is a 400 rather than a clear.** Clearing looks free, because
`toRecordingView` already falls back when `name` is null, and for a *channel*
an empty `SET_NAME` is exactly how you unname it. But the fallback here is
`describeChannel(others)`, computed from the viewer's others — so clearing
would not restore the settled name, it would replace one shared name with a
different private one for each member. The settled name is not recoverable
once overwritten, and inventing a way to recover it would mean recomputing
`nameRecording` from `participants` and `participant_names`, which the rows
predating those columns cannot supply. A recording has a name; renaming gives
it another one.

The route is a `PATCH` on the recording rather than a `POST` to a sub-path,
because it changes a field of a thing that already exists — and its 404 for a
stranger matches the other three routes, while an unacceptable name is an
ordinary 400: the caller already knows the recording is there, so there is
nothing left to withhold.

In the app the field takes the place of the row's actions rather than joining
them, so Delete is never a thumb's width from a keyboard somebody is typing
into, and collapsing the row abandons the edit. It is a field rather than
`Alert.prompt`, which is iOS-only and is the one shape in this app that no test
can drive.

---

## Stepping out clears your self-mute; losing your connection does not

A mute is something you do *during* a conversation — to cough, to type, to talk
to whoever is in the room you are actually in. Carried across a departure it
stops being an action and becomes a setting: you walk back in an hour later
inaudible, on a decision you have no reason to remember, and nothing on the way
in tells you. So `STEP_OUT` puts the microphone back as it found it.

**The two departures had to stop being the same event for this.** They had
deliberately been one: the grace period running out dispatched `STEP_OUT`, so
that a dropped connection released the floor and stopped an emptied channel's
recording by exactly the path a tap takes — one route rather than two that have
to agree. That is still worth having, and now there is one rule that
distinguishes them, so there is a second action, `DISCONNECT_EXPIRED`, that
does the same departure without the intent.

Clearing the mute on a lost connection would be a hot microphone. The client
re-enters by itself when a socket comes back (`socket.ts`, `enteredChannel`),
so nobody would be asked and nothing would be tapped — the phone in your pocket
would simply start transmitting again, having been muted on purpose. A
deliberate departure has somebody's attention; a timeout has nobody's.

`DISCONNECT_EXPIRED` is issued by `TICK` and is absent from the server's
`CLIENT_ACTIONS` allowlist, so it is not reachable from a client. `LEAVE_CHANNEL`
needed nothing: it drops the `selfMuted` entry outright, membership being gone.

---

## Claiming the floor unmutes you, and holds you there until you release

A muted floor-holder is the one arrangement in which every microphone in the
channel is shut: theirs by their own hand, everyone else's by the claim. It is
also completely silent from the outside — the others see somebody holding the
floor, wait for them, and hear nothing, with no way to tell that from a pause
for breath. Nobody claims the floor in order to stay quiet, so `CLAIM_FLOOR`
clears the claimant's `selfMuted` entry, and `canSetSelfMute` refuses to put it
back while they hold it.

This is the same distinction as the section above: clearing a mute is safe here
because a claim is a deliberate act with somebody's attention on it, which a
lost connection is not. The microphone opens under a finger, not under a
timeout.

The way to stop talking is to release the floor. It costs nothing, hands the
room back, and returns the mute along with it — including when the three-minute
limit releases it for you, which is a release like any other. The interface
disables the mute control while you hold the floor and says so, on the general
rule that a disabled control and a refused action must not disagree.

Two things it deliberately does *not* do:

- **The silenced keep their mute.** Someone force-muted by another's claim
  gains nothing by muting themselves and loses nothing either, but the setting
  is theirs, and it is what they will be left holding when the claim ends.
  Clearing or freezing it would be deciding something on their behalf that has
  no bearing on the floor.
- **Unmuting is never refused.** `canSetSelfMute` gates only `muted: true`, so
  the guard can never strand somebody inaudible.

---

## One *unnamed* channel per set of people, and inviting moves the conversation

The rule was one live channel per set of people, full stop. It existed so that
repeated taps could not stack duplicates and leave an invitee with a pile of
banners from one person. It is now narrower — one **unnamed** channel per set —
and that narrowing is what makes naming a channel mean something.

The distinction it rests on already existed and was only ever cosmetic. A named
channel has a string every member reads and can say aloud to another member. An
unnamed one has a *description*, written from the viewer's side: you see "Dana
Chu", she sees your name. So an unnamed channel is not a place at all — it is
these people, talking — and that is why there can only be one of them per set.
Two would be indistinguishable on Home, both rendered as the same list of
names, and nothing could tell you which one anybody meant. Two *named* channels
holding the same people are perfectly sensible, because the name is what tells
them apart. Naming a channel is therefore the act that turns a conversation
into a place, and the reward for it is that you may have another.

### What inviting somebody now does

A named channel takes people in: `INVITE` adds a participant, exactly as it
always did. An unnamed channel cannot, because there is nothing to add them
*to* — it is its people, and a different set of people is a different channel.
So the invitation is recorded rather than applied, and when the invitee
arrives, everybody moves to the unnamed channel for the wider set. If one
already exists this is a change of channel and nothing is created; if not, it
is created on the spot.

**The move happens when the invitee arrives, not when the invitation is sent.**
Moving at invite time was the simpler build by some distance — it needs no new
concept, the invitation stays ordinary membership — but it strands the people
who did not do anything: A and B end up in a channel whose identity claims C is
in it, on the strength of a question C has not answered and may never answer.

The cost of the choice is a genuinely new thing in the model. An invitation
into an unnamed channel cannot be membership, because the channel it would be
membership of is not this one and may not exist yet. It lives in `invited` on
the channel it was sent from, which is also the channel it is *answered* at —
the invitee is shown that channel, taps to join it, and the server settles
where they actually land. `dispatch` therefore has one carefully drawn hole in
its authorisation: a non-participant may send `ENTER`, and only `ENTER`, and
only when they hold an invitation. Everything else still refuses them.

### What travels, and what stays

Presence travels. Membership does not. The channel left behind keeps its
roster, its description and every recording made in it, and stays on the Home
of everyone who belongs to it. A conversation moving on is not a reason to
destroy what was said before it did — and it would have been destruction, since
recordings belong to their channel and go when it goes.

Whatever was playing stays too, along with its file and its position, and its
playback participant is disconnected on the way out rather than left publishing
into a room that now belongs to somebody else.

### The audio does not move, which is the whole reason `mediaRoom` exists

A LiveKit room used to be named after the channel — `app.ts` said so in as many
words. A move would then change the room name, and every participant's
connection would be torn down and rebuilt to express something that is pure
bookkeeping: a dropped call, a fresh token, a renegotiation, all to say "this
conversation is now called something else".

So `ChannelState` carries a `mediaRoom` distinct from its id, and the
destination **inherits** it from the channel people are walking out of. Nothing
reconnects. The client keys its connection on the room rather than the channel
id, which is what makes an unchanged room an unchanged socket, and asks for a
credential by channel id only when it is actually connecting.

The channel left behind is handed a fresh room in the same breath. Two channels
naming one room would put whoever later walked into the empty one straight into
the conversation that moved on without them — the sharpest edge in the whole
change, and invisible until somebody hears a voice they should not.

`room` stays the media plane's word. It never reaches the interface; see the
note on vocabulary at the top of this file.

### Clearing a name is refused when it would make a second unnamed channel

It looks like a harmless undo and is not: it hands the channel back to the
one-per-set rule, and if those people already have an unnamed channel there
would then be two of them. Refused out loud with a sentence saying why, because
reducer silence here reads as a dead button. Renaming is always free.

### What an old build does with all this

The wire change is additive — two new fields on the channel snapshot and one
new server message — so build 23 goes on working, with three known dents:

- A conversation that moves out from under it leaves it watching the channel
  everybody left, showing itself absent. The destination is on Home as an
  ordinary row, so it is two taps away rather than lost.
- Invitations it sends into unnamed channels are recorded correctly by the
  server, but its own screen shows nothing happening, there being no
  participant added.
- Accepting one lands the user in the new channel and then tells that build the
  old one is gone, since it is no longer a member of it. Same recovery: Home.

Non-moving channels are untouched, `mediaRoom` being equal to the channel id
for every channel that has never moved.

---

## Membership is what puts a channel on Home, and nothing else

A channel you belong to appears on Home — as a row, or as the live banner, and
under every circumstance including restarts, reinstalls and disconnections. The
*only* reason for a channel not to be there is that you are no longer a member
of it.

Presence used to be a second reason, and it cost a real channel. Reinstalling
the app was enough: the old process's socket closed, starting the disconnect
grace; the new process connected inside that minute, which the server took as
proof the user was still in the room and cancelled the grace; and the channel
was then withheld from Home as one you were already looking at — by a process
that had never heard of it. `invitesFor` passes over anyone who has ever been
present, so it was not there either. A named, permanent channel with three
members and a recording hanging off it simply vanished, with no way back.

Two changes, and the split matters:

- **`rejoinableFor` tests membership alone.** Whether you are *live* somewhere
  is a display question, and the client is the only end that can answer it: the
  app knows what it is connected to, where the server knows only what it last
  believed. So Home lists every channel you belong to, and `HomeView` renders
  the one it is actually in as the banner instead of a row. When the two ends
  disagree, the failure is now a duplicate-looking row rather than a
  disappearance — visible, and recoverable by tapping it.
- **Opening a socket no longer asserts presence.** `watch.channel` reports
  `CONNECTED`, and the reconnect path re-sends `ENTER`; both come from a
  process that knows where it is. Connecting alone does not, and a process that
  asserts neither now lets the grace run out and is stepped out, which is the
  truth about it. Before, every reconnection renewed a presence nobody was
  holding — the ghost was not merely invisible to its owner, it showed up as
  Present to everyone else in the room.

The general shape is worth keeping: **when a client and a server disagree about
where somebody is, the safe default is to show more, not less.** An extra row
is a nuisance. A missing channel is indistinguishable from a lost one.

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

### Playback pauses when the channel empties, and does not resume

`settleEmpty` already stopped a recording when the last person stepped out. It
now pauses playback on the same trigger, for a weaker reason: a recording left
running bills an egress a minute, while a track left running only costs the
position. But music nobody is in the room to hear is not shared listening — it
is a file running itself out, so that whoever comes back finds it minutes
further along than they left it.

One trigger covers all three ways a channel empties — the tap, `LEAVE_CHANNEL`,
and a disconnect grace period running out — because all three go through
`stepOut`. The server needed no change: `applyPlaybackToMedia` reacts to
committed state, so the encoder pauses on any playing→paused transition
whatever caused it.

**Nothing resumes on the way back in.** Resuming would mean distinguishing a
track paused because the room emptied from one somebody paused on purpose, and
`playback.ts` deliberately records no reason for a pause — adding one would put
a second account of why playback is where it is next to the position itself. It
is also the worse behaviour: a channel that starts playing at whoever steps in
is a surprise, and a press of Play is not.

### An unnamed channel is described, and the interface admits it

A channel with no name falls back to its roster. That fallback is not a name
and must not look like one, which is the part the old code got wrong in a way
no amount of better wording would have fixed.

The trouble is that the fallback is computed **per viewer**. You read "Dana
Chu"; Dana reads your name. Rendered in the same slot and the same type as a
real name, in one list beside channels that do have names, it reads as a shared
proper noun — so people came away believing the channel was called that for
everyone, and then found they had nothing to say out loud. "Our channel" only
disambiguates when you have exactly one channel with that person, which
permanent channels make unlikely.

So a described channel now renders in italic against a named one's upright
type. Italic *only*: it was briefly dimmed as well, which said "less important"
on top of "not a name" — and these are not less important. Most channels have
no name, so dimming them made the greyest thing on the screen the commonest.
The wording stays viewer-relative, which is the honest form for a description
once it no longer pretends to be a name.

Three copies of the fallback had drifted, which is how "1 people" survived: with
everyone else gone, the header and the push title both rendered
`${others.length + 1} people`, while Home said "Just you". They now share
`core/naming.ts`. It sits in core for the same reason the reducer does — the
server writes the push title and the app writes the screen, and the two must not
disagree about what a channel is called. `nameFor` in the server already claimed
they agreed; it was wrong.

The description also stops at two names and counts the rest ("Dana, Miro and 2
others") rather than joining the whole roster, because it renders on one line in
a list row and channels hold up to six.

**Not done, and deliberately.** The lock screen gets the description with no
typography at all, since a push title carries no styling — the wording alone
carries it there. Recordings still ignore the channel name entirely
(`HomeView.tsx`, `'Unknown'`), because `RecordingView` has no name field and the
recordings row has no column; that is a protocol and schema change, and a
separate item.

### The disconnection warning waits, and the socket knows about foregrounding

Three faults, one symptom: the warning appeared on launch and on every return
to the app.

**Nothing listened for the app coming back.** iOS suspends the process; the
socket does not survive it, and the timers that would notice were suspended
too, so the clock only started on resume. The first sign of trouble was a
heartbeat failing up to `HEARTBEAT_TIMEOUT_MS` later — stale channels shown as
live until then, and the warning landing just as the user returned.
`Realtime.resume()`, driven by an `AppState` listener, replaces a dead socket
at once and probes one that still looks open rather than trusting it. It also
drops the reconnect backoff, which may have grown to ten seconds against a
network the phone is no longer on.

**`closed` stood in for two different things.** The provider starts at `closed`
and did not move until `realtime.connect()` ran — behind a keychain read *and*
a full `api.home()` round trip. Home reads `closed` as having tried and failed,
so a cold start on a slow network announced that the app could not reach the
server at the one moment it had not yet tried. The restore now says
`connecting` as soon as there is a token to connect with, and puts it back to
`closed` if it gives up.

**The grace period was a one-way latch.** Home held the warning back for two and
a half seconds — but only once ever, so every drop after the first connection
was announced instantly. Since a foreground *is* a drop, that meant every
foreground. `useOfflineNotice` arms the delay on each transition into being
offline. It keys on `status !== 'open'` rather than on the status itself, which
matters: keying on the status would restart the delay on every
`connecting`/`closed` flap of the backoff, and a phone with no route to the
server would flap its way to never warning at all.

The delay now covers all three places that report the connection — Home's
banner, the quieter `· reconnecting` beside the signed-in name, and the
in-channel "a dropped connection counts as leaving". A test asserted the old
behaviour explicitly ("a real drop, after a real connection: no grace this
time"); it was wrong about what a drop means on a phone, and now asserts the
opposite.

### Home lists named channels first, then by when each was last used

Two orderings, in that priority.

**Named above described.** A name is something somebody sat down and wrote, so
the channels that have one are the ones being kept deliberately. Sorting the
whole list by recency alone buries them among channels nobody has bothered to
name, which costs the naming most of its point — there would be little reason
to name a channel if doing so bought you nothing but italics.

**Within each group, most recently used first** — and that needed a field.
The list was ordered by `createdAt`, ascending, which was defensible when
channels lasted an afternoon and is not now that they are permanent: a channel
opened months ago and used daily sank below whatever was opened last week and
abandoned. `ChannelState.lastActiveAt` is stamped at creation, on every entry,
and again when somebody steps out — so an occupied channel reads as now, and an
empty one is ranked by when it went quiet.

Comings and goings only. Renaming a channel from its settings screen is not
using it and does not jump it up the list.

It rides in the durable JSON blob rather than a new column, so there is no
migration; rows written before it existed fall back to `created_at`, which is
the order they already had. The grouping itself lives in the app, being a
display decision — the server sorts by recency and Home groups on top of that.

### Rows are the target, and a profile is reachable from Home

Three changes with one shape: the thing you want to tap is the row, not a
control parked on the end of it.

**A contact row opens their profile.** Until now `ProfileView` was rendered
from exactly one place — the roster inside a channel — so reading who somebody
is required already being in a channel with them. That is close to
unreachable for the case it was written for, which is meeting somebody in a
channel an acquaintance opened. The whole row is the target now.

Two rows are excluded, for reasons rather than tidiness. An outgoing request
has no account behind it — `displayName` holds the address, deliberately, so a
request to an address without an account is indistinguishable from one to a
user — so there is no profile to fetch. And in multi-select the row picks
instead, because navigating away mid-selection would silently discard the
selection.

**A channel row lost its Step in button** and became one press. There is only
one thing to do with a channel you are not in, so a target the size of the row
is the honest shape for it. The live bar above has always worked this way.

**A profile lists the channels you share**, each stepping in when tapped. The
list comes from Home's own `rejoinable` rather than a new endpoint, because
that list already *is* "channels you belong to and are not currently in" — the
exact set for which "step in" is the right verb. A channel you are presently
inside is therefore absent, which is correct: you are already there. Reached
from inside a channel, `onEnterChannel` is omitted and the section is left out
rather than shown dead.

While here: `App.tsx` held a **fourth** copy of the naming fallback, still
saying "3 people" after the other three had been unified. The live bar and
Home's list disagreed about what the same channel was called. It now shares
`describeChannel` with everything else.

### A recording's name is settled when it stops, and never moves

Three rules, and they are a spec rather than an implementation detail:

1. **The name is decided when the recording stops.** Written to the row in
   `fileRun`: the channel's name if it has one, otherwise the display names of
   everyone who took part.
2. **It is the same for every user.** Everyone who was in it is named,
   including whoever is reading — `nameRecording`, not `describeChannel`.
3. **It never changes after that.** Not when somebody renames themselves, not
   when the channel is renamed, not when people leave, not when the channel is
   deleted out from under it.

The second rule is where this parts company with how a channel is labelled,
and the reason is what the two things *are*. A channel is a place you are in,
so naming it from your side — "Dana Chu", meaning the channel with Dana in it
— is right, and it is fine that Dana reads something different. A recording is
an artefact: one thing, existing once, that two people may want to talk about.
A label that reads "Bob" to Alice and "Alice" to Bob gives them no shared way
to refer to it.

The third rule needed the *inputs* frozen, not just the output. Participant ids
never change, but what they resolve to does, and a lookup that finds nothing
drops the participant rather than reporting it — so a recording of two people
could come to read as though nobody else had been there. `participant_names`
snapshots what each was called, alongside the name itself.

**A named channel lends its name to what it records**, so several recordings
can share one name. That is not a collision to be broken — a name says where a
recording came from, and *when it ended* is what tells two of them apart. It
follows the same freeze as everything else here: a recording keeps the name the
channel had when it stopped, not whatever the channel is called now, so
renaming a channel splits its recordings across two labels. That is the honest
outcome, the old ones being records of a thing that was called something else.

This is why the export filename carries the end time:
`The Floor — Thursday rehearsal — 2026-08-11 1437.ogg`. Without it, every
recording from a named channel would write to the same path and they would
collide in the share sheet and wherever they land. Local time rather than UTC,
because a person reads it; largest field first, so a folder sorts correctly;
and no colon, which is legal on iOS but reads as a slash in Finder and is
refused outright on Windows.

Rows written before this fall back to the old viewer-relative label. There is
nothing to recover: the names at the time were never written down, and the
channel's present name would be the wrong answer even where it still exists.

### The microphone stays closed while you are alone in a channel

Joining a channel used to take the AVAudioSession as a *call*, unconditionally.
That drags a Bluetooth speaker from A2DP — stereo, music-grade — down to HFP,
the mono ~16 kHz hands-free profile, and makes every other app's audio unusable
for as long as you are in the channel. Sitting in an empty channel waiting for
somebody should not cost you your speakers.

Two lines did it, both in `useSessionAudio`: `startAudioSession()`, which
activates with whatever category WebRTC defaults to, and
`setMicrophoneEnabled(true)`, which starts the recording engine and makes the
native policy apply `playAndRecord`. Alone, neither buys anything — there is
nobody to hear the microphone.

So the session is `playback` + `mixWithOthers` + `spokenAudio` until the
microphone is actually needed, and `playAndRecord` + `allowBluetooth` +
`mixWithOthers` + `videoChat` while it is capturing. Both
are in `app/src/audio/session.ts`. **Both directions are applied, and the first
shipped attempt applied only one. That caused echo**, which the next section is
about.

**Recording is the exception, and it is why this is a tested function rather
than a condition inline.** `core/channel.ts` lets one person alone record; a
note to yourself is a use rather than a mistake. Written as "alone means
closed", this would have recorded silence and reported success. `microphoneNeeded`
covers a paused run too, so resuming does not wait on retaking the session.

**The session is still taken explicitly**, rather than skipping activation
while alone. The comment in `useSessionAudio` records what leaving that to the
automatic path cost once before: after somebody left and rejoined, the other
side's playback never resumed — subscribed, healthy, silent. An active session
in the `playback` category is invisible to a Bluetooth speaker, so that
ordering survives at no cost.

**Two people is still a call.** Once anybody else is present the session is
`playAndRecord` again and Bluetooth drops to HFP. That is unavoidable while
capturing and playing at once.

**It cannot be verified here.** Neither the simulator nor the suite shows a
profile switch. On a phone with a real speaker: play something from another
app, enter an empty channel, confirm the music neither stops nor degrades, then
have somebody join and confirm the microphone opens.

#### Build 17 shipped this with echo, and why the code looks defensive now

Build 17 applied the playout configuration only, on the assumption that the
SDK's native policy would install the recording one when capture started. It
does — on engine *transitions*, and there were none, because
`setMicrophoneEnabled(false)` mutes a track without releasing the device. So a
phone that had once closed its microphone kept capturing under `spokenAudio`,
which is not a voice mode, which means no system echo canceller: the *other*
party heard themselves. **POSTMORTEM-echo.md** is the full account.

Four things follow, and each is load-bearing rather than belt-and-braces:

- **`app/src/audio/session.ts` holds both configurations.** Three components
  write this session — this app, the SDK's policy observer, and WebRTC
  re-applying its own defaults — and they mutate one process-wide
  `RTCAudioSessionConfiguration.webRTCConfiguration`. Whoever writes last wins,
  so everything we control writes identical values. There is no such thing as a
  temporary call to `setAppleAudioConfiguration`.
- **`index.ts` hands those same constants to `setupIOSAudioManagement`,**
  replacing the SDK defaults `registerGlobals()` installs, so the observer
  cannot contradict the app on some later transition. It did, visibly: a tester
  watched the echo stop and the audio drop to the earpiece in the same instant,
  which is that configuration arriving — a voice mode, and no `defaultToSpeaker`.
- **`CALL` states `defaultToSpeaker`, and the eligibility list beside it.**
  With `playAndRecord` the default output is `builtInReceiver` — the small
  speaker held to an ear — and this makes it `builtInSpeaker` *when no other
  route is connected*. It does not override headphones; that is what "default"
  means in its name.

  It was added in 18, removed in 19 when a tester's Bluetooth headphones lost
  the route, and restored once that was understood. The option was not
  overriding the headphones: **they were not an eligible output at all.** In
  `playAndRecord` a Bluetooth device is available as an output only if the
  category options permit it, and 18 listed `allowBluetooth` — the mono
  hands-free profile — and nothing else. With no eligible route, "no other
  route is connected" was true and the speaker won, correctly, from a rule
  doing exactly what it says. The fix was the list, not the option:
  `allowBluetoothA2DP` for a device that is only listening, `allowBluetooth`
  for one with a microphone, `allowAirPlay` for the rest.

  Twice now this area has been diagnosed by removing the most recently added
  thing. Both times the added thing was right and its neighbour was wrong.
- **`stopMicTrackOnMute: true` on the `Room`,** so closing the microphone
  really releases the device. Without it the engine never left the recording
  state, which is both why the policy never fired and why the A2DP feature
  above did nothing at all except when no track had ever been published.

`mixWithOthers` stays. It was a live suspect, and the echo stopping under a
configuration that carries it settles the question.

Not verifiable here either — same phone-and-speaker test as above, plus two
phones: mute, unmute, and confirm the other end does not hear itself.

#### The output picker, added on the understanding it should leave

`ChannelSettingsView` raises iOS's own route picker — `AVRoutePickerView`, via
`AudioSession.showAudioRoutePicker`. Not a control of ours, and it could not be:
nothing in this stack tells JavaScript what outputs exist. `selectAudioOutput`
is a blind speaker/default toggle, `enumerateDevices` returns the built-in
microphone and no outputs, and neither package surfaces the current route. The
system sheet needs none of that.

In settings rather than on the channel screen: it is not part of holding a
conversation. And it exists **because the default might be wrong**, not because
choosing an output is a thing this app wants people to do. If it goes untouched
it should be removed, which was the author's expectation the day it was added
and is recorded in BACKLOG.md so the removal is a plan rather than a regret.

What would earn it a permanent place is somebody using it to send audio
somewhere iOS would not have chosen — a speaker across a room, a car, an
AirPlay receiver. That is a want no default can infer.

#### Home's dot means availability, not an open microphone

`liveChannel.muted` stays self-mute alone. A closed microphone opens by itself
the moment somebody arrives, so being alone leaves you no less reachable — the
closing is invisible to the other end and always was. Self-mute is the only
state that says you have chosen not to be heard, and one bit should spend
itself on intent. The comment in HomeView that spelled the dot out as "your
microphone is open" now says availability, that having stopped being the same
thing.

ChannelView is not in tension with this: its "Your microphone" card is prose
with room to say the microphone is closed and why, where the dot is one bit.
Self-mute still takes precedence in that copy — muting yourself is a decision,
a closed microphone is housekeeping.

### Light mode is resolved by UIKit, not by a theme context

Every colour already came from one object — fourteen semantic tokens in
`theme.ts`, with exactly two hard-coded values anywhere else. So this was never
a hunt for stray colours; it was one question: how does a value in that object
become two.

The idiomatic React answer is a context, a `useTheme()`, and
`useMemo(() => makeStyles(c), [c])` in every component. That rewrites eight
module-scope `StyleSheet.create` blocks and their call sites to add a re-render
path for something the platform re-renders by itself. `DynamicColorIOS` returns
an opaque colour UIKit resolves against the current trait collection at *draw*
time, which means the style blocks stay exactly as they were and the `type`
scale goes on capturing `colors.text` at import and stays correct — nothing in
JavaScript ever knew the colour.

The trade is that this is iOS-only. `DynamicColorIOS` throws on Android, so the
export is guarded and Android gets the dark palette; nobody builds it. One
typing consequence, which turned out to be invisible: `colors.x` is now
`ColorValue` rather than `string`.

**The light palette is not an inversion**, in two places that decide whether it
looks native. `surface` is white and sits *above* the page, the opposite of the
dark arrangement where surfaces lighten as they come forward — so `bg` is a
tinted grey, white cards on a white page being invisible. And `surfaceRaised`
is the default Button fill, so it cannot follow `surface` to white or every
default button dissolves into the card behind it.

The rest are pinned by contrast. Four tokens are saturated colours used as
*text* — `silenced`, `success`, `danger` — and each fails on a light ground at
its dark value: `#32D583` on white is under 2:1.

**Light, Dark or System** is in Home settings. `Appearance.setColorScheme` sets
the window's override, which is the same trait collection the colours already
resolve against — so the choice needs nothing else in the app to know about it.
System is `null` rather than a third scheme, which is what keeps the phone free
to go on changing its mind afterwards; the stored value and the platform call
use the same three words so there is no third representation to convert. It is
kept on the phone, beside the token: it is about this device, and two phones
signed in as you may reasonably disagree.

**None of this is verified by the suite.** The colours resolve below anything
JavaScript observes. What is tested is that the palettes name the same tokens,
that no token was left identical in both, and that "system" clears the override
rather than pinning the current scheme. The rest needs a phone with the
appearance toggled, screen by screen, with attention to the states that are
awkward to reach: a held floor, a silenced party, the offline notice, disabled
buttons.

**It cannot ship over the air.** `userInterfaceStyle` is written into
`Info.plist` at prebuild, so light mode reaches a phone only through a new
build. Nothing here touches the wire protocol, `core/`, or the server.

---

## Backgrounded audio was ruled out, and CallKit with it

Investigated 2026-08-07 and 2026-08-08, closed 2026-08-13 having not recurred
since. This is here rather than in BACKLOG because it is a settled negative
result: the answer is that the audio channel is not the problem, and the cost
of not writing that down is somebody spending another two days finding it out.

**What was seen failing.** On 2026-08-07, on a real iPhone: backgrounding the
app dropped the phone from the LiveKit room within seconds, it did not rejoin,
and it did not recover on returning to the foreground. On 2026-08-08 a
*foregrounded* channel dropped after 85 seconds with auto-lock disabled. Each
was seen once, and neither has been seen since.

**What was confirmed working.** On 2026-08-08, unplugged, on Wi-Fi,
instrumented: six minutes backgrounded with no drop, two of those minutes with
the room silent. Across 854,000 lines of device log there were zero suspensions
and zero releases of the audio assertion. The app holds
`com.apple.mediaexperience:MediaPlayback` from `audiomxd` — the assertion the
`audio` background mode exists to grant. **The audio channel is configured
correctly**, which was the leading hypothesis for the whole problem and is
wrong.

That is also why **CallKit was ruled out**. It was on the table as the heavier
way to hold audio alive in the background, and there is nothing for it to fix.
It becomes the right tool again for a different job — ringing, in
BACKLOG's notification item — where it is required rather than optional.

Nothing in the app changed between the failing runs and the working ones: the
audio-channel commit (c63726f, removing a duplicate owner) was already in place
during the 85-second failure, and the only changes after it were server-side.
So the difference was never accounted for. The untested candidates were a
network transient, which is indistinguishable from a suspension in what was
measured; accumulated state, the failing runs having come after many
background/foreground cycles and the working ones after a fresh launch; and
coincidence, two observations not being a pattern.

**How to instrument it if it recurs.** The setup works without a cable:

    idevicesyslog -n -u <udid> > capture.log

The device is paired for network access ("Show this iPhone when on Wi-Fi" in
Finder). `server/dev-guest.mjs --status` reads LiveKit room membership and
`server/dev-channel.mjs` reads the server's own view; both are gitignored.
Useful greps once a drop is caught: `MediaPlayback` for the audio assertion,
`suspend` for the decision, and the app's bundle id for its lifecycle.

**Do not plug the phone in to investigate.** USB masked the failure entirely —
plugged in, nothing reproduced across several minutes in either state.

What the investigation did leave behind is the observation that presence and
room membership are different things, which is still open in BACKLOG.

---

## The media server is self-hosted, on the box that was already there

Decided and done 2026-08-13. WebRTC moved off LiveKit Cloud and onto `thefloor`
itself: `livekit-server`, a Redis, and the egress recorder, all beside the app.

The forcing event was the bill. LiveKit's free Build tier is 5,000 participant-
minutes and it was exhausted four days after the first deploy, with audio down
from then on. The next tier up is **$50/mo**, against a box that costs $12 and
was already paid for. Four days of solo testing extrapolated to ~30,000
participant-minutes a month — a fifth of what $50 buys — so it was not a case of
outgrowing the free tier so much as the free tier being a trial.

### Why this is cheap here specifically

Self-hosting an SFU is usually the wrong trade. It is a good one here because of
what this app asks for, not because of anything general about SFUs:

- **Audio only.** No video anywhere, so no video codec and nothing to transcode.
- **One speaker at a time.** The floor is the whole point, and a muted publisher
  sends nothing — so traffic is one upstream track and N downstream copies,
  never N².
- **Track egress, passthrough.** `startRecording` uses `startTrackEgress` with
  `DirectFileOutput`, which writes the Opus already being published. The 4 CPU /
  4 GB figure in LiveKit's docs sizes *room composite*, which renders video in a
  headless browser. It is not this workload and reading it as though it were is
  the easiest way to talk yourself out of this.

An SFU relays Opus rather than decoding it, so CPU was never the constraint
either. The most expensive media work on this box remains the `FfmpegDecoder` in
`playback.ts`, which was already there.

Memory, the only real budget, came in under estimate: **~730 MB of 1907** with
everything resident, against ~990 projected. `livekit-server` and `egress` idle
at ~15 MB each; the item the projection missed was `dockerd` at 66 MB.

### Why not a second box, and what the signal would be

$7/mo, seriously considered, and deferred rather than rejected. The argument for
it was never memory but **lifecycle**: `bin/deploy` runs `npm install` on the box
and restarts, which today costs presence and not conversations *precisely
because* media is elsewhere — and once it is not, that spike lands on live audio.
An OOM kill has the same shape: today it drops signalling while conversations
continue, co-located it takes the conversation and any recording in flight.

Both are real. Neither is worth $7/mo before there is anybody to inconvenience,
and the deciding fact is that **splitting later is cheap**: `livekit-server` is a
separate process with its own config, so the move is a box built by
`bin/provision-livekit`, an A record, and `LIVEKIT_URL` in `server/.env`. No
code, no migration, no wire change.

The signal to split is a deploy that audibly interrupts a call. You will notice.

### Nothing in the app changed, and that is structural

`POST /channels/:id/media-token` returns `{ token, url }`, and
`useSessionAudio.ts` connects to whatever `url` comes back with — there is no
hardcoded fallback, only a "no audio configured" branch. So the cutover was three
lines in `server/.env` and a restart, with build 28 picking it up on its next
token request. No release, no App Store round trip. It is also what makes the
future split to a second box a one-line change.

### Connectivity is a ladder, and only the first rung was built

The old worry about NAT was framed in peer-to-peer terms, which is the wrong
frame for an SFU. The server has a public IP and open UDP ports; a client only
has to send outbound UDP and receive the return flow, which essentially every
NAT permits — carrier-grade NAT included. The symmetric-NAT failures that make
TURN mandatory for P2P mostly do not arise.

| rung | port | covers | built |
| --- | --- | --- | --- |
| ICE/UDP direct to the SFU | 7882–7885/UDP (mux) | the large majority | yes |
| ICE/TCP | 7881/TCP | UDP blocked, outbound TCP allowed | yes |
| TURN/UDP | 3478/UDP | — | no |
| TURN/TLS | 5349 or 443 | only 443 gets out | no |

The last two are what happens when somebody reports they cannot connect, and
TURN/TLS on 443 is expensive in a specific way: Caddy owns 443, TURN/TLS is not
HTTP so `reverse_proxy` cannot carry it, and sharing the port needs SNI routing
via `caddy-l4` — which means replacing the apt-installed Caddy with an `xcaddy`
build and giving up the Cloudsmith repo's upgrades. The cheaper intermediate is
TURN/TLS on **5349** with `external_tls: true` and Caddy terminating, which
covers every restrictive network except those allowing 443 and nothing else.

**And TURN cannot be tested from your own network**, which is the real ongoing
cost of self-hosting and worth naming plainly: your network does not need TURN,
so everything passes and you have learned nothing. When it breaks it breaks for a
subset of users on networks you do not have, silently, while everyone on home
Wi-Fi stays fine.

### Four things that cost time, or would have

**`rtc.use_external_ip: true` is necessary and not sufficient.** A cloud VM sees
a private address, so without it LiveKit advertises ICE candidates nobody can
route to. But the setting discovers the public address over STUN and then
*validates* it with a round trip back to itself — so it also needs the UDP ports
open at the firewall **before the server starts**. With them shut the log reads
`found external IP via STUN {"externalIP": "44.241.121.49"}` immediately followed
by `could not validate external IP`, and it falls back to advertising
`172.26.0.26`. The configuration is correct, the address was found correctly, and
the symptom is still the worst kind: the room connects, participants appear,
negotiation completes, and there is no audio. **The log line to read is `using
external IPs`, not the yaml.** Discovery happens only at startup, so opening the
firewall afterwards needs a restart.

**Egress rations itself by a CPU budget, and the default is for a different
job.** `track_cpu_cost` defaults to 1 against two vCPUs, so the third concurrent
track egress is refused — and every participant in a recording is their own
egress, which a six-person channel reaches at once. Set to `0.15`, honest for a
no-transcode byte pump. The key name had to be *verified* rather than assumed:
egress **silently ignores unknown config keys**, so a typo would have left the
default in place with nothing said anywhere. Setting it to 100 and watching
`minimumCpu` move is how you confirm it took.

**A subdomain, not a path prefix, and the reason is in the SDK.** `livekit.
rvanegas.co` looks like ceremony when `thefloor.rvanegas.co` already points at
the same IP — but routing LiveKit under a `/livekit` prefix does not work:

    new URL("/twirp/livekit.RoomService/GetParticipant",
            "https://thefloor.rvanegas.co/livekit")
      → https://thefloor.rvanegas.co/twirp/…        # the prefix is gone

`TwirpRpc` builds an **absolute** path and resolves it against the base URL, so
`RoomServiceClient` and `EgressClient` would drop the prefix and land on Fastify.
`prefix` is a `TwirpRpc` option and neither client forwards it — only
`requestTimeout` and `failover`. A prefix-free variant does work (route `/rtc`,
`/rtc/*` and `/twirp/*` on the app's own hostname) and was rejected for giving
that hostname two owners, where a new Fastify route or a new LiveKit top-level
path lands on the wrong process and 404s quietly. A DNS record is cheaper.

**`udp_port` and `port_range_start`/`end` are mutually exclusive.** The mux takes
effect only when the range is unset, and setting both is not an error that
announces itself — the range simply wins.

### What was verified, and what it does not cover

Two phones, in an order chosen so each step exercised something the previous one
did not: join; claim and release the floor; record; play back into the room. All
four passed. The recording landed as `rec_M3y1Yp4FGyoZ` — two stems and both
egress manifests in S3, timestamps matching `egress_complete` in the log to the
second. Playback was the one that mattered most, being the only exercise of
`@livekit/rtc-node` against a self-hosted server rather than Cloud.

What it does not cover is load, TURN, and what a deploy does to a live call —
the first two by construction, the third because nobody was talking during one.

**A pre-existing rough edge, checked so it would not be blamed on the move.**
`setSilenced` throws `participant does not exist` fairly often — 89 during the
verification session. It is not a regression: 470 on 2026-08-10, 86 on the 11th,
64 on the 12th, and 7 on the 13th when audio was down all day. The rate tracks
how much talking happened, not which media server was serving it.

---

## A card per person in a channel, lit by who is actually audible

Built 2026-08-13. The roster used to be one line of muted grey per person
under the channel title — `Dana Chu · Present · muted` — which made the answer
to "who is here and who is talking" the smallest type on a screen whose next
four cards described what the channel was doing. It is a card each now, with
the name at full weight and a dot that fills while that person is audible.

**Everybody gets one, yourself included.** Your own mute and your own speaking
indicator are things you want to see, and a roster that lists everyone but you
makes the count on Home disagree with what the screen shows. Your card is the
one that is not pressable: it would lead to a read-only view of yourself
offering to add you as your own contact.

**The speaking indicator comes from the room, not from the reducer.** These are
different questions and it would be easy to answer the wrong one: the floor
says who *may* speak and the server enforces it by muting everybody else, so a
card lit from `channel.floor.holder` would glow through three minutes of
silence and would stay dark for the ordinary case of several people talking
with no claim at all. Only the media connection knows who is making noise, so
`useSessionAudio` now surfaces LiveKit's `ActiveSpeakersChanged` as a list of
identities. They are account ids — the server issues join tokens under
`identity: userId` — so they index straight into a channel's participants with
no second lookup and no mapping to keep in step.

The list is emptied on `Disconnected` rather than left as it was. A name still
pulsing on a screen whose audio has dropped is exactly the reading that
matters, and it is the one a stale list gets wrong.

**No animation.** The dot is filled or hollow, driven by the events as they
arrive, which is already several changes a second while somebody is talking.
Its size does not change with the state, so a card cannot reflow every time
somebody draws breath, and there is no animation loop running behind a screen
that is otherwise idle while a conversation goes on above it.

What the card does *not* do is show an audio level. LiveKit reports one, and a
bar that moves with it is a more literal answer to "a dynamic visual
indicator" — but it is also a value arriving continuously into a React tree
that currently re-renders on server snapshots and a one-second tick, and
speaking-or-not is what a reader of the screen is actually asking. It is worth
revisiting if the binary dot turns out to read as laggy.

---

## Two idle timers, and one place that turns a gap into words

Built 2026-08-13, alongside the channel cards the two of them are shown on.

**They measure different things and come from different clocks.** The one on a
channel card is "when were you last *in this channel*", which the reducer knows:
`stepOut` is the single route out — a tap, a grace period running out, and
leaving the channel outright all pass through it — so the stamp goes there and
nowhere else. The one on Home is "when were you last *in the app*", which the
reducer cannot know, the app being a thing that exists outside any channel. That
is a socket, so it is `accounts.last_seen_at`, written by the websocket layer.

**`last_seen_at` is written on every message, not only at the edges.** Writing
it as a socket opens and closes is the obvious cheaper thing and it is wrong for
the case that matters most: somebody who has had the app open since this morning
would read as last seen this morning. The client heartbeats, so a write per
message keeps the value within one interval of the truth. That is one small
UPDATE per client per interval, which at this scale is nothing; if it ever stops
being nothing the fix is to skip the write when the stored value is already
recent, not to move it to the edges.

**Absent means absent, and is shown as nothing.** Both clocks have states with
no answer, and the temptation in each is to manufacture one. A restart drops
`present` without anybody stepping out, so there is no moment when they left —
stamping the restart would report the deploy as the time they went. An account
that has not connected since the column existed has no last-seen — backfilling
from `created_at` would read as a year idle for somebody who used the app this
morning. Both are left null, and the interface says nothing rather than
something false. `idleMs` returns null for all three of "here", "never here" and
"unknown" for the same reason: none of them is a duration.

**The wording is dayjs's.** `agoOrNull` and `ago` in `app/src/ui/relativeTime.ts`
wrap `dayjs`'s `relativeTime` plugin, which inherits moment's thresholds — 45
seconds is "a minute", 90 minutes is "2 hours", 25 days is "a month". That ladder
is a solved problem with unobvious edges, and one written by hand reads fine at
the values it was tested against and says "1 minutes ago" at the ones it was not.
The test pins the strings, so an upgrade that changes the wording fails here
rather than on a phone.

Two things the wrapper does that the library does not. It clamps negatives,
because these are computed against the server's clock learned a round trip ago,
and dayjs renders a negative gap as "in a few seconds" — a future tense for
something that has already happened. And it never reads the device clock: the
gap is passed in as a duration and offset from a fixed anchor, rather than
passing an absolute time and letting dayjs subtract `Date.now()`, which would
quietly reintroduce the device clock this app counts against the server's to
avoid.

**Under a minute reads as presence rather than as a number.** "A few seconds
ago" about somebody sitting in the app is true and answers a question nobody
asked; it is also where the heartbeat's staleness lives, so a live user would
otherwise flicker between a count and nothing. Home says "In the app now"; a
channel card says nothing at all, presence being spelt out beside it already.

**What this discloses, said plainly.** A contact can now see roughly when you
last had the app open. That is a real disclosure and it is the point of the
feature — the list is for deciding whether it is worth trying somebody — but it
is worth writing down as a thing that was chosen rather than a thing that
happened. It is limited to contacts, who are people you accepted; an outgoing
request shows nothing, because that row is an address rather than a person and
whether anybody is behind it is exactly what it must not answer.

---

## The speaking indicator holds on the way down

Changed 2026-08-13, the same day the cards shipped, on the strength of build 29
on a real phone: the dot flickered through every breath and every gap between
sentences. Distracting in a way the test suite could not have found, because
LiveKit's speaker detection is what produces the transitions and no test here
has a live room.

**The hold is on the removal, and it could not have been on the signal.** The
obvious shape — "speaking if there was a signal in the last two seconds" — is
wrong, and wrong in a way that only shows up in the case the feature is most
for. `ActiveSpeakersChanged` fires when the set *changes*, not continuously, so
somebody talking uninterrupted for a minute produces one event at the start and
nothing after it; a last-signal clock would expire mid-sentence and put the dot
out while they were still talking. What the event says is who is speaking *now*,
and it stays true until the next one — so what needs smoothing is the moment
somebody leaves the set.

The leading edge is deliberately not smoothed. A dot that appeared 300ms after
somebody started talking would be a worse fault than the flicker.

It lives in `app/src/audio/speaking.ts` as a pure function of (hold, speakers,
now), on the same reasoning as `micNeeded`: the timing rules are the entire
substance, and they are not exercisable through a hook that needs a real room to
produce a single event. The hook keeps a timer alongside it, because a hold
running out is the one transition nothing announces — the room has already said
everything it has to say about somebody who stopped.

---

## Donations, by a link out rather than in-app purchase

Built and deployed 2026-08-14. The roadmap had said "Payment — In-app
purchases, optional" since it was written, and the word doing the work turned
out to be *optional*: what was wanted was a way to give money toward keeping the
thing running, not a paid tier. Nothing is unlocked. An account that has never
given a penny behaves identically to one that has, which is what kept the build
to one table, one module and two routes — there is no entitlement to model, no
quota to enforce, and nothing in `core/` to thread a subscription through.

**Why it can be a link at all.** App Review Guideline 3.1.1(a) reads: *"These
entitlements are not required for developers to include buttons, external links,
or other calls to action in their United States storefront apps"*, and the
prohibition on such links applies *"in all other storefronts, except for the
United States storefront, where this prohibition does not apply."* So an
external donate link is permitted outright — no entitlement, no Apple
commission, and no Paid Apps agreement, banking details or tax forms, none of
which an IAP tip jar could have avoided.

**The cost is that the app ships United States only.** That is the single
setting the whole argument rests on, and widening availability later without
also removing the link is how a compliant app becomes a rejected one. It is
worth knowing that the carve-out exists because of the April 2025 injunction,
which is under appeal — so the remedy has to be cheap, and it is: the Ko-fi URL
comes from `KOFI_URL` in the environment and reaches the app only through `GET
/support`. Withdrawing the call to action is an edit and a restart, not an App
Store round trip. The same reasoning that keeps the LiveKit URL out of the
binary.

Two neighbouring routes were checked and do not apply. **3.2.1(vi)**, charitable
fundraising, requires approved nonprofit status. **3.2.1(vii)** permits optional
person-to-person gifts outside IAP, but it is user-to-another-user and ends *"a
gift that is connected to or associated at any point in time with receiving
digital content or services must use in-app purchase"* — too close to the line
for a donation that keeps the app you are using alive.

### Attribution is by address, and admits when it fails

Ko-fi's donate link carries no passthrough field — nothing a Stripe Payment Link
does with `client_reference_id`. So who gave is worked out afterwards, from the
address they paid with, matched against `accounts.identifier` the way
`byIdentifier` already matches: exactly, case-insensitively. The cheapest half
of this is not code at all — the Settings screen shows people their own sign-in
address and asks them to use it.

**A middle stage was built and then removed, and the removal is the decision.**
It recorded an intent row when somebody tapped Support, and attributed a
donation arriving shortly after under an unrecognised address to whoever's
intent was open. It is wrong in the case it exists for: two people donating at
once, where it credits one person's money to another and *nothing afterwards
would ever reveal that it had*. An unattributed row is visible and fixable by
hand; a confidently wrong one is neither. Removing it also deleted a table, a
route, a sweep and a TTL, which is the shape of a guess that was not earning its
complexity.

What resolves the remainder is a person, reading Ko-fi's dashboard. `matched_by`
records which way each row was found — `'email'` or `'manual'` — so a total can
say how much of itself it is sure about, and `raw` is nullable precisely so a
row typed in from the dashboard does not have to invent a payload it never had.

**Ko-fi's dashboard is the authoritative record; the `donations` table is a
convenience copy.** There is no read API, so a delivery missed while this server
was down cannot be fetched later, only copied across. That asymmetry is worth
stating before somebody reconciles the two and assumes ours is right.

### The verification token is not stored, and once was

Ko-fi authenticates itself with a `verification_token` inside the request body —
a shared secret rather than a signature, which is only safe because Caddy
terminates TLS in front of this. It is compared with `timingSafeEqual`.

The first implementation stored the entire request body in `raw`, faithfully,
including that token. So the secret that authenticates every future delivery was
written to the database on every row, into every backup, and into the output of
any query that selected the column — which is exactly how it was found, by a
`substr(raw, 1, 120)` during verification that printed it. The token was rotated
and the row deleted.

The payload is still kept whole, minus that one field, because Ko-fi may extend
their shape without telling anyone and a field that matters in six months should
be recoverable rather than lost for every row already written. There is a test
asserting the token appears nowhere in the table, including a stringify of every
column, so this cannot come back through a different route.

The general form, worth carrying beyond this feature: **a payload that
authenticates itself contains a credential, and storing it verbatim stores the
credential.** Faithfulness and secrecy pull against each other here, and the
resolution is to keep everything except the part whose only job was already done.

### Shipping worldwide, and filtering who is offered the link

Added later the same day, on learning there were already non-US users. The
original plan had the app shipping **United States only**, which is the simplest
way to satisfy 3.1.1(a) and turned out to be the wrong trade: it would have left
existing users unable to install from the App Store at all, stuck on TestFlight
builds that expire every ninety days. The guideline prohibits the *link* outside
the US storefront, not the *app* — so the app ships everywhere and the link is
withheld per person.

**The client reports, the server decides.** The app sends its locale and
timezone, read from `Intl` (built into Hermes, so no dependency and no native
module); `server/src/region.ts` decides what that means. Putting the policy on
the server is the whole point: this is a compliance rule, and one compiled into
a binary takes a release plus however long people take to update, while one on
the server takes a restart.

**It is an approximation, and it is wrong in a chosen direction.** The
authoritative signal is the App Store storefront, which only StoreKit reports
and which would have cost a native module to read — added, ironically, to avoid
in-app purchase. What is used instead is where the phone says it is. So every
ambiguous case resolves to hidden, because the two failure modes are not
comparable: showing the link outside the US storefront is a guideline violation,
and hiding it from somebody inside it costs one donation.

Three details that carry the weight:

- **Both signals must agree.** Region alone would show the link to somebody
  abroad who has set their phone to US formatting, which people do. Their
  timezone is still where they are, and that is what refuses it. The cost is a
  US person travelling, whose timezone follows them — the case a human can
  recognise, which is what the override is for.
- **The zones are a list, not a prefix test.** `America/` spans Canada, Mexico
  and South America; `America/Toronto` and `America/Sao_Paulo` would both pass
  `startsWith('America/')`. The list includes Hawaii and Alaska, which are not
  `America/` zones at all, and the territories sharing the US storefront —
  Puerto Rico, Guam, the USVI, American Samoa, the Northern Marianas.
- **Silence means no.** Every build before this sends no hints, and reading that
  absence as "United States" is the single guess that could put an external
  payment link in front of the wrong storefront.

`accounts.donations_allowed` overrides it in both directions — null for
everyone by default, meaning decide automatically. It exists because the
automatic answer is a guess and somebody who actually knows the truth for one
account should be able to say so with an UPDATE rather than a deploy.

Withholding the link does **not** withhold somebody's own donation history. That
is a rule about where money may be solicited, not about who may see what they
have already given.

### What else shipped alongside

**A fixed one-time code for App Review** (`REVIEW_IDENTIFIER`, `REVIEW_CODE`).
Signing in means reading a six-digit code out of an inbox, and a reviewer has no
inbox — so without this the app cannot be opened by the people who decide
whether it ships, which is a rejection rather than a rough edge. The code is
published in the review notes and is therefore public; the account it opens must
hold nothing that matters. Everything else about the path is unchanged: still
hashed, still expires, still counts attempts. Unset is the only configuration in
which every code is random.

**A privacy policy at `GET /privacy`**, which App Store Connect will not accept
a submission without. Served by the server it describes, so it deploys with the
code and cannot drift from it — a change to what is stored has to walk past the
page that claims otherwise. Written as claims checkable against this codebase
rather than boilerplate.

### Blocking was built for Guideline 1.2, and reverted

1.2 asks apps carrying user content for ways to filter objectionable content,
report it, and block abusive users. The instinct was that blocking was the
missing piece, since `declineContact` and `withdrawRequest` only reach somebody
who is not yet a contact and nothing severs an accepted one. It was built —
table, methods, routes, tests — and then removed unbuilt on the observation that
the mechanisms already present answer 1.2 better than the new one would have:

- **`DELETE /recordings/:id` is guarded by the same reach test as play and
  export**, so any member of a channel can delete any recording in it. That is
  removal by the person harmed, at the moment of harm, with no queue and no
  appeal to the developer.
- **There is no way in without consent.** Channels require an accepted contact
  on both sides; there is no discovery, no directory, no way to be reached by a
  stranger. That places The Floor with messaging apps, which ship no moderation
  tooling, rather than with social feeds, which must.
- **Leaving already works**, via `STEP_OUT` and `LEAVE_CHANNEL`.

So it is a review-notes item rather than a code item. If a reviewer raises it,
blocking is a day's work. Building it speculatively ahead of a rejection that
may never come was the thing not worth doing — and the reasoning is here so that
the next person to notice the gap knows it was noticed.

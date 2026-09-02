# The words this project uses, and what each one means

Standing reference, not deferred work. It is the source of truth for
vocabulary: when a word here and a word in the code disagree, one of them is a
bug, and this file is where the argument is settled.

It exists because most of the nouns in this system are ordinary English used
narrowly. *Present*, *live*, *member* and *detail* all mean something specific
here and something looser everywhere else, and a reader who takes them at face
value builds the adjacent thing. Several already have: `lastPresenceAt` counted
the reader until 2026-08-26, and the roster said "Waiting" for a state that
describes somebody being *reachable* until 2026-08-22 — both are words that
were read the way English suggests rather than the way the system means them.

**Two parts, and the seam is who needs the word.** Part One is vocabulary a
user meets: it is on a screen, in a notification, or in something they would
say out loud about the app. Part Two is vocabulary that exists only inside the
codebase — a field, a module, a piece of infrastructure, a design-system name.
A term that a user meets *and* that has a second, narrower life in the code is
defined in Part One and qualified in Part Two, never split in half.

Alphabetical within each part, deliberately, rather than grouped by theme. A
glossary is looked things up in, and a thematic order requires knowing the
answer before finding it. Cross-references are in *italics* and point at the
entry, not at the part.

## Maintaining it

**A word gets an entry when it means something the dictionary does not.**
Ordinary words used ordinarily — `name`, `volume`, `delete` — are not entries,
and adding them dilutes the ones that matter.

**Definitions carry the contrast, not just the meaning.** Almost every entry
here earns its place by being confusable with a neighbour, so say what it is
*not*: *present* against *live*, *member* against *participant*, *seat* against
*membership*. An entry with no contrast is usually one that did not need
writing.

**Rename here in the same commit as the rename in the code.** This file is
claimed as a source of truth, and a source of truth that lags is worse than no
file — it authorises the wrong word. The same rule AGENTS.md applies to its own
line count.

**It is not an index of the code.** Where the reasoning behind a term is long,
the entry says the term's meaning in a sentence or two and points at the file
that argues it — usually STATES.md, decisions/DECISIONS.md, or the type's own
comment. Nothing here should have to be rewritten when an implementation
changes, only when a *meaning* does.

---

# Part One — words a user meets

## Channel

The place a conversation happens. Named or unnamed, permanent until its last
member leaves, and the thing that owns whatever was recorded in it: deleting a
channel deletes its recordings.

A channel is not a call — it exists whether or not anybody is in it, and
walking out of one does not end it. Up to six members
(`MAX_CHANNEL_PARTICIPANTS`), plus any guests they let in.

Never called a *room* on screen. See *room* in Part Two, which is the media
plane's word for the audio underneath a channel and is a different thing.

## Chip in

The donation link, in Settings. Voluntary, unlocks nothing, and shown only to
people the server places in the United States storefront — see
`server/src/region.ts` for why that is a server decision rather than an app
one.

## Clipboard (a channel's)

One piece of text the channel holds, which anybody in it — guests included —
may read, replace or clear. A channel has *a* clipboard exactly as a device
does: pasting replaces what was there, so there is no list, no ordering and
nothing to delete individually. Silent, so it is not governed by the *floor*.

The thing on it is a *clip*.

## Close

**The way off a screen you opened**, and the word every one of them uses:
Settings, Channel settings, Support, Standings, a profile, a transcript, and a
channel you are no longer present in. It empties the *detail* pane and leaves
the *list* beside it alone.

**Deliberately not "Back", which it said until 2026-09-01.** Back means *reveal
what is underneath*, and above the width breakpoint there is nothing underneath
— the list is beside rather than under. One word that is true in both layouts
is what lets the handler be one line with no test of which layout is in force.

Distinct from *Home*, which is a destination and takes the contact list with
it, and from *Step out*, which gives up presence rather than closing anything.

## Contact

Somebody you have both agreed to be in touch with. Contacts are mutual;
becoming one comes with a channel for the pair. A *request* is a contact that
has been asked for and not yet agreed — outgoing or incoming.

Being in the same channel as somebody is not being their contact. Channels hold
people a mutual friend brought in, which is why *inviting* and *pinging* check
contacts separately from presence.

## Floor, the

The thing the app is named after. Claiming the floor cuts everybody else's
microphone for up to a minute so one person can speak uninterrupted; releasing
it gives them back. Only one person holds it at a time, and after a claim ends
there is a short delay before that person may claim again, so the floor cannot
be held continuously by whoever taps fastest.

Enforced on the audio itself, not in the interface — a silenced person's audio
does not reach anybody, whatever their app is doing. It also confers control of
what the channel is attending to: shared playback and the *watch party*
transport belong to the floor-holder while a claim is live.

**Not the same as a mute.** A claim is about who may be heard *in this moment*
and is temporary by construction; a *self-mute* is a decision about your own
microphone and costs you nothing. Neither writes the other. See STATES.md.

## Guest

Somebody in a channel with no account here, admitted by a member through a
*guest link*. They can listen; they can speak only if a member turns their
microphone on; they cannot record and cannot reach anything else of yours.

A guest is *in the room* but is not a *participant* — every rule in this system
is written so that a guest is refused by default and granted things one at a
time, in writing. See *participant*, *member*, and *seat*.

## Guest link

A link a member shares that lets somebody open a channel in a browser without
an account. It is not self-propagating: anybody holding it can *knock*, and
only somebody already in the room can open the door. It stops working once the
channel is empty of members.

## Home

The screen the app opens on: your channels, your invitations, your contact
requests, your recordings. Its first section is **Live** — see *live*.

## Invitation

An ask to join a channel, from whoever actually asked rather than from whoever
created the channel. It outlives the moment it was sent, so a card says how
many people are in the channel now rather than claiming somebody is still
waiting.

## Knock

What arrives when somebody follows a *guest link*: a named person at the door,
shown to everybody present, settled by one member answering. It buzzes the
phones of people in the room, since a knock is a question addressed to whoever
is in the channel rather than to whoever has the screen open.

## Leaderboard

The invitation standings: who is here because of whom. Visible only to accounts
marked for it. Called the *invitation standings* in the code.

## Live

**On Home, a channel with somebody in it right now.** The Live section is the
top of the priority ladder — an invitation to a channel somebody is sitting in
is *live* rather than *invited*, because it is the most urgent thing on the
screen.

The threshold is one person, and the count includes you. This is a different
fact from how recently a channel was used, which is what every other row on
Home is measured by, and the two never draw at once: an occupied channel shows
its count instead of an interval.

Also used loosely in the code for "the channel this account, or this device, is
actually standing in" — see *live channel* in Part Two, which is a narrower
thing and is not what the Home section means.

## Member

**A user with an account who belongs to a channel.** The word the guest-facing
half of the app uses, because *participant* means nothing to somebody who has
just followed a link: a guest's screen labels everybody else as either a member
or a guest.

Inside the codebase the same people are *participants*. The two are the same
set; which word is used says who is being spoken to. See *participant*.

## Nearby / Stepped out

The two things a roster card says about somebody who is not here.

**Stepped out** — they left, deliberately, and the card says how long ago.
**Nearby** — their presence expired rather than being given up: their
connection ran out of grace, so as far as anybody knows they are still within
reach and one notification away. It is shown for fifteen minutes
(`WAITING_WINDOW_MS`) and then reads as *Stepped out* like anything else.

The distinction is one bit, and it is the difference between telling somebody
to give up on a person and telling them to ping.

## Ping

A notification sent to one person in a channel who is not there, or whose
connection has dropped, telling them somebody wants them. Rate-limited per
person per channel, so somebody who has just been pinged cannot be pinged again
immediately. You may ping a contact; being in the same channel as somebody is
not enough.

## Present

**In a channel, able to hear and be heard, right now.** The thing *Step in* and
*Step out* change, and the thing a deploy costs.

**Presence is not membership.** Stepping out leaves you a member of the channel
and takes you out of `present`; only leaving the channel outright removes you
from the roster. **And presence is exclusive** — an account is present in at
most one channel at a time, and stepping into one steps you out of the last.

**A dropped connection is not an absence.** A socket that dies and returns
changes nothing; only staying gone past the grace period ends presence, and the
roster distinguishes that case — see *Nearby*.

## Recording

Audio kept from a channel, started and stopped by anybody present. A recording
belongs to the channel, is named when it stops, and carries the same name for
everybody who was in it. A recording in progress is announced continuously to
everybody in the room, guests included.

A recording that has just stopped is **mixing** for a few seconds before it can
be played or exported — its card appears immediately, with those two actions
disabled, rather than being withheld with nothing to explain the gap.

## Seat

A guest's standing in a channel: a place they may go back to for as long as it
lasts, rather than a membership. It appears on Home as a smaller card that
opens the guest page, and it expires on its own if unused.

Distinct from *membership* in almost every way that matters — a seat has no
roster, no recordings and no history of the channel, only when it was admitted.
Distinct also from being *present*: a seat outlives the visit, which is what
lets a guest come back.

## Self-mute

Your own microphone, closed by you. It is separate from the *floor* and costs
you nothing — it never affects whether you may claim, and a claim does not
change it.

Stepping out clears it; losing your connection does not. A phone that dropped
out for a minute must not come back with a live microphone its owner had
deliberately closed.

## Step in / Step out

Entering and leaving a conversation without leaving the channel. See *present*.
The verbs are deliberately not *join* and *leave* — *Leave the channel* is a
different, larger action that gives up membership, and the channel disappears
from Home when you take it.

## Transcript

Text made from a recording, on request, by a third-party provider named on the
screen that asks. Everybody gets one free; asking sends everybody's audio out,
so who asked is always shown.

A transcript is never edited. What can be said about it — renaming a *voice*,
dropping one — is a *declaration* laid over the text, so getting it wrong costs
a tap rather than a second paid run.

## Voice

One speaker within a transcript. Usually one voice per person, since each
person's audio was captured separately — see *stem* in Part Two — so a voice
label is only ever drawn where the provider heard more than one voice in audio
this system assumed was one.

## Watch party

A YouTube video everybody watches on their own screens, in step. Nothing about
it is fetched, published, recorded or stored here: it is a link, and each
device plays it. A channel with a party loaded refuses to record — playing or
paused, since a recording made beside one would be missing the thing everybody
was reacting to.

**Mute the room** withholds every microphone *while the video is playing*, and
pausing gives them all back — you pause a film to talk about it. It writes
nobody's *self-mute*, and it is not the *floor*: it withholds everybody and
confers nothing.

---

# Part Two — words that exist only in the codebase

## Card

One row on Home, from either source — an invitation or a channel you belong to.
The two are alternative presentations of the same row rather than a list and an
exception to it.

## Channel state

`ChannelState` in `core/types.ts`: everything true of a channel, reduced by
pure
functions and written to SQLite as it changes. The server owns *when* the
reducer runs and *who* may act; `core/` owns what the rules are. The app never
computes it.

Parts of it are **volatile** — `present`, `disconnectedAt`, `waiting`,
`knocks`, `guests`, the floor, a recording in flight. Those describe a process
rather than a place, and a restart brings the channel back without them. See
*restore*.

## Claim

One holding of the *floor*: `floor.holder` plus `claimedAt`. The delay before
somebody may claim again is derived from `lastClaimedAt`'s ordering rather than
stored, so there is nothing to keep in step with it.

## Core

`core/`, the rules: pure functions over a `ChannelState`, with no I/O, no clock
of its own and no imports outside itself — enforced by
`core/__tests__/purity.test.ts`. Both server and app import it, which is what
stops the two ends disagreeing about what a claim or a recording means.

## Detail (pane)

**The right-hand pane of the two-pane layout**, above the width breakpoint —
the other is the *list*. `usePane()` returns `'list'`, `'detail'` or `null`,
and
`null` means the panes are stacked and there is only one. Every field in the
application lives in the detail pane, which is what the breakpoint is sized to
protect: it must never be narrower than a phone.

**Nothing to do with a level of detail**, and unrelated to the two senses
below.

## Detail (what is open)

**The `Detail` type in `app/src/ui/detail.ts`**: one value naming the single
thing the pane above is showing — `none`, a channel, a profile, settings,
standings or support. Named after the pane, and it is what `App.tsx` holds
where it used to hold a channel id and four booleans resolved in order.

**The contact list is not one of its kinds**, which is the distinction worth
keeping: the list is not something you opened but which index of people the
*list* pane is showing, so it is its own flag and reads the same in both
layouts.

## Detail (of a notification level)

The sublabel under a notification option — `describeLevel(level).detail` in
`core/notifications.ts`, the sentence that says what the level does. A local
field name, not a concept.

## Displaced

The message telling a session it is no longer the one standing anywhere,
because another of this account's devices entered a channel or left the one the
account was in. An account may hold several sessions; it has one voice and one
pair of ears.

It names no channel deliberately: it means *stop standing wherever you were
standing*, and a client that was invited to check whether it agreed would be
the one holding an open microphone.

## Egress

LiveKit's recording jobs. One per participant, which is what makes a *stem* per
person; `track_cpu_cost: 0.15` on the box caps it at roughly ten simultaneous
recorded participants.

## Expired (build)

An installed app below `MIN_SUPPORTED_BUILD` replaces itself with an update
screen and disconnects. The floor is enforced by the client, since 2026-08-17 —
raising the number ends sessions on phones rather than merely licensing a
deletion. See AGENTS.md, which carries the traps around builds 37 and 51.

## Ghost

**A button variant, and nothing else** — transparent background, muted
foreground, for a control that must not compete with the one beside it. It has
no meaning in the product: no user, channel, presence or recording is ever
described as a ghost.

## Guard

An exported `can…` predicate in `core/channel.ts` — `canClaimFloor`,
`canPasteClip`, `canManageGuest`. The app reads them to enable and disable
controls and the server reads them to accept or refuse actions, so a greyed-out
button and a rejected action cannot disagree. **A control the server refuses
must not be offered**, and a control offered must not be silently refused; that
is the one shape a control in this codebase may not have.

## Has the room

`hasTheRoom` — you are in the channel, or nobody is. The rule that nobody
reaches into a conversation they are not in: the people talking decide what the
channel is called, who gets in, what is on the clipboard. Membership is
standing over a channel, not over an occupation of it.

Not presence: an empty channel belongs to all its members equally.

## Heartbeat

`STILL_HERE`, sent per channel while somebody is in one. The least eventful
action in the system — it moves `lastPresentAt` and nothing else — and it is
what keeps that stamp *evidence* rather than a claim about a departure. A
spectator's heartbeat stamps nothing; merely watching a channel is not being in
it.

## Identity

The string a participant publishes under on the media plane, and the key a
*stem* and a transcript line are filed under. A user id or a guest id; shared
playback publishes under one of its own.

## In-app

`ContactView.inApp` — whether somebody holds a socket right now. Deliberately
separate from `lastSeenAt`, which is a number fixed when the snapshot was
composed and therefore decays: a client subtracting it from its own advancing
clock reports the age of the snapshot on top of the real gap. A *fact* does not
decay, which is what lets Home refresh on socket transitions rather than on a
timer.

## Live channel

`liveChannelView` — the channel this **account** is standing in, chosen from
every snapshot the app holds rather than from the last one to arrive.
`liveChannelHere` is the narrower and more often correct one: the channel this
**device** is standing in, which is what decides whether this device holds a
microphone. An account is present whether the room is held here, on the phone
in their hand, or by a process since killed.

Not what Home's **Live** section means. See *live* in Part One.

## Media plane

LiveKit — `livekit-server`, `livekit-egress` and Redis — plus the S3 bucket
recordings land in. Behind the `MediaServer` interface, so the channel rules
stay testable without any of it running. Deliberately provisioned by its own
script, `bin/provision-livekit`, which is what a second box would need if the
media ever splits off.

## Mix

The single file a finished recording becomes, made from its *stems*. A mix
cannot be un-mixed, which is why the floor is applied at encode time and why
speaker identification between participants is never asked of the transcription
provider — we know whose voice is whose by construction.

## Participant

`ChannelState.participants` — everybody who belongs to a channel, initiator
first. **The codebase's word for what the guest-facing screens call a
*member*.** Every guard that must refuse a guest is written as `isParticipant`
rather than as presence or room occupancy, which is what makes a guest refused
by default.

Grows on `INVITE`, shrinks only on `LEAVE_CHANNEL`. **Membership is not
presence** — see *present*.

## Playout

Whether this device is actually rendering the audio it is subscribed to, read
from `inbound-rtp` sample counts. The only measurement of that which does not
itself stop the audio: reading the WebRTC audio device module killed the sound
for four days in August 2026, and the diagnostic panel was the fault.

## Protocol

`core/protocol.ts` — the wire. Its rule is that **an optional field is a
version negotiation**: a server that predates a field sends no such key, which
is exactly what an installed build meets between its release and the next
deploy. Absent and null are routinely different answers, and several fields
document what each of theirs means.

## Reconcile / restate

`reconcileSilence` — comparing what was stated to the media plane against what
the room is actually carrying, once a tick, and restating the difference. A
phone whose connection flaps rejoins publishing a new track id, which the mute
already stated does not name. **The transition is for latency and the
reconciliation is for truth**; do not collapse one into the other.

## Restore

Reviving every unended channel from its state blob at startup. A restart costs
the volatile half of *channel state* — presence, the floor, a recording in
flight — and not the channel. A deploy costs presence, not channels.

## Room

**The media plane's word for a media thing.** `ChannelState.mediaRoom` names
the LiveKit room a channel's audio flows through; it never appears in the
interface, which only ever says *channel*.

Separately, "the room" in prose and in `core/guests.ts` means **everybody
present including guests** — `roomOccupants`, `inRoom` — as against
`state.present`, which is members only.

## Run

One recording from start to stop, identified by a `runId` the server mints. A
run survives pause and resume; there is no *stopped* state, because a stopped
run is simply over and the channel returns to idle so another can begin.

## Seat (developer sense)

The durable half of a guest: a row in `guest_sessions` with a secret and an
expiry, pushed out on every sign of life. `ChannelState.guests` is the volatile
half and means *present*; the seat is what lets somebody come back. See *seat*
in Part One.

## Silenced

Derived from `floor.holder` rather than stored: you are silenced iff somebody
else holds the floor. `isWithheld` combines it with the watch party's room-wide
mute, which is a different thing — a claim withholds everybody but one and
confers control; the party mute withholds everybody and confers nothing.

## Snapshot

One `ChannelView` or `HomeView` pushed over the socket. It carries `serverNow`
so countdowns are computed against the server's clock rather than the device's,
which drifts and can be set by the user.

## Stem

One participant's isolated audio from a recording, uploaded by its own *egress*
job. Because the floor is applied at encode time, a stem is what that person
was
actually heard saying. Shared playback gets a stem of its own, with no owner
and
so no frozen name.

## Train

A deployed build of the web app: `/app` (`stable/`, what the App Store release
is) and `/beta` (`beta/`, what TestFlight has). `server/src/open.ts` is the one
door that decides which a browser is sent to, from what that browser last used.
Deployed by `bin/deploy-web`, not `bin/deploy`, and both directories are
excluded from the latter's rsync — `--delete` would otherwise take them off the
box. See WEB.md.

## Withheld

`isWithheld(state, speaker)` — the single answer to "may this person be heard",
combining somebody else's *claim* with the watch party's room-wide mute. What
the server states to the media plane.

---

## Where the longer arguments are

- **STATES.md** — every state in the system, what each layer calls it, and
  where
  two layers describe the same thing and can differ. The file to read before
  anything that looks stated twice.
- **decisions/DECISIONS.md** and its closed volumes — why a thing is the way it
  is, including what was deliberately not built. Grep the whole set.
- **EXPIRATIONS.md** — every deadline measured in days.
- **AGENTS.md** — the traps that cost a day, and the five verbs (*land*,
  *deploy*, *upload*, *submit*, *release*), which are five different things and
  are not defined here because they are about shipping rather than about the
  product.

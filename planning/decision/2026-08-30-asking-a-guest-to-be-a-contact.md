# Asking a guest to be a contact

Built 2026-08-30 from `TASKS.md` § *Add as Contact From Guest View*. This is what
survives of `planning/GUEST-CONTACT.md`, the design, deleted on 2026-10-03: the
gap, what was decided, and the three reversals of what had been true before it
— a guest to the channel rather than to the app, an identified guest's way
into the rest of the app, and the floor not being a guest's to take. The flow,
the costs, where each piece went and the test plan described code that exists
and were not kept.

**One sentence of it was reversed on 2026-09-16** — *"Acceptance is what also
puts them in the channel … Not a second decision and not a second tap."*
`2026-09-16-three-asks-not-one.md` is that change; everything else here still
describes what is built. The browser walk it called for is in
`backlog/untested-behaviour.md`.

## The gap

Being in the same channel is already permission to ask somebody to be a
contact, and the server already says so: `POST /contacts/:id/request` refuses
anybody who does not `shareAChannel` with the target, on the reasoning that
"their address is theirs to give out rather than ours to reveal so that this
endpoint can work". `ProfileView`'s *Add contact* is the tap that sends it.

**A guest is the one person in the room that route cannot reach.** A guest is
not a participant and has no account, so there is no id to name — and
`pending_invites`, which is how this server holds a request for somebody it
does not know yet, keys on an email address the guest has never given. So the
person most likely to be worth keeping, somebody an acquaintance brought in
over a link and who is talking right now, is the one nobody can ask.

## What is decided

**The act is a contact request, and the guest accepts or rejects it.**
Acceptance is what also puts them in the channel — that is what the task's
"his view simply becomes the channel view, as it is for other channel members"
means — and it is the ordinary `INVITE` any member makes of a contact, made on
the asker's behalf at the moment it becomes legal. Not a second decision and
not a second tap.

**The acceptance is made by an authenticated account**, because that is the
only thing a contact can be a contact *of*.

**Usually there already is one.** A signed-in person who follows a guest link
is a guest to the channel and not to the app — see below, which is a change to
what happens today — so the server knows who he is before anybody asks, and
accepting is a single tap.

**Where there is not, he gets one where he is standing.** The sign-in is on the
guest page, in the room, with the conversation still in his ears — not in a
second tab and not after a navigation. An email round trip is a minute or two
of somebody else's inbox, and every second of it used to be spent either out of
the channel or watching it in another window.

**Rejection is explicit and is reported.** `Guest.request` already keeps
`'refused'` apart from `'none'` because "one is a question nobody has answered
and the other is a question that was answered no". The same argument holds
here, and it is the same shape of record, so it is the same shape of field.

## A guest to the channel, not to the app — which is a change

**Today a signed-in person who follows a guest link arrives as a stranger.**
The guest page never reads `thefloor.token` and `/gws` carries no
authentication at all, so `knock` takes whatever name was typed and admission
numbers them `Anon <n>` if they typed nothing. That is wrong, and it is wrong
in the ordinary case rather than a rare one: **following a link is how an
existing member meets a channel they do not belong to**, there being no other
door into one.

**So a seat may now carry an account.** He is a guest *to the channel* — not a
participant, not in `participants`, refused everything `isParticipant` guards —
and not a guest *to the app*: the server knows exactly who he is, and the room
shows his own display name rather than a number.

The two ideas the codebase already keeps apart do the work here, and neither
moves:

- **The `guest_` identity stays.** It is what the room, the recording stems,
  the usage spans and the floor hold, and it is load-bearing that they can tell
  a seat from an account at a glance. An identified guest is a seat with a name
  behind it, not an account in the room.
- **Membership is still the whole security model.** Nothing about knowing who
  somebody is entitles them to anything; `isParticipant` refuses them exactly
  as before.

### How the identity arrives

- **In the `knock` message, not the query string.** `GuestClientMessage.knock`
  gains an optional token, and the server resolves it with
  `accounts.accountForToken`. The link and the seat secret already ride in
  `/gws`'s query, which is a wart this need not widen — a ninety-day account
  credential in a URL is a different order of thing from a seat's.
- **Presence, not validity, on the page's side.** The page sends whatever is in
  `localStorage`; a stale or revoked token simply resolves to nobody and the
  door falls back to asking for a name. That is `landing.ts`'s reading of the
  same key, for the same reason.
- **`guest_sessions` gains a nullable `account_id`**, so a reconnect keeps the
  identity without re-sending the token, and `Guest` gains `accountId?: UserId`
  beside the name it already carries.
- **The door stops asking a named person for a name.** He has one.

### `Anon <n>` becomes `Guest <n>`

Anonymity was specified and is abandoned. What replaces it is not a
requirement to be named — somebody may still arrive having typed nothing — but
**a fallback that describes them rather than advertising a promise**. `Anon 3`
says the channel is a place you can be hidden in. `Guest 3` says what the
person is, which is what the rest of the interface already calls them.

Three sources for a name, in order, and the middle one is new:

1. **The account's display name**, when the seat is identified. Nothing is
   asked, and no field is shown.
2. **What they typed at the door**, which stays optional.
3. **`Guest <n>`**, assigned on admission, when there is a channel to number
   them in.

- `ANON_NAME_PREFIX` becomes `GUEST_NAME_PREFIX`, and **the counter stays** —
  including its rule of counting every session the channel ever held rather
  than the live ones. That reasoning is untouched by the rename: a number
  handed on from somebody who left, to somebody who arrived, is two people
  under one label in one recording.
- `knock` keeps `'Someone'` for the queue, and the comment that explains it
  keeps being true — the number is an admission-time fact, and there is no
  channel to count in until somebody opens the door.
- `guest.html`'s *Leave blank to stay anonymous* is the one line that was
  making the abandoned promise. It becomes a plain statement of the fallback.
  A page holding a token shows **no field at all**, and a token that turns out
  to be stale costs a number instead of a name rather than an error — the
  rename below is what makes that a shrug. Nothing is said about it, there
  being nothing useful to say: the page cannot tell a revoked session from a
  typo, and the server will not be drawn on which it was.
- The comments on `Guest.name` and `GuestSessionRow.display_name` both name
  `Anon <n>` today and change with the code, gaining the account as a third
  source.
- `server/__tests__/guests.test.ts:403-416` asserts `Anon 1`, `Anon 2`,
  `Anon 3`. The numbers and the reasoning survive; the word changes, and a case
  is added for a seat that takes its account's name instead.

### There is no such thing as a name being taken

Two guests may both be Robert, or one may share a member's name, and **nothing
anywhere notices or says so.** There is no namespace here: a display name is
not unique among accounts, is not looked up by, and is not an identity —
`contactsFor` already says that nothing in this server ever finds an account by
`display_name`. `participant_names` is keyed on the identity rather than the
label, so even a recording with two Roberts in it is two distinguishable stems.

So there is no collision to detect, and detecting one would be worse than
useless: a page that said "somebody here is already called Robert" would be
inventing an ownership this system does not have, and — at the door — would be
answering a question about who is inside.

**What is genuinely missing is unrelated to any of that.** A guest's name is
fixed at admission and there is no control anywhere that changes it. That is a
gap whether or not anybody else shares the name: **a name is yours to change**,
and the reason to add the control is that plain fact rather than a clash.

- **`SET_GUEST_NAME { name }`**, a new entry in `GUEST_ACTIONS`. The actor
  comes from the connection as every guest action's does, so it can only ever
  rename the seat that sent it — there is no guard to write. Trimmed and capped
  at `MAX_DISPLAY_NAME_LENGTH` like the door's, and an empty one is refused:
  clearing a name is not a thing to want, and the assigned `Guest <n>` is an
  admission-time fact rather than a state to return to.
- The server writes `guest_sessions.display_name` beside the reducer's
  `guests[id].name`, so the new name survives a reconnect the way the old one
  did.
- **The control is always available**, on the room screen, for every seat and
  in every state. Nothing conditions it — not on a clash, since there is no
  such thing, and not on whether the seat is identified.
- **It renames the seat, and only the seat.** An identified one starts from its
  account's display name and may differ from it for this visit; the account is
  untouched, and a later visit starts from the account again.
  `guest_sessions.display_name` already holds exactly this, per seat, so there
  is nothing new to store. The alternative — the page editing the account
  through `PATCH /me`, which it holds the token for — would let a guest screen
  change what somebody is called everywhere from inside one room, which is a
  bigger act than the room it was taken in. Settings is where that belongs.
- **Renaming is safe for recordings**, which is the one thing that could have
  made this awkward: `participant_names` is **frozen when the run is filed**
  (`transcripts.ts`), so a rename never rewrites a recording that exists, and
  does apply to one still being made.

### What it changes downstream

- **The knock says who is at it.** A member deciding whether to open the door
  gets the name of somebody this server knows, rather than a word typed by
  somebody it does not. This is the disclosure worth being explicit about:
  following a link while signed in now tells a channel you do not belong to who
  you are, at the knock, before anybody has admitted you. That is the decision
  taken here, and the rename below is the same decision said in one word:
  being unnamed is a state somebody can end up in, not a thing this offers.
- **A member following their own channel's link is now detectable**, where
  before it was a person in the room twice under two identities. The door can
  say so and send them to the channel in the app instead.
- **And the whole exchange this document is about collapses to one tap.** The
  ask names a person the server already knows, so accepting is
  `acceptContact` plus `INVITE` — no address, no code, no inbox. The inline
  sign-in stops being a special contact-acceptance flow and becomes what it
  actually is: **identifying the seat**, after which the same single tap
  applies. Two paths converging on one, rather than two paths.

## An identified guest can get to the rest of the app, and back

A signed-in visitor still sees **the guest view** — he is a guest to the
channel, and being known does not make him a participant. What he also gets,
and an anonymous seat does not, is **a link to Home**, and from Home a way back
into this channel.

- **The guest page shows a Home link when the seat is identified**, and nothing
  when it is not. There is no sense in offering the rest of an application to
  somebody who has no account in it; `/app` would answer sign-in, which is a
  door he did not knock on.
- **It is a rejoinable channel**, and belongs in `rejoinable` rather than in a
  section of its own. A seat you hold is somewhere you can go back to, which is
  the whole of what that list means; the doc comment saying `rejoinable` "*is*
  the set of channels you belong to" is describing what has been in it so far
  rather than stating the rule, and it changes with this.
- **It is rejoinable for exactly as long as the channel is live, and then the
  invitation is revoked** — which needs no new clock, because that is already
  what happens. `Guests.channelEmptied` fires on the transition to empty and
  sets the seat's expiry to now, taking its link with it; the six-hour
  inactivity TTL is the other end of the same rule. So the entry is on Home
  while the seat can be used and gone when it cannot, and `resumeGuest`'s
  refusal of an empty room can never contradict what Home is showing.
- **Most of `RejoinableView` is member-shaped, and a seat must not fill it.**
  This is the part to get right, because the type invites the mistake:
  - `others: PublicAccount[]` is "the other participants, in channel order",
    account **ids** and all. `GuestView.others` is deliberately "names only —
    no ids that mean anything elsewhere, no bios, no profiles". Filling it from
    a seat would hand somebody on Home precisely what the guest view refuses
    him in the room.
  - `name: string | null` is null when nobody has named the channel, and the
    client then describes it by reading out the roster. A guest has no roster,
    which is why `guestView` resolves `channelName` itself. A seat's entry
    carries the resolved string and never null.
  - `createdAt`, `lastActiveAt`, `lastPresenceAt` and `lastPresenceByOthers`
    are the channel's history, and the last is written around a reader who is
    a member. None of it is a guest's to know; the entry sorts on the seat's
    own `admitted_at` instead.
  - `presentCount` is the one field that transfers unchanged — how many people
    are in the room is what the guest view already tells him.
- **So the entry is the resolved name, the present count, and a flag** — and
  the flag does two jobs. It says **open the guest page rather than `/c/:id`**,
  he being no participant and the member's channel screen answering nothing;
  and it tells Home to draw the smaller card, the larger one being built out of
  fields a seat deliberately leaves empty. The address wants a small server
  route that finds the caller's live seat for a channel, rather than one
  rebuilt from `link_token`, which is nullable once that link's row is gone
  while the seat outlives it.
- **Web only, on the client — and this stopped being true on 2026-09-22.** It
  read: a seat can only exist in a browser, so a phone rendering this row would
  offer a place it cannot open. The app holds seats of its own now, for an
  account, and the row is drawn everywhere; an anonymous seat is still the
  browser's. See `decision/2026-09-22-a-seat-rides-the-member-socket.md`, and
  GUEST-LADDER.md § *The app holds seats too*, which gated this sentence's
  removal on exactly that work.

**The seam worth naming: leaving the guest page costs the room.** Following the
Home link ends the connection and the audio with it; the seat survives — six
hours, refreshed on every sign of life — so coming back resumes rather than
knocks, provided a member is still present and the tab still holds its
`sessionStorage` seat. That is the same interruption the acceptance flow was
reshaped to avoid, met here on purpose: this one is a person choosing to go and
look at something else, not a person answering a question they were asked. A
second tab would avoid it and is the reader's call.

## The anonymous seat, which is now the unfamiliar case

Signing in as an account that is **already a contact** of the asker skips to
the invitation; as one **already in the channel**, to the navigation; as **the
asker themselves**, to the refusal `requestContact` already makes. A stale
token in `localStorage` answers 401 and drops through to the email form, which
is the same "presence, not validity" reading `landing.ts` makes of that key.

Two seams the transition leaves, neither worth designing away:

- **The microphone grant does not travel.** `maySpeak` is a grant against a
  seat, and a member needs none, so nothing is lost — but the tab rejoins the
  room under a new identity, and `reconcileSilence` restates the mutes against
  the new track. This is the case AGENTS.md warns about under a floor claim,
  met deliberately rather than by a flapping connection.
- **He may arrive under a different name.** A seat identified from the start
  keeps the name it had; one that signs in at the ask swaps the name typed at
  the door for the account's, which is the only place a name changes mid-visit.

And what does not change: **the asker learns nothing he was not given.** A
guest's address is not revealed by becoming contacts — that still takes the
separate per-reader act `email_reveals` exists for — and a rejection reveals
less than that.

## The floor is not a guest's to take, which is a change

**Two halves, and only one of them is new.**

**Media control is already refused, and correctly.** `holdsSharedControl` reads
`isParticipant` where it once read `isPresent`, and its own comment says why:
"`hasTheRoom` alone would let one through, since a guest is always in the
room." Shared playback, the watch party's transport, starting either, and
recording are all behind that or behind presence-of-members, and none of the
actions is in `GUEST_ACTIONS`. The guest page has no control for any of them.
Nothing to change; it is written down here so that nobody changes it by
accident later.

**The floor is not, and that is the existing functionality this reverses.**
`CLAIM_FLOOR` and `RELEASE_FLOOR` are in `GUEST_ACTIONS`, and `canClaimFloor`
asks `inRoom` against `roomOccupants` rather than `isPresent` — deliberately,
and the comment says so: "the one grant that was a decision rather than an
oversight". The argument was that the floor is about who is talking and a
guest with the microphone is talking.

**What that argument leaves out is what a claim does to everybody else.**
Claiming is not permission to speak — an unclaimed floor already leaves a
guest with the microphone free to talk. **A claim is a demand that everybody
else be silent**, enforced on the media plane, for up to `FLOOR_CLAIM_MS`. So
the grant does not give a guest a voice they lacked; it gives a stranger the
power to mute the members of a channel they were let into, and "a guest is
somebody a member is answering for" is not a description of somebody who may
do that. A guest who wants the room quiet can ask for it out loud, which is
what everybody did before there was a button.

### What changes

- **`core/channel.ts`** — `CLAIM_FLOOR` and `RELEASE_FLOOR` leave
  `GUEST_ACTIONS`, and `canClaimFloor` states the refusal itself rather than
  leaning on the action list, in the shape `holdsSharedControl` already uses:
  `isParticipant` **and** presence. A guard and an allowlist that disagree is
  the one arrangement this codebase does not allow.
- **The two counts in `canClaimFloor` come apart**, and each should ask the
  question it is actually about:
  - *Is there anybody here to be quiet?* — `roomOccupants`, guests included. A
    member alone with a talking guest may still claim; the guest is precisely
    who they would be quieting.
  - *Who is in the queue?* — `state.present`, **members only**, where it reads
    `roomOccupants` today. This is the same hazard `claimDelayMs` already
    names: an id in the ranking that can never take the zero slot delays
    everybody behind it for nothing. A guest's `lastClaimedAt` will now always
    be absent, which the ladder reads as *spoke longest ago* — so every guest
    in the room would add a step to the wait of every member who has spoken.
- **`GuestView` loses `holdingFloor` and `canClaimFloor`, and keeps
  `silenced`** — a guest still needs to be told when a member's claim is why
  nobody can hear them, which is the same "silently withholding this" argument
  the type already makes about the microphone. `others[].speaking` stays and
  still means something: members can hold the floor.
- **`server/web/guest.ts`** loses the floor button and its handler;
  `guest.html` loses the element. The `silenced` line stays.
- **`server/src/channels.ts`** — `guestView` stops computing the two fields.
- The paths that release the floor when a guest leaves (`guestGone`,
  `settleEmpty`) **stay as they are.** They become unreachable, not wrong, and
  a state blob written before this change can still name a guest as the
  holder.

**This is the one wire change that may be made in one step**, because the guest
page is rebuilt by `bin/deploy` and is lockstep with the server —
`decision/` § *The web app is a versioned client* is explicit
that the two ends
have opposite compatibility policies, and this is the end with none. The app's
`ChannelView` is unaffected: it never rendered a floor control for a guest.

`core/__tests__/guests.test.ts` currently asserts the opposite in two places —
a guest claiming, and a guest taking their turn in the ladder. Those become the
refusal and its absence from the queue. `planning/STATES.md` § the floor needs
the sentence too, since it is the file that says which layer means what by
each of these words.

**And it sharpens the feature above rather than complicating it.** What a guest
gains by accepting is no longer only a name on the roster: it is the floor, the
shared track, the watch party and the recording — everything the channel does
together. Being asked to be a contact is being asked to become one of the
people the channel belongs to.

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

## Every term, in one line each

**Front-loaded 2026-09-07 so that reading this section is enough for
ordinary work.** These are the definitions of the terms of communication and
the list is the point: skim it, and go down to the full entry only when a
one-liner is not enough, or when you are about to argue with it. The entries
below carry the reasoning, the history, and the mistakes each word has already
caused; the list carries the meaning.

**Words a user meets**

- **Channel** — The place a conversation happens
- **Channel one is present in, the** — The channel you have stepped into, as against a *live* one, which anybody may be in
- **Channel tabs** — The six views of a channel, one at a time: Members, Notepad, Invite, Listen, Recordings, Watch; the first was *Roster* until 2026-09-14 and the fourth *Player* until 2026-09-18
- **Channels** — One of Home's two lists: conversations you can walk into, in three sections
- **Chime** — The sound a device makes when somebody *else* crosses the boundary of the channel you are in: the rung they land on picks it — two notes rising for stepping in, the same two falling for stepping out, the same note twice going nowhere for stepping back to *nearby* — and a move that does not cross *present* makes no sound at all; see also *recording chime*, the fourth, which is about the room rather than about who is in it
- **Chime path** — Which way a chime reaches the speaker: `player` since 2026-09-17, an `AVAudioPlayer` on the media path, so a phone in silent mode still plays it while it is in a call; `system` is the alert path it shipped on, kept as the control
- **Chime loudness** — One number, `CHIME_AMPLITUDE` — full scale, the top of a ladder that was a setting for one day; the peak the file is rendered at, the media path then playing it at full gain
- **Beat (between chimes)** — 300ms of silence held between two chimes that fall in the same tick, so they are heard as two events rather than as one chord — longer than a whole chime, since a shorter rest is filled by the decay of the note before it; the queue is in `chime.ts` and spans every chime the app plays
- **Recording chime** — The fourth chime and the only one that is not about presence: three notes rising when a recording *somebody started* begins, heard by everybody present including the starter; an automatic run is silent
- **Chip in** — The donation link, on Home's *Support* tab
- **Clipboard (a channel's)** — One piece of text the channel holds, readable and replaceable by anybody in it
- **Close** — The way off any screen you opened, and the word every one of them uses bar the channel screen, whose way off is *Home*
- **Contact** — Somebody you have both agreed to be in touch with
- **Contacts** — The other of Home's two lists: the same people indexed by name rather than by room
- **Dab** — The soft rose disc carrying an `!`, up and to the left of a Home tab's label: something is waiting on that tab. Never a count, and on *Contacts* it clears itself while on *Support* it has to be read
- **Display name** — What somebody is called everywhere: rosters, invitations, recordings. Not unique, holds anything a keyboard produces, and derived from the local part of the sign-in address when nobody types one
- **Floor, the** — The thing the app is named after
- **Floor Settings** — The settings screen behind Home's gear; the account's, not a channel's
- **Getting-started channel** — The one channel a new account with nobody here is put into, called *Getting Started* and nothing else: four such arrivals and a *cohort host*, nobody a contact, leaveable like any other, and temporary — it stops being made when growth no longer needs seeding. Given only to somebody who has granted notifications, at the moment they do, and never to a tombstone or to an address of ours
- **Cohort-eligible** — That a *getting-started channel* is waiting on this account turning notifications on and on nothing else: not a *cohort host*, not already in one, within *reach* of nobody, and the feature switched on. `HomeView.cohortEligible`, and the one thing that lets the app raise the notification question for somebody who has nobody
- **Guest** — Somebody holding a *seat* in a channel they are not a member of, admitted through a *guest link* or a *guest invitation*; with or without an account here. At most forty at once, of whom at most two may hold a microphone
- **Guest invitation** — An offer of a *seat*, addressed to a contact by name and delivered as a push; unlike an *invitation* it makes nobody a member and spends none of the six. Expires when the room empties, or when a member takes it back
- **Guest link** — A link a member shares that lets somebody open a channel in a browser, with or without an account
- **The three asks** — What a member may put to a guest, each one tap and none implying the next: *ask them to join* (an account, nothing else), *add contact* (a relationship, no membership), *add to channel* (the membership, which ends the seat)
- **Help** — The screen for asking The Floor a question, reached from Home's *Support* tab; a person answers it in place, under the question
- **Home** — The screen the app opens on and the frame the rest sits in; holds two lists and the *Support* tab, not one thing
- **Invitation** — An ask to join a channel, from whoever actually asked rather than whoever created it
- **Invitation email** — The message a *contact request* sends when the address has no account; twenty a day per sender, and the only thing here that spends money on somebody who is not a user
- **Invite link** — A link that makes whoever opens it a *contact* of whoever sent it, once they are signed in
- **Invite pin** — The six digits at the end of an invite link, good once
- **Knock** — A named person at the door via a *guest link*, settled by one member answering
- **Labs** — A Home setting deciding whether the unfinished parts exist for you; per account, off by default; *transcripts* is the only thing behind it since the watch party left on 2026-09-18
- **Leaderboard** — The invitation standings: who is here because of whom
- **Live** — On Home, a channel with somebody in it right now — the top of the priority ladder
- **Lock screen card** — The one piece of this interface outside the app: a Live Activity, up while this device is standing in a channel *and still in touch with it*, carrying the channel's name, an *Open* button, a microphone glyph that strikes through when you are not being heard and greys rather than disappears when it is refused, and a tap anywhere that opens the app at that channel. iOS only, 16.1 and later, and the microphone button 17 and later
- **Marketing email** — Permission to write to somebody about the application rather than to sign them in: offered as a checkbox at sign-up and as a switch on *Floor Settings*, which is the only place it can be withdrawn; so far unspent — nothing sends any
- **Member** — A user with an account who belongs to a channel; the guest-facing word for *participant*. Having an account does not make you one — see *the three asks*
- **Nearby / Stepped out** — The two things a roster card says about somebody who is not here; *nearby* is now also something you can declare and step out of, declaring it is an arrival — it notifies the absent, dates *stepped out* from the tap, and restarts its own clock when tapped again on the rung — and it says in a line who arrived rather than stepping you in or asking whether to; stepping into one channel leaves you nearby in the others rather than stepped out of them, five at once being the limit and a sixth evicting the oldest; Home pins a bar for each channel you are nearby in, beneath the one you are present in and alongside it, and hoists a channel nobody is in but somebody is beside
- **Notepad** — One sheet of plain text a channel keeps, saying what it is for; read on the tab of the same name, and written there behind a small *Edit* by anybody with the room. `description` in the code
- **Offline** — Not a word about the network but a state: the socket to the server gone for ten seconds, at which point queued actions are discarded and the app becomes one screen saying so. The media room is a separate connection and may be fine, so you can be offline and still hear the room — what it means is that nothing can be *changed*, the microphone included
- **Ping** — A notification to one person in a channel who is not there, saying somebody wants them; sent only from the room or beside it, by somebody *present* or *nearby*, and only to a contact; its words stay on their profile card while the window is open
- **Present** — In a channel, able to hear and be heard, right now: holding a connection to its media room
- **Public channel** — A channel that has given itself a *public page*; any member may, and it puts nothing on that page by itself
- **Public page** — A channel's page on the web, at an address carrying its id: its name, its *notepad* and its *published* recordings, readable by anybody who has the address and naming no *member*
- **Published** — A *recording* anybody with the address can hear. It goes up when every *participant* has *agreed to publish* it and not before, and comes down when any one of them takes that back — which reaches no copy already downloaded
- **Agree to publish** — One person's consent that one recording may be *published*; everybody whose voice is in it must, and any one of them may take it back at any moment. A *guest* who spoke is asked too where they have an account; one who spoke without an account is the one case nobody can answer for, and blocks it outright
- **Feed** — The *public page*'s machine-readable half, at the same address plus `/feed.xml`: what a podcast app subscribes to, listing the same *episodes* the page does
- **Episode** — A *published* recording as a listener meets it: the same floor-gated mix the app plays, re-encoded as M4A because no podcast client plays Ogg/Opus
- **Record automatically** — A channel setting: the room's first recording begins by itself, and only its first
- **Recording** — Audio kept from a channel, started and stopped by anybody present
- **Seat** — A guest's standing in a channel: a place to return to, rather than a membership. A *guest invitation* is a seat nobody has taken up yet
- **Self-mute** — A microphone closed by hand rather than by the floor; anybody in the room may close yours, and only you can open it again
- **Share** — Handing a copy of a *recording*, a *transcript* or the channel's track to whatever else is on the device; called *Export* until 2026-09-12
- **Step in / Step out** — Entering and leaving a conversation without leaving the channel; stepping in claims the phone's audio system outright, and stepping out is also how a declared *nearby* ends
- **Support tab** — Home's third tab, after the two lists: *Help*, *Chip in* and whatever else is about the application rather than about anybody you can reach
- **Transcript** — Behind *Labs*: without it a recording shows no transcript and no way to ask for one
- **Username** — A name for somebody, unique across everybody, written with an `@`. Derived from their *display name* at signup, editable on the Contact screen, and can be given up
- **Voice** — One speaker within a transcript
- **Watch party** — Shared playback in a channel; behind *Labs* until 2026-09-18, and behind nothing now. A mode rather than a cargo: while a film is loaded no *floor* may be claimed and no recording begun. Against the shared track it is the two *transports* that are exclusive, since 2026-09-20 — both may be loaded, neither may play while the other does, and pausing is the way out of either. The transport is the app's own row on every device, the film's own bar being off since 2026-09-18, and every control on it asks presence — driving as well as starting, since 2026-09-20
- **Screen** — The app instance showing a party's film; any device you are signed in on, chosen with the *Watch on* switch — *this device* (the default once per film, while *stepped in*) or *other device* (the default outside the room), which is one fact each device states in its own terms, and which only moves while the film is paused. Given up when the account leaves the room — and, since 2026-09-20, by *Other device* on a *second device*, which pauses the film, hands it to whichever device is standing in the channel, and is the one way to stop watching that leaves your standing in the channel alone
- **First device / second device** — The two instances a party can be spread across: the *first* holds the presence and every control of the channel, the *second* is the *screen* and holds the film. Not stored anywhere — the second device is simply the screen that is not *stepped in* — and since 2026-09-20 it draws a view of its own rather than the channel screen: the picture, the transport, *Full screen* and the three rungs, and nothing else of the channel or of the party — no *Home* — the way to stop being the second device is *Other device*, under *Full screen* — no corner to float into, and no channel list beside it however wide the window; a film sent here subscribes this device to the channel and opens it on *Watch*, taking the device over whatever it was showing — another channel, the channel list, a settings screen, a transcript, a profile — and only the server's ask counting as an arrival
- **The picture** — Where a party's film is drawn on the device showing it: a pinned row under the tabs on *Watch* — or under the header alone on a *second device*, which has no tabs — or a column beside its transport where the pane is wide enough (see *watch shape*), a small draggable rectangle resting in one of the four corners of the application everywhere else — and that corner only while the film is *playing*, a paused one being hidden rather than parked over another tab — or *full screen*. Mounted above the route table for as long as this device is the *screen*, so since 2026-09-19 neither leaving the Watch tab nor leaving the channel stops a film — Home and the settings keep it in the corner, and going *nearby* or *out* is what stops it. It neither mounts nor plays for somebody who is not in the room — *nearby* and *out* both fail that, a *guest* passes it — and that is a precondition on drawing it rather than a rule that fires afterwards
- **Full screen** — The film filling one device. Two ways in, and a surface gets whichever it can perform: the *Full screen* button on the watch card everywhere, and on a *handheld*, *turning* the device sideways. *Exit full screen* on the scrim leaves — except on a turned handheld, where it is not drawn and the wrist is the way out. On the scrim, the transport and that button and nothing else, fading after three seconds and back at a touch anywhere; the channel's own bar and *Back to portrait* both went on 2026-09-20. Three automatic collapses besides. One device's own business and never the party's
- **Handheld** — A window whose short side is under 500 points, which is to say one somebody is holding: every iPhone in either orientation, a phone browser, and nothing else this app is opened on. The one surface this app turns — see *portrait lock* — a tablet and a browser window being landscape sitting still. `isHandheld` in `ui/layout.ts`; a different question from the layout breakpoint, which a phone on its side is already past
- **Turned** — A *handheld* whose window is landscape, which on a handheld can only mean somebody turned it: nothing else this app runs on is handheld, and a handheld is locked upright away from the film. It is the whole state of *full screen* on a phone — `isTurned` in `ui/layout.ts`, read at render rather than stored, so the picture and the glass cannot disagree
- **Watch shape** — How the *Watch* tab lays itself out at a given size: one column with the picture above its transport, or two with the picture beside it, and in either case how big the picture may be. Decided from the pane's width and the body's height and from nothing the answer itself moves — *two columns when the controls would not otherwise fit* oscillates. `watchShapeFor` in `ui/layout.ts`, and STYLE.md § *The watch body has two shapes*
- **Portrait lock** — The rule about which way up a phone may be: a *handheld* is upright everywhere in the app except *at the film* — the watch card with a film this device can expand, and *full screen* — where both orientations are permitted. A tablet and a browser window are never turned. It is what makes *turned* readable as a gesture, and narrowing it from *full screen alone* to *the film* is what gave the turn back its way in. `usePortraitUnlessAtTheFilm` in `watch/orientation.ts`; on the web a no-op
- **Film title** — What the video is called, drawn under the progress bar on the watch card since 2026-09-20; learnt from the first player that can say, the way its length is, and never asked of YouTube
- **Watching (on the roster)** — That somebody has the film up on one of their devices, said as a suffix on their roster card since 2026-09-20; the account and never the device, drawn only while the film is *playing* — a pause is when nobody is watching — and a wider fact than *watching here*, a *second device* being on this and not on that
- **Watching here** — Your screen and your voice on one device, which mutes the room

**Words that exist only in the codebase**

- **Address** — What a URL says: which list the tier is showing, and what is open over it
- **Starting line** — The contact count an account's *introduction* began from, latched at its first Home snapshot and again on *Show the checklist again*; *get somebody here* ticks when the count has gone above it. Replaced *arrival (invited / alone)* on 2026-09-13
- **Attention** — Whether somebody is at a channel: frontmost on a phone, a hand on it in a browser, and never the audio. One server-held clock per person per channel, and the one the roster's *nearby* line counts — *stepped out* counts presence instead
- **Subscribeable** — Whether there is anything in a room to hear — another occupant, a track, a party — which is what stops *attention* retiring a silent listener
- **Capturable** — Whether a *recording* started now would capture anything: anybody's open microphone, or a track playing. `subscribeable`'s companion, and it counts you where that one discounts you — which is why one person alone may record and, since 2026-09-14, is the whole of what the recording guard asks about the room
- **Capture watch** — The meter a browser runs over its own published microphone, because a granted microphone that carries silence is reported by nothing; `core/capture.ts` counts, each caller reads its own samples
- **Card** — One row in the *Channels* list, from either source — an invitation or a channel you belong to
- **Channel state** — `ChannelState` in `core/types.ts` — everything true of a channel, reduced by pure functions
- **Claim** — One holding of the *floor*: `floor.holder` plus `claimedAt`
- **Cohort host** — The account a *getting-started channel* is opened with, named by sign-in address in `COHORT_HOST_IDENTIFIERS`. **Not a *root***, which is a position in the invitation forest and is most people
- **Cohort seats** — How many people a *getting-started channel* has ever held, the host included. Spent rather than occupied: leaving does not give one back, so a closed cohort stays closed. The one exception is the boot repair, which returns a seat that should never have been spent
- **Core** — `core/`, the rules: pure functions over a `ChannelState`, no I/O and no imports outside itself
- **Conversing** — You, present in a channel, with somebody else in it — another member or a *guest*; `isConversing` in `app/src/state/conversing.ts`. It stamps the *introduction*'s *step in with somebody* rung and latches the notification ask, and it is not the same as having stepped in
- **Detail (pane)** — The right-hand pane of the two-pane layout, above the width breakpoint — the other is the *list*
- **Detail (what is open)** — The `Detail` type: one value naming the single thing the detail pane is showing
- **Detail (of a notification level)** — The sublabel under a notification option, saying what that level does
- **Device token** — Where APNs delivers to one install. An *address*, not a credential, and absent entirely for an install that declined notifications
- **Displaced** — The message telling a session it is no longer the one standing, another device having entered
- **Dismiss (a rung)** — Putting one rung of the *introduction* away for good, with the cross beside it; it hides that rung and never ticks it, lives on this install rather than on the account, retires the whole card when the last one goes, and is undone only by *Show the checklist again*
- **Egress** — LiveKit's recording jobs
- **Expired (build)** — An install below `MIN_SUPPORTED_BUILD`; it replaces itself with an update screen
- **Growth classes — alone, first circle, onward** — The three cohorts `bin/growth` sorts every account into, by its depth in the invitation forest
- **Guard** — An exported `can…` predicate in `core/channel.ts` — `canClaimFloor`, `canPasteClip`, `canManageGuest`
- **Has the room** — `hasTheRoom` — you are in the channel, or nobody is
- **Heartbeat** — `STILL_HERE`, sent per channel while somebody is in one
- **Identity** — The string a participant publishes under, and the key a *stem* and transcript line file under
- **In-app** — `ContactView.inApp` — whether somebody holds a socket right now
- **Installed (web app)** — A *train* put on a home screen or dock by the browser; it reports `display-mode: standalone`, gets an icon, and still cannot notify anybody
- **Intent (a watch party's)** — *Retired 2026-09-18.* The video's own bar was a second way to press the transport, read off the player because the IFrame API never says what caused a state change. Telling a thumb from the echo of the app's own command took four phases and seven constants and failed five times; `controls: 0` removed the surface instead. The transport is the app's own row, and a button press *is* an action
- **Introduction** — What a new account is shown above both lists until every rung of it is done *or dismissed*: one ladder, the same for everybody — get somebody here, step in with somebody, an install rung in a browser that can, and four things to try inside a channel that are the only rungs the server had to be taught to record; one rung is drawn in full, the done ones are a title each, the rest are behind *See more*
- **Island** — A connected component of the accepted-contacts graph: people who can all reach each other through mutual contacts
- **Live channel** — `liveChannelView` — the channel this *account* is standing in, across every snapshot held
- **Media plane** — LiveKit — `livekit-server`, `livekit-egress` and Redis — plus the S3 bucket recordings land in
- **Mix** — The single file a finished recording becomes, made from its *stems*
- **Mute (four things, one word)** — The word does four jobs and only the first is the user's; they are separated in the entry
- **Nav action — `home` / `swipeOut` / `swipeIn` / `liveCard`** — The four ways between Home and the channel you are standing in, named so they can be counted against each other: the Home glyph and the right swipe are the same journey out, the pinned live line and the left swipe the same journey in — the swipe going to the topmost hoisted bar, which is the live line whenever one is drawn. Named by the *control* rather than by the outcome, because two of them mean the same thing to the application and differ only in what the thumb did, which is the whole question. Counted in `nav_counts`, which holds no account — so it can say which way is common and can never say what any one person did
- **Notification kinds — invited / arrived / accepted / pinged** — The four things this server sends to a phone; only *pinged* is words somebody wrote, and only *accepted* is about a person rather than a room
- **Notification answer** — `accounts.notifications` — whether the app may reach somebody when it is not running, as their client last said: granted, undetermined or denied, and **null for nobody has said**. Not the same fact as holding a *device token*, which proves only the first
- **Funnel level** — One of the fourteen steps in MARKETING.md between an impression and a recommendation; the code knows four of them by number — 3 in `accounts.notifications`, 4 in `bin/cohorts`, 9 and 10 in `pings`
- **Participant** — `ChannelState.participants` — everybody who belongs to a channel, initiator first
- **Playback blocked** — A browser refusing this page permission to make sound; lifted by a real gesture and by nothing else, and always false on a phone
- **Playout** — Whether this device is actually rendering the audio it is subscribed to
- **Protocol** — `core/protocol.ts` — the wire
- **Pump** — `PlaybackPump` — what *produces* shared playback, as distinct from publishing
- **Reconcile / restate** — Comparing what was stated to the media plane against what the room carries, once a tick
- **Restore** — Reviving every unended channel from its state blob at startup
- **Room** — The media plane's word for a media thing; never appears in the interface, which says *channel*
- **Root** — An account at depth 0 in the invitation forest: the top of a tree, whatever grew under it — most grow nothing
- **Reach** — How many people somebody can get to through contacts, counting themselves and counting *pending* rows as edges, bounded by whatever limit was asked. One of the two things a *getting-started channel* is gated on — notifications being the other — and deliberately **not** the *island* of `bin/growth`, which walks accepted edges alone
- **Run** — One recording from start to stop, identified by a `runId` the server mints
- **Seat (developer sense)** — The durable half of a guest: a `guest_sessions` row with a secret and an expiry
- **Session (auth)** — One sign-in, and so in practice one device: a row in `tokens`. Several per account since 2026-08-24, and anonymous by construction
- **Session want — `call`, `idle`** — What this app is asking iOS for, decided in one place (`wantFor`)
- **Silenced** — Derived from `floor.holder` rather than stored: you are silenced iff somebody else holds the floor
- **Snapshot** — One `ChannelView` or `HomeView` pushed over the socket
- **Speaking report** — A *withheld* speaker's own device saying it is talking, because no other device can see it
- **Stem** — One participant's isolated audio from a recording, uploaded by its own *egress* job
- **Train** — A deployed build of the web app: `/app` (stable) and `/beta` (TestFlight)
- **Withheld** — `isWithheld` — the single answer to whether this person may be heard

---

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

**And an entry is not written until it is in the list at the top.** Adding,
renaming or retiring a term means two edits, not one, and the list is the half
that gets read — a term missing from it is, for most sessions, a term that does
not exist. Keep the line to one clause that says the meaning; the contrast and
the argument stay down in the entry, which is what the entry is for.

**It is not an index of the code.** Where the reasoning behind a term is long,
the entry says the term's meaning in a sentence or two and points at the file
that argues it — usually STATES.md, decisions/, or the type's own
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
(`MAX_CHANNEL_PARTICIPANTS`) and up to forty guests
(`MAX_CHANNEL_GUESTS`), of whom at most two may hold a microphone
(`MAX_SPEAKING_GUESTS`).

**So a full room is forty-six people and eight of them are audible**, and the
two ceilings are asked separately: six is what a conversation holds, forty is
what the room can carry as an audience. The two speakers are drawn from the
forty rather than added to it — a guest granted the microphone occupies one of
them, not a forty-first place. Until 2026-09-21 neither guest number existed
and a member could hand out microphones without limit; see
`decisions/2026-09-21-asking-somebody-in-as-a-guest.md`.

Never called a *room* on screen. See *room* in Part Two, which is the media
plane's word for the audio underneath a channel and is a different thing.

## Channel one is present in, the

**The channel you have stepped into** — the one you can hear and be heard in
right now. There is at most one, presence being exclusive, and it is the thing
the tier's bar names.

**Not a *live* channel, which is the contrast it exists for.** *Live* is a
property of a channel and holds whether or not the person asking is in it:
somebody is in there. This is a property of the pair — you and a channel — and
the word for that is already *present*, so this is the phrase built out of it
rather than a coinage. Asked from outside, *is it live?*; asked from inside,
*is it the one I am present in?* A channel can be both, and every channel you
are present in is also live, since you are somebody.

**The name was settled 2026-09-08, and the code still disagrees.**
`liveChannelView`, `live` in `App.tsx` and "the live bar" all mean this and
say *live*, which is the Part One word for the other thing — see *live
channel*, which is where the collision is recorded rather than resolved. The
rename is outstanding; until it happens, prose says *the channel one is present
in* and the code says *live*.

**On screen it is the bar at the top of Home**, drawn whenever there is one.
It used to be withheld in a split whose detail pane held that very channel, on
the grounds that offering to take you back is false when you are already there
— which left the sidebar naming it nowhere at all. See
planning/decisions/2026-09-08-the-tier-says-which-room-you-are-in-always.md.

## Channel tabs

**The six views of a channel**, one at a time, on the switch a channel screen
draws: *Members*, *Notepad*, *Invite*, *Listen*, *Recordings*, *Watch*.
Peers, in the way *Channels* and *Contacts* are on Home — none is a child of
another. A glyph and a word each, since 2026-09-12, built the way the channel
*footer*'s controls are.

**Who, then what.** The first three are the people — who is here, what they
have written down (the *notepad* and the *clipboard*, both written in place),
and how somebody who is not here gets in. The last three are what the channel
is carrying, which outlives the moment: what is playing, what is being
recorded and what was recorded before, what is being watched. The
recording transport is on *Recordings* since 2026-09-12; it was a second card
on *Listen* until then, on the reasoning that recording is what playing is
doing to the room — but the tab somebody goes to about a recording is the one
named after them. It is a card again on the tab it moved to, as of
2026-09-13, and neither it nor the shared track's card carries a label over
it: the tab is the heading where a tab holds one thing.
*Watch* being last is also what keeps the other five still, it being the only
one that can be absent.

**The first is *Members*, and was *Roster* until 2026-09-14.** *Roster* was
the only tab named after a thing rather than after the people or the object it
holds, and it was a word this app used nowhere a user could see it — the
vocabulary a screen teaches should be the vocabulary the rest of the app
answers in, and *member* is a word the guest-facing half already says out loud.

**It is named for what the channel is made of, not for everything drawn on
it.** The tab lists *guests* and whoever is *knocking* as well as members, so
the name is narrower than the contents — deliberately, on the grounds that a
guest is a visitor to a membership rather than a second kind of it, and that
the heading somebody reads before a list of people should say whose room it is.
*Roster* was neutral about that and said nothing at all; see *member*, which is
the term this now spends on a second thing.

**The third is *Invite*, and was *Invite links* until 2026-09-13.** The old
name was the plural of a term this glossary already spends on something else —
an *invite link* makes whoever opens it a *contact*, and is sent from
*Contacts* on Home, not from here. What this tab holds is the two ways into a
channel: a contact who has an account, and a *guest link* for somebody who has
not. Neither of them is an invite link, so the tab now says what it does rather
than naming the wrong object.

**The fourth is *Listen*, and was *Player* until 2026-09-18.** Both tabs are
players — one carries audio, the other a film with its picture — so naming one
of them after the machinery said nothing that distinguished it from *Watch*.
The pair now says what somebody does there rather than what the tab holds,
which is the verb the rest of the vocabulary is in. **The rung underneath it
is still called `player`**: `/me/tried` refuses a name it does not know and
`accounts.ts` keeps a `tried_player` column, so that id is on the wire and the
rename stopped at the word on the screen.

**The order ran differently until 2026-09-12**, with the four carried things
together and the invitations tab at the end as the rarest thing anybody does
here.
Rarity is a reason not to make a tab the one you land on; it is not a reason to
file it away from the subject it belongs to.

**At the top of the screen, pinned with the rest of the header.** For a day
between 2026-09-12 and 2026-09-13 that was a choice on *Floor Settings* —
there or above the footer, with a coin toss deciding which an account that had
never said got. Both are gone: a set of controls with two homes is a set with
two places to look for it, and the one setting in the application whose
untouched case was not a fixed default is no longer an exception to explain.
See planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.

**Two of them, since 2026-09-12; six before that is wrong and two is what it
was.** *Roster* and *Invite links* were the pair, and everything else ran down
the roster's own scroll under a *What the channel is carrying* heading — five
sections that are not about the people in the room, stacked under the one that
is, on the longest screen in the application. The heading is gone: the switch
draws that seam now.

*Watch* was the one that was not always there, being behind *Labs* — except to
somebody sitting in a channel where a party was already running, who had to be
able to stop it. Since 2026-09-18 it is behind nothing, so every tab is offered
to everybody at all times, whatever the room is doing; a set of fixed controls
that changes shape under a finger already on its way is the wrong one pressed.

See planning/decisions/2026-09-12-the-channel-screen-is-six-tabs.md.

## Channels

**One of Home's two lists**: the conversations you can walk into, in three
sections — the ones somebody is in, the ones you have been asked into, and the
rest. Nothing else: contact *requests* were drawn under them until 2026-09-05
and are in *Contacts* now, with the form that sends one. The tab Home opens
on, and `/channels` in a browser.

The word had no user-facing life until 2026-09-01, the list having been called
*Home*. It is the plural of *channel* and nothing more; what it contrasts with
is *Contacts*, which is the same people indexed by name rather than by the room
you talk to them in.

## Chime

**The sound a device makes when the room changes shape, or when a recording
begins.** Two notes rising when
somebody steps in, the same two falling when somebody steps out — the second is
audibly the first one backwards, which is what lets the difference be carried by
a sound nobody was taught.

**Three of them, not two, since 2026-09-15.** A pair that does not move —
E5 twice, neither rising nor falling — says somebody has stepped back to
**nearby**, the rung that is one ping from the room.

**Which of the three you hear is decided by where somebody lands, and whether
you hear anything at all by whether they crossed `present`** — two clauses,
since 2026-09-17. So `in→out` falls, `in→nearby` rings nearby, and both
`out→in` and `nearby→in` rise. **`out→nearby` and `nearby→out` are silent**:
somebody moving about outside has not changed who is in the conversation, and
interrupting it to say so is interrupting it for nothing. The first of those
two rang until 2026-09-17 and was the case the third chime was built for, which
makes it the real cost of the rule rather than a tidy-up. One filter sits on
top and is not derivable from either clause: **only a departure somebody chose
rings `out`**, a dropped connection and a spent attention window being clocks
rather than decisions. See `decisions/2026-09-17-the-chime-follows-the-room.md`.

**You never hear your own movement, in any direction**, which is the oldest
rule here and the reason the cue is local rather than published into the media
room. And **a tick sounds one chime per kind, every kind that applies, in the
order `in`, `out`, `nearby`** — two people leaving and one stepping back to
nearby is two chimes, not three.

**Those come one after another, not together.** A beat of 300ms
(`CHIME_BEAT_SECONDS`) is held between chimes that fall in the same moment, so
a pair of events is heard as a pair. It was one note long until 2026-09-17 and
was reported as hardly distinguishable from a single sound: a note is still at
a fifth of its peak when the next is due, so a rest that short is filled by the
decay of the note before it. Until 2026-09-17 they were *simultaneous*
— the alert path starts a sound and returns, so two calls in one tick are a
chord rather than a sequence — which made the narration order inaudible and the
events unrecoverable. The queue is in `chime.ts` and spans both hooks, so an
arrival and a recording starting in one tick are spaced too. See
`decisions/2026-09-17-two-chimes-at-once-are-a-chord.md`.

**Why *nearby* needed a sound of its own at all**, which is the 2026-09-15
half and still holds: it had been ringing the arrival chime, so *stepped in*
and *stepped to nearby* were the same event to every ear present. They are not
the same event, because one of those people can speak and the other cannot — a
nearby person holds no connection to the media room and hears nothing. A cue
that collapses them tells a room to expect a voice that is not coming, which is
the one failure worse than a cue nobody hears.

**A fourth since 2026-09-17, and it is not a presence chime.** Three notes
rising — C#5, E5, A5 — when a **recording** somebody started begins. The other
three answer *who is in this room*; this one answers *what is being done with
what I say in it*, which is why it is three notes where they are one or two and
why it is nobody's arrival. **Everybody present hears it, the starter
included**, which is the one place it breaks the rule below: the sound is not
information for the person who pressed Record, it is the moment both parties
were told, and a notice one party is exempt from is a weaker thing to have
given. **A run the channel started by itself is silent** — `autoRecord` means
nobody pressed anything, so there is no moment of notice to announce, and that
scope is deliberate rather than settled. What it is *for* is
`backlog/two-party-consent-has-not-been-reviewed.md`: until it existed the
notice that a run was underway was a red dot, which reaches whoever is looking
at a screen and nobody else. It does not answer that question and must not be
read as answering it. See
`decisions/2026-09-17-a-recording-somebody-started-says-so-out-loud.md`.

**It is not in the media room**, and that is the distinction the word has to
hold. Nothing is published into LiveKit; each device makes its own sound about
other people, so it is absent from recordings, absent from transcripts, and —
the rule that decided the whole design — for the three presence kinds, **never heard by the person it is
about**. You know you walked in; the recording chime is the exception and says
why above. See
`decisions/2026-09-14-the-room-says-who-came-and-went.md`.

**How loud is one number, and was the listener's for one day.** It is the
**peak the file is rendered at** and not a volume control:
`AudioServicesPlaySystemSound` takes no gain, so louder means louder samples,
and the phone's ringer, silent switch and output route outrank it. On
2026-09-15 *Floor Settings* offered five rungs — quietest through loudest,
geometric because loudness is — and the ladder was withdrawn the same day,
because a phone heard all five as much the same and five words that do not
reliably differ are worse than one number that is simply louder. The number is
`CHIME_AMPLITUDE` in `app/modules/audio-route/index.ts` and `chimeAmplitude` in
`AudioRouteModule.swift`, kept equal, and it is the ladder's **top** rung —
full scale for a sine, and the ceiling the renderer clamps to, so there is no
larger number to reach for. Louder than this is the path or the waveform, not
the peak. The audio lab still
sweeps the five, which is where any other number is heard. See
`decisions/2026-09-15-the-chime-has-one-loudness-again.md`.

**Only a departure somebody chose.** Of the four ways to stop being present,
two are clocks running out — a connection past its grace, an attention window
expiring — and neither sounds. See `core/channel.ts` § `Exit`.

Distinct from the **buzz** (`app/src/audio/cue.ts`), which is the vibration
motor and tells *you* something about yourself without words. The two shared a
delivery mechanism — an iOS system sound, chosen because it starts no engine
and writes no audio session — until 2026-09-17, and now share only the second
half of that reason. A chime goes out an `AVAudioPlayer` on the media path,
which also writes nothing to the session but, unlike an alert, is not silenced
by the ringer switch; the buzz is still a system sound. See
`decisions/2026-09-17-the-chime-is-not-an-alert.md`. `usePresenceChime` is the
schedule for the three and `useRecordingChime` for the fourth, `chime.ts` the sound, and `AudioRouteModule.swift` renders it —
`chimeNotes` there is the table of kinds, and `chime.web.ts` mirrors it row for
row so the same event does not sound like a different one depending on which
screen somebody is at.

## Chip in

The donation link, on Home's *Support* tab. Voluntary, unlocks nothing, and
shown only to people the server places in the United States storefront — see
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
Settings, Channel Settings, Support, Standings, a profile, a transcript, and a
channel you are no longer present in. It empties the *detail* pane and leaves
the *list* beside it alone.

**Deliberately not "Back", which it said until 2026-09-01.** Back means *reveal
what is underneath*, and above the width breakpoint there is nothing underneath
— the list is beside rather than under. One word that is true in both layouts
is what lets the handler be one line with no test of which layout is in force.

**In a browser it is the only way off, and the Back button is not one.** Four
of these screens have no *address* — a profile, a transcript, a channel's own
settings, and which channel a channel screen is — so the browser's Back does
not see them: pressing it leaves for the list, or leaves the site. Chosen on
2026-09-04 rather than overlooked, and the alternative was giving those screens
addresses, which would have meant putting ids in them. See
decisions/ § *An address names a place and never an id*.

**The channel screen's own way off used to be two words and three cases** —
*Home* on a phone, *Close* in the *detail* pane, and neither while you were
present in the channel. All three collapsed into one on 2026-09-01, when
*Home* became the frame that carries the live bar over whichever list is
showing: closing a channel can no longer hide a conversation somebody is in, so
there is nothing to withhold and nothing to navigate to.

**That one is called *Home* again, and draws a house, since 2026-09-12** — the
single exception to the word above, and the change is in what the control is
named after rather than in what it does. What collapsing the three cases
established is that leaving a channel lands you on *Home* in every layout and
whether or not you are present, so here the destination is a fact and can be
named; the old *Home* was rejected for being one of two labels picked by
layout, which this is not. Every other screen keeps the cross and the word,
because a *detail* pane empties into whichever list was already beside it and
the act is the only thing true of both.

Distinct from *Home*, which is the place this one names, and from *Step out*,
which gives up presence rather than closing anything.

## Contact

Somebody you have both agreed to be in touch with. Contacts are mutual;
becoming one comes with a channel for the pair. A *request* is a contact that
has been asked for and not yet agreed — outgoing or incoming.

Being in the same channel as somebody is not being their contact. Channels hold
people a mutual friend brought in, which is why *inviting* and *pinging* check
contacts separately from presence.

**It is also the name of a screen, and the code calls that screen something
else.** What a reader opens by tapping somebody is headed *Contact*; the
component and the file are `ProfileView`, and *profile* is the developer word
throughout — one of the places this glossary exists to stop somebody
reconciling. The header says which of four things the person is, because
*Contact* may only be said where it is true: **You** for yourself, **Contact**,
**Contact requested** while a request either way is outstanding, and **Channel
member** for somebody reached from a roster who is none of yours. That last one
is deliberately not *contact of a contact*: whoever invited them has them as a
contact, but need not be a contact of *yours*, and nothing on the client can
tell.

## Contacts

**The other of Home's two lists**: the same people indexed by name rather than
by the room you talk to them in. `/contacts` in a browser.

An entry of its own because the pair are peers, which the glossary said in the
*Home* entry and then undercut by describing only one of them. Tapping a row
here opens a *Contact* — the screen, which the code calls `ProfileView`.

Contact *requests* are here too, since 2026-09-05, in a section above the
people: asking and being asked are one subject, and a request is not a
channel. A request row is the one row on this list that opens nobody — an
outgoing one is an address rather than a person — so it carries Accept,
Decline or Withdraw on itself.

## Dab

**The mark on a Home tab that says something is waiting on it**: a soft rose
disc with an `!` in it, sitting up and to the left of the label and clear of
the word. `styles.dab` in `ui/components.tsx`, drawn by `Segmented` for
whichever options `HomeView` asks.

**Its own word because it is not a dot**, and the difference is the whole of
what it says. Every other mark in the interface — live, nearby, muted, speaking,
recording — is 8 to 10 across and sits *beside* the thing it is about, which
reads as a status light: a thing reporting, which you read and move on from. The
`!` is a thing asking. So a dab means *attend to this, but it can wait a beat*,
and a single glyph rather than a number is what keeps it at that volume.

**It was a blank lozenge laid over the end of the label until 2026-09-15**,
which said *asking* by being in the way of the word. That is the right thing
for it to say and the wrong way to say it: the mark covered the trailing
letters, which on *Contacts* and *Support* are what tell the two apart, and a
shape with nothing in it still had to be guessed at. The `!` says it outright,
so the disc can go where nothing is lost. STYLE.md § *Dots, pills and rules*
has the geometry.

**Two things raise one, and they are not symmetrical.** On *Contacts* it means
somebody has asked to be a contact and it is your turn — live state off the Home
snapshot, so it arrives with the request and leaves when the request is answered,
and nothing is remembered. On *Support* it means an answer to one of your *Help*
questions has come back since this phone last opened that screen — which has to
be remembered, an answered question staying answered for ever. One clears itself;
the other is cleared by being read. `state/helpSeen.ts` argues it, and
`decisions/2026-09-15-the-two-dabs-are-not-symmetrical.md` is why.

**Never a count**, deliberately. An outgoing contact request is not in the
Contacts count at all — only the other person can answer one, and a mark for it
could not be cleared by tapping through — and the Support one cannot be counted
without the *Help* screen gaining the unread marks it does not have. What a tab
owes is *go and look*, which is what the `!` says and a number would not.

Rose rather than red: it is good news arriving slightly inconveniently, not a
fault. `waiting` in `theme.ts`, which is the palette's seventh hue and the only
one added since the interface was designed.

## Display name

**What somebody is called, everywhere anybody sees them**: rosters,
invitations, recordings, the Contact screen. It need not be unique, it holds
anything a keyboard produces, and it is not how anything identifies anybody —
see *username* for the other name, which is the opposite on all three counts.

**Nobody is nameless, and nobody is named after their address.** Signing up
offers the field and does not require it, so from 2026-09-12 a blank one is
derived from the local part of the address instead — `anna.k@example.com`
becomes *Anna K*, separators read as spaces, each word capitalised, the domain
and any `+tag` dropped. `core/derivedNames.ts` owns that and says why the whole
address, which is what was stored until then, is the one string here that is
nobody's name: it is the private half of an identity, drawn to strangers.

Typing one at signup replaces it, on an existing account as much as a new one,
and so does the Contact screen.

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

## Floor Settings

**The settings screen behind the gear in Home's header**, and the one the word
*Settings* used to name on its own. Called this since 2026-09-12, because a
channel has a screen of its own reached by an identical gear from an identical
header — *Channel Settings* — and two screens with one name leave which of them
you are on to be inferred from what is on it.

What is on it belongs to the account rather than to the phone, so it follows
somebody to a second device: the colour scheme, whether a tap on a channel
looks or steps in, whether the channel screen repeats its footer's controls as
cards, and *Labs*. Below those sit the things
about this install and this account — notifications, the policies, chipping in,
signing out, and deleting the account. See core/settings.ts, which is where the
ones that travel are defined.

## Getting-started channel

The one channel a new account is put into without asking for it: *Getting
Started*, which is what every one of them is called. Up to four people who
signed up around the same time, plus a *cohort host* — one of the people who
run The Floor. It is an ordinary channel in every other respect: it can be
named, written in, recorded in, and left from its settings screen like any
other.

**The name carried the cohort's number until 2026-09-18**, and the number was
a disclosure: with `COHORT_SIZE` at five, *Getting Started Cohort 2* tells a
stranger that between six and ten people have ever arrived here with nobody to
talk to — on the Home screen of exactly the people being asked to believe the
place is worth staying in. A member is in at most one and had nothing to tell
it apart from. The host is in all of them, so their channels list is the one
screen that needs a discriminator, and it reaches them as
`RejoinableView.cohort` — a number sent to hosts alone, absent from everybody
else's snapshot rather than hidden in their client. See `COHORT_CHANNEL_NAME`.

**It exists because the application does nothing for one person.** Home is two
lists, and a new account arrives with both of them empty and every control on
the channel screen greyed out. Nothing here can be demonstrated alone, so
somebody who arrives with nobody has no way to find out what this is.

**Nobody in it is a contact, and that is not an oversight.** Being in a
channel together has never been a contact here and this does not change it:
the roster shows display names, no address is exposed, and every contact
anybody ends up with is one they chose. It is one room, not a directory —
there is no search for people and nothing suggests anybody to anybody.

**Only for somebody who arrives with nobody.** An account that signs up on an
invitation which already puts it within *reach* of four people is not placed
in one; they have what it would have given them. See `COHORT_REACH_FLOOR`.

**And never for a tombstone or for an address of ours**, since 2026-09-18.
`Accounts.cohortExcluded` refuses an erased account and every address on
`rvanegas.co` — the App Review accounts and the `rtest…@` rigs alike — on both
the signup path and the boot backfill. These are refusals about *who somebody
is* rather than about their situation, and the difference is that none of them
can stop being true: the other gates below can. The first backfill had neither
rule and put two tombstones and a test rig into live cohorts; the boot repair
takes out whoever it placed and gives the seat back.

**And only for somebody who has granted notifications**, since 2026-09-15 —
and *granted* explicitly, since 2026-09-18.
The whole of what the channel offers is that somebody may speak into it later,
so a member who cannot be told that happened is a *cohort seat* — spent once,
never returned — that can never answer. The placement therefore waits: it
happens on the registration that brings an account its first device token,
which is `POST /devices` and not the signup, and an account that never turns
them on is never placed. *Cohort-eligible* is the server's name for somebody
waiting on exactly that and nothing else. See
`decisions/2026-09-15-a-cohort-seat-goes-to-somebody-who-can-be-told.md`.

**A device token was standing in for the permission**, and the two come apart
in both directions — a token outlives a permission switched off in Settings, a
permission outlives the token a sign-out dropped. Worse, `accounts.notifications`
is null for every build before 213 and null means *unknown*, so an old build
registering an address was read as a yes. The gate now wants both halves and
reads unknown as refused. The cost is that the backfill passes over accounts on
older builds, which is the right trade for a feature whose whole point is the
arrival who can be told: they are refused for a reason they can undo, and the
next build they run says so.

**It is a growth hack and it ends.** It seeds activity while there is not
enough to seed itself, and when growth no longer needs it, emptying
`COHORT_HOST_IDENTIFIERS` stops new ones being made and withdraws the privacy
page's section about them in the same restart. Channels already made are left
standing — by then they hold conversations, and retiring a feature is not a
reason to take one away from anybody. See
`decisions/2026-09-15-a-new-account-does-not-arrive-alone.md`.

The card below the tabs is what says all of this to whoever is in one; it can
be dismissed, per install, and dismissing it changes nothing about the channel.

## Guest

Somebody holding a *seat* in a channel they are not a member of, admitted
through a *guest link*. They can listen; they can speak only if a member turns
their microphone on; they cannot record and cannot reach anything else of
yours.

**Not "somebody with no account here"**, which is what this said until
2026-09-16 and what the code said with it. A seat may carry an account — that
has been true since 2026-08-30, when following a link while signed in stopped
making somebody a stranger — and since the three asks came apart it may carry
somebody who is a *contact* of a member in the room and still a guest of the
channel. **Having an account and belonging to a channel are two facts**, and
conflating them is what the ladder below exists to stop.

A guest is *in the room* but is not a *participant* — every rule in this system
is written so that a guest is refused by default and granted things one at a
time, in writing. Being known confers none of it. See *participant*, *member*,
*seat*, and *the three asks*.

**Forty at once, and two microphones between them**, since 2026-09-21. Both
ceilings are new and neither existed before: nothing counted guests at all, and
a member could grant the microphone to everybody who knocked. The forty is
refused at the moment somebody enters the room rather than at the door, because
answering a knock is only half of an admission and a reconnecting guest makes
the other half alone. The two is refused at the guest's *ask* rather than at the
member's grant, so that a full room simply has no ask in it and nobody has to
say no. Withdrawing a microphone and ejecting a guest are always available,
ceiling or not.

## Guest invitation

**An offer of a *seat*, addressed to one person by name.** A member asks a
contact to come and listen; it arrives as a push, sits on their Home as
something they have been asked into, and becomes a seat the moment they walk in.

**Not an *invitation*, and the two must not be run together.** An invitation
makes somebody a *member*: it writes them into the channel's roster, spends one
of the six, and is permanent until they leave. This makes nobody a member,
spends none of the six, and is gone when the room is. Until somebody accepts it
exists only as a row — there is nothing about it in any channel's state, which
is exactly what stops it being a membership by accident.

**Contacts only, where a *guest link* may be handed to anybody.** The asymmetry
is the point rather than an inconsistency: a link cannot ring, being inert until
somebody in the room opens the door, and this rings. So it is held to the rule
that nobody reaches you unless you have both agreed.

It ends three ways and two of them need nobody: the room emptying of members,
the seat's own expiry, or a member in the room taking it back.

## Guest link

A link a member shares that lets somebody open a channel in a browser. It is
not self-propagating: anybody holding it can *knock*, and only somebody already
in the room can open the door. It stops working once the channel is empty of
members.

**With or without an account**, and it was the *only* way an existing user could
meet a channel they do not belong to until *guest invitations* arrived on
2026-09-21. It is still the only one that reaches somebody who is not a contact.
Following it while signed in makes you a guest *of the channel*, not a guest of
the app: the room shows your own name, and you are refused exactly what any
guest is.

## The three asks

What a member may put to a guest, from inside the room. **Three questions, each
one tap, and none of them implies the next** — which is the change of
2026-09-16, the first two having been one act until then.

- ***Ask them to join*** — will you make an account here? It asks for nothing
  else: not a contact, not a membership. Offered only to a seat with nobody
  behind it, that being the only seat it means anything to.
- ***Add contact*** — will you be my contact? Accepting writes the contacts
  row and the pair's own channel, and **leaves them a guest of this one**. It
  used to carry the membership with it, so answering this was answering both.
- ***Add to channel*** — an ordinary *invitation*, against the account behind
  the seat, offered once they are a contact. **This is where the seat ends**:
  you stop being a guest at the moment you become a member.

**Stopping at the second rung is the common case rather than a conversion that
failed.** A guest without a membership is what a guest link is for.

## Help

The screen for asking The Floor a question, on Home's *Support* tab beside
*chip in*. You write a question, it is stored, a person reads it and writes an
answer into the same place, and the answer appears under the question the next
time you open the screen.

**It is a question box and not a chat**, which is the distinction the word has
to carry: there is one question, one answer, and no reply to the reply. What
wants a conversation wants the email address on the support page instead.

**"Help" and "support" point in opposite directions here, and both words are
in use.** *Help* is getting an answer; *support* — as in *chip in* and the
Support section of Home — is giving money. The server keeps the same split:
`/help` is the questions, `/donations` is the money, and `/support` is the
public page App Store Connect requires. The two are neighbours on the screen
and are otherwise unrelated.

An **unanswered** question is a state the screen says out loud rather than
hides. Nothing promises when an answer will come, because nothing can.

## Home

**The screen the app opens on, and the frame everything else on it sits in.**
Not a list: it holds two of them — *Channels* and *Contacts* — and the
*Support* tab, with a switch between the three, and above that the room you
are present in if there is one. Settings is Home's rather than either list's,
being about the application rather than about anybody you can reach; *Chip in*,
*Help* and the *Leaderboard* were Home's on the same grounds and are now the
Support tab's.

**Home has no address**, which follows from the same fact and took until
2026-09-04 to reach the code. Each of its tabs has one — `/channels`,
`/contacts`, `/support` — and Home is the frame around them, so there is
nothing left for a further address to name: whenever nothing is open, one of
the three is what is showing. The `Screen` type called the pair `home` and `contacts` until then,
which was the root-and-child asymmetry surviving one layer up from the boolean
it had already been renamed out of.

**A channel's header names it**, since 2026-09-12: the way off that screen is
a house labelled *Home* rather than the cross every other header draws. See
*Close*.

**It named the channel list until 2026-09-01**, when the two lists became peers
inside it; passages elsewhere that say "Home" for a list of channels are from
before that. Above the width breakpoint Home is the *list* pane and never goes
away, which is what lets *Close* mean one thing in both layouts. See
decisions/ § *The tier above both lists*.

## Invitation

An ask to join a channel, from whoever actually asked rather than from whoever
created the channel. It outlives the moment it was sent, so a card says how
many people are in the channel now rather than claiming somebody is still
waiting.

## Invitation email

**The message that goes out when a *contact request* names an address with no
account**, carrying the sender's *invite link* when they have a username and
the door into the web app when they do not. Not an *invitation* in the sense
above: that one asks somebody into a channel and reaches a person who is
already here, where this one reaches somebody who is not, and is the only thing
in the application that spends money on a stranger.

Which is why it is the only ask with a price on it. **Twenty per sender per
twenty-four hours** — `INVITE_MAX_SENDS` — counted at the attempt and never
refunded, so withdrawing the request does not buy the quota back. A request to
an address that *does* have an account is a push notification rather than a
message, costs nothing, and is not counted.

## Invite link

**A link that makes whoever opens it a *contact* of whoever sent it**, once
they are signed in. `/i/<username>/<pin>`: the *username* says whose it is and
is not secret, and the *invite pin* is what makes it worth anything.

Not a *guest link*, and the two are worth keeping apart. A guest link opens one
*channel* to anybody holding it, without an account, until the room empties; an
invite link opens a *relationship*, needs an account at the far end, and is
spent by the first person to use it. One is a door to a room and the other is
an introduction.

It is sent two ways: copied from the Contacts tab and handed over however you
like, or carried in the invitation email that goes to an address with no
account. An account with no username has neither, since there is no link to
write.

## Invite pin

**The six digits at the end of an invite link**, good once. Checked only
alongside the username beside it, so guessing means guessing at one named
account rather than at every outstanding invitation; wrong guesses are counted
against that account and stop being answered. It expires with the invitation
that carries it, thirty days.

Spent rather than deleted when used, which is what lets a second visit be told
the invitation has already been used rather than that it never existed.

## Knock

What arrives when somebody follows a *guest link*: a named person at the door,
shown to everybody present, settled by one member answering. It buzzes the
phones of people in the room, since a knock is a question addressed to whoever
is in the channel rather than to whoever has the screen open.

## Labs

**A setting on Home that decides whether the unfinished parts of the app exist
for you.** Off for everybody until they turn it on, and it belongs to the
account rather than to the phone. One thing is behind it today: *transcripts*.
The *watch party* was the other and left on 2026-09-18, which is what graduating
looks like — see
planning/decisions/2026-09-18-the-watch-party-comes-out-of-labs.md.

It is a gate, not a preference: with it off the section is not on the screen at
all — no greyed buttons, no empty cards. And it is only about you: a member of
your channel who has turned it on can transcribe a recording you cannot read.
See `labs` in core/settings.ts.

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
thing and is not what the Home section means. **In prose that thing is *the
channel one is present in***, settled 2026-09-08; the code has not caught up.

## Lock screen card

The one piece of this interface that renders outside the app. An ActivityKit
Live Activity, up for as long as this device is standing in a channel and in
touch with it, drawn by the widget extension in `app/targets/lock-screen/`.
Built 2026-09-17;
`decisions/2026-09-17-the-lock-screen-carries-two-controls.md` is the entry.

**That sentence used to say *exactly as long as*, and it was not true twice
over.** An activity outlives the process that started it, so a force-quit or a
crash left a card describing a room the server had since stepped the account
out of; and the last snapshot stops being evidence when nothing is arriving, so
a phone that lost the network went on asserting a presence the grace had run
out on. Neither is the hook's doing — it takes the card down the moment there
is no channel. The card is now adopted at launch and ended when the process is
told it is going away, and `useLockScreen` takes an `inTouch` that holds it for
DISCONNECT_GRACE_MS and no longer. See
`decisions/2026-09-18-the-lock-screen-card-does-not-outlive-the-room.md`.

**Two controls, and the count is the design.** A mute button, and a way into
the channel. Nothing else was put on it, and
in particular **there is no way to claim the floor from it** — claiming means
opening a microphone, which iOS refuses to a backgrounded app, and the card
would be offering something it could not deliver. That refusal is what
`useSessionAudio` calls deferring, and the entitlement that would lift it is
Apple's PushToTalk, which this app does not hold.

**Muting is the thing that *can* be done from a locked phone**, and the reason
is worth keeping: a self-muted member still needs the microphone, so the audio
session is already `CALL` and stays there. The card changes a track, never a
category.

**Both are drawn the way the app draws them, not the way iOS would.** The mute
button is `MicIcon`'s own glyph — lucide `mic` / `mic-off`, transcribed into a
SwiftUI path beside the transcribed palette — and it carries no word at all,
the word surviving only as its accessibility label. It strikes through on *you
are not being heard*, the footer icon's meaning with its three causes, rather
than on the reducer's `selfMuted`; see *Mute (four things, one word)*, which is
the entry a reader should check before narrowing it. When the button is refused
it goes grey and **says nothing about why**.

The second control is a button reading *Open*, added 2026-09-17 alongside the
card-wide tap rather than in place of it: the tap has always been the card's
way in, and *the whole card is a button* is a convention somebody has to have
been taught. It is also what stands in for the sentence a greyed mute button
cannot carry — open the app and every reason is stated in its own place — and
STYLE.md carries that as a named exception to its rule that a disabled control
is accompanied by a reason. `decisions/2026-09-17-the-lock-screen-card-shows-its-controls.md`
is the entry.

**Not the same thing as Android's notification.** `modules/call-service` puts a
foreground-service notification on an Android lock screen, and that exists to
keep the process alive rather than to offer anything — it has no controls, and
as of this writing it still omits the channel's name, on a reason this card has
made obsolete. Neither platform has the other's.

## Marketing email

**Permission to write to somebody about the application rather than to sign
them in.** The sign-in screen's one checkbox, below the code and the display
name, clear until somebody ticks it; ticking it stamps
`accounts.marketing_email_at` with the moment.

**Asked in one place and answered in two.** The sign-in screen offers it to
somebody *signing up* — an install that has never held a session — where it
can only ever be a grant: that screen is read before anybody is identified, so
it cannot show an answer already given, and a clear box means *did not opt in
just now* rather than *no*. **Floor Settings § Email is the switch**, behind a
session and therefore able to show the answer in force, and is the only place
the permission may be withdrawn.

**Whether somebody is new is a guess, and deliberately so.**
`/auth/request-code` answers identically whether or not an address has an
account, so that sign-in cannot be used to ask which addresses exist — which
means nothing at the door can know. What the app keeps instead is **the address
that last signed in on this install**, and the box is drawn unless the one
being typed is it. So a phone that has held somebody else's account still
offers the opt-in to the next person to sign up on it.

It is wrong in one direction, and cheaply: a second device has no record and
asks again, which takes nothing away — the box is a grant and never a
withdrawal, so ticking it twice keeps the first date and leaving it clear
changes nothing. **It is also the only thing this app stores on a device that
names a person**, in the keychain on a phone and in `localStorage` in a
browser, and *Forget this phone* is what clears it. See `LAST_IDENTIFIER_KEY`.

The date rather than a 1, on the reasoning the four `tried_` columns are
stamps. Granting again while it holds keeps the original date; withdrawing
clears it, so a later yes is a new grant with a new one. Erasing the account
clears it along with everything else.

**Nothing sends this mail yet**, and the withdrawal that exists is the in-app
switch rather than a link on a message nobody has sent. See
`planning/backlog/marketing-email-has-no-unsubscribe-link.md`.

## Member

**A user with an account who belongs to a channel.** The word the guest-facing
half of the app uses, because *participant* means nothing to somebody who has
just followed a link: a guest's screen labels everybody else as either a member
or a guest.

Since 2026-09-02 it is said to signed-in readers too, in one place: the contact
screen heads somebody who is in a channel with you and is not your contact as a
*channel member*. Same meaning, and it is the reason that header can say
something true without claiming a contact. See *contact*.

Inside the codebase the same people are *participants*. The two are the same
set; which word is used says who is being spoken to. See *participant*.

**Since 2026-09-14 it is also the first *channel tab*'s name**, where it is
read more loosely than this entry defines it: that tab draws guests and knocks
beside the members. The word is doing signage there rather than picking out a
set, and a guard that must distinguish the two still asks `isParticipant`. See
*channel tabs*.

## Nearby / Stepped out

The two things a roster card says about somebody who is not here.

**Stepped out** — they left, deliberately, and the card says how long ago.
**Nearby** — within reach, one notification away: ping rather than give up. It
is shown for fifteen minutes (`WAITING_WINDOW_MS`) and then reads as *Stepped
out* like anything else.

The distinction is one bit, and it is the difference between telling somebody
to give up on a person and telling them to ping.

**Declaring it is an arriving, since 2026-09-12.** Tapping *Be nearby* is
treated as stepping in and tapping it immediately afterwards, which is what it
would take to produce the same state by hand. Two things follow, and they are
the whole of the change. The people who are not there are **notified**, by the
same announcement a step in sends and under the same per-recipient window —
worded *Alice is nearby* rather than *Alice stepped in*, that being the half of
the equivalence their roster will agree with. And **`lastPresentAt` is stamped**,
so once the wait lapses the card reads *stepped out* from the moment of the tap
rather than from whenever they were last actually in the room — which, for
somebody who has never been in it, was nothing at all.

What does not follow: the declaration still claims no audio and subscribes to
nothing, is still not `present`, still does not appear in `everPresent`, and is
still not exclusive — you may be nearby in several channels at once, where you
can be present in only one, and since 2026-09-12 being present in one while
nearby in another is the ordinary state of somebody who has moved rather than a
snapshot that has not caught up. **Five at once is the limit**, from the same
day: a sixth steps you out of the oldest, first in first out. That is a limit on
the screen rather than on the state — each one pins a bar on Home, and enough of
them push the channel and contact lists off the bottom of the phone.
`MAX_NEARBY_CHANNELS`, enforced by `capNearby` in `server/src/channels.ts`,
since the reducer sees one channel at a time and this is a fact about a person
across all of them. And a declaration into a channel **nobody has ever
been present in** announces nothing: the notification for that is an
invitation, which is a month-long statement about membership sent once in a
channel's life, and *Alice stepped in* would be false about a room the
recipient has never heard of. See
`decisions/2026-09-12-a-declaration-is-an-arrival.md`.

**Two clocks, and the state decides which**, corrected 2026-09-09 the same day
one clock was adopted. *Nearby* counts attention: the time since they were last
attending *this channel*, which is the evidence for the claim that line makes —
a notification will find them. *Stepped out* counts presence: the time since
they were last in this room, which is the claim that line makes and the one
attention cannot support. Somebody who left an hour ago and is holding their
phone now is *nearby 2s*, and if the wait has lapsed, *stepped out an hour ago*.

**They coincide when a rung was lost to a timeout**, which is the common case
and is what made one clock look sufficient. It is not: a person can attend a
channel they have never entered, and did — the reading that caught it was a
member opening an invitation for the first time and being told they had been
*away 4s*, having been nowhere.

The attention half is server-held, one stamp per person per channel, fed by a
report the client sends when the app is frontmost or a hand is on it; the tick
reads it and ends both states. Ending a state and timing it are separate jobs,
and only the first is one clock's.

**Per channel and not per person**, because the same person is stepped out of
different rooms at different times and that difference is most of what a roster
carries. A device names what it is attending: the channel on screen, and the
channel it is standing in — so reading Home holds the conversation you are in,
and a declaration in a room you are not looking at ages as it always did. So
the roster says *nearby 20s* — whether a notification will find them — and
*stepped out 4 minutes ago*, which is when they last left this room.

**Three clocks preceded it inside a single day**, which is worth knowing only
because the words still exist in the code: `lastPresentAt`, the last sign of
life in a channel, which orders Home and is what *stepped out* counts;
`declaredNearbyAt`, the moment a declaration was made, kept as the auto/manual
bit and no longer a clock; and a private client-side attention clock that
nobody but its own client could see. They disagreed at every seam — a
declaration timed from an older silence, a footer lit *Nearby* over a roster
reading *Stepped out*, a card nobody could refresh without stepping in or out.

**Talking is not attending, and this is the sharp edge.** Neither your voice
nor anybody else's refreshes the clock: the person being talked at may have
walked away, and the phone in their pocket hears the voice perfectly well. What
protects a silent listener from the window is *subscribeable* — whether there
was anything in the room to listen to — so presence ends only when somebody is
both inattentive and alone.

**Nearby has four ways in, and since 2026-09-08 two of them are declared.**
It used to be only something that happened *to* somebody.

- **Declared** — *be nearby*, from outside a channel.
- **Declared** — *be nearby*, from inside one, which abandons the claim on the
  audio system.
- **Inferred** — present, and the connection ran out of grace before the
  attention clock expired.
- **Implied** — you stepped into another channel, since 2026-09-12. Presence is
  exclusive, so entering one room removes you from every other; the rung that
  removal drops you to is this one and not *Stepped out*, which means somebody
  left deliberately and tells the room to give up on them. Nobody chose to
  leave the room they are taken out of here, and the act that took them out is
  the strongest evidence there is that they are holding their phone. It
  announces nothing — a declaration announces because it is an arrival, and
  this is a departure. See
  `decisions/2026-09-12-moving-rooms-leaves-you-nearby.md`.

**One name for the two declarations, since 2026-09-09**, because they are one
action — `DECLARE_NEARBY`, whose internal branch is the whole of the difference
between them. They were *step in nearby* from outside and *nearby* from inside,
which was two names for one act and read as two mechanics.

**And there is a way out of it, from the same day.** *Step out* while nearby
ends the declaration and puts the card back to *Stepped out* — an ordinary
`STEP_OUT`, which until then did nothing at all for somebody who was not
present, leaving *Nearby* as a rung you could only leave by stepping in or by
waiting fifteen minutes. So the three states are a ladder — **in, nearby,
out** — and every screen that offers any of them offers the two moves off the
rung you are on, in that order. See
`decisions/2026-09-09-presence-is-a-ladder.md`.

**Nearby never enters a room by itself.** When somebody steps into a channel a
declared-nearby phone is standing in, it **says so and does nothing** — one
muted line under the roster, *Dana Chu just stepped in.*, `nearbyArrival` in
the code. The way in is the *In* rung, like every other act on that screen.

**It was a card with *Step in* and *Stay nearby* between 2026-09-08 and
2026-09-15**, and those two names are retired: the buttons were the footer's
rung and a control that only put the card away, and four of the card's five
parts were said elsewhere on the same screen at the same moment. **The one
word that survived is *just*** — the roster gives a clock to your own row and
not to anybody else's, so *Present* alone cannot tell a second ago from an
hour ago. See `decisions/2026-09-15-the-arrival-is-a-line.md`.

**Nothing about the arrival is answered, then.** The line is filtered against
the roster rather than dismissed or expired, so it goes when the person who
arrived leaves. Promotion, where the phone stepped itself in, was built and
removed on 2026-09-08 without ever running on a device; see
`decisions/2026-09-08-the-arrival-is-offered.md`.

**Nothing else about it changed, and that is the point.** It is not kept alive,
it lapses to *Stepped out* after the same window, and it is carried by the same
`waiting` field — so every build that predates the declaration renders one
correctly, with a ping. The two new ways in were behind `labs` until
2026-09-09, when the ladder above gave them a shape worth shipping.

**One clock ends all three, and since 2026-09-09 it is attention** rather than
the last sign of life or the moment anything was declared: fifteen minutes
without evidence that somebody is at this channel and the wait is over, however
they got onto the rung. `ATTENTION_WINDOW_MS = WAITING_WINDOW_MS` in
`core/constants.ts`, read by the server's tick. `Exit` in `core/channel.ts` is
still what leaves `lastPresentAt` alone for the two kinds a clock produces —
since 2026-09-12 a tap and a declaration both stamp it, and a lost connection
and an expired attention window still do not. That stamp is what *stepped out*
counts, and it is a different question from this one.

**And tapping the lit rung restarts that clock, since 2026-09-13.** *Nearby*
is the one control on the footer that does anything while it is the rung you
are standing on — the other two are places, and this is a claim with a clock
on it. It was an early return in `DECLARE_NEARBY` that handed the same state
back, which refused the renewal somebody asks for from the screen that draws
the number: nearby, card reading *Nearby 14m*, and no way to the fifteenth
minute except stepping off the rung and back on, which restarted it anyway.
The tap is the evidence the window is looking for, so it restamps both clocks
— the card's `declaredNearbyAt` and the server's attention stamp — and
converts a wait that began by running out of grace into a declared one. See
`decisions/2026-09-13-tapping-nearby-restarts-the-wait.md`.

**Home hoists it, since 2026-09-12.** The tier pins a bar for each channel you
are nearby in, under where it pins the channel you are present in and never
beside it — a paler hue of its own, a hollow dot, and *Nearby · 2 present*.
Several bars is ordinary. Pressing one opens the channel and steps in nowhere,
that being the act which ends the state. See
`decisions/2026-09-12-nearby-is-hoisted-too.md`.

**Both tiers are drawn at once**, corrected later the same day. A live bar used
to exclude every nearby bar, on the premise that presence and nearby could not
both hold of one account for long — which stopped being true when moving
between rooms started leaving you nearby in the one behind you. The one channel
that still cannot appear in both is the live one itself, `ENTER` clearing its
own wait.

**And the *other* direction: a channel nobody is in and somebody is beside is
hoisted into LIVE**, from the same day. *Nobody present* used to mean *nothing
happening*, so such a room sorted down among the ones nobody had opened in a
week — when it is the most answerable thing on the screen, one step in from
being a conversation with people who have already said they can be reached.
The row reads *2 nearby*; ordinary idleness is the wrong measure for it, since
what would be worth reporting has not happened yet. `nearbyCount` on the wire,
`isLive` in `ui/ChannelsView`, and the reader is left out of the count.

**A declared nearby holds no audio session and no media subscription**, which
is what distinguishes it from being stepped in and muted. A muted person hears
the room and is an occupant; a nearby person hears nothing, claims nothing, and
is not. Muting is about what you send; being nearby is about whether you are in
the room at all. See *step in*.

A browser can produce either, and which one is not about the browser: a tab
that outlasts its *attention* clock has stepped out, and one whose socket died
first — a phone's, backgrounded — ran out of grace and is nearby. Whichever
clock expired first is the one that describes what happened.

**A further way out exists from 2026-09-06 and reads as *Stepped out*.** A room
in which nothing is published unmuted and no media is playing for the same
fifteen minutes retires everybody in it — see `Exit` in `core/channel.ts`,
whose four rows are the whole difference between the ways of leaving. It
reads as stepped out rather than nearby deliberately: *Nearby* is the rung
above, so a person retired **for** inattention arriving there would restart the
claim that expiring was meant to end. Nobody is told to ping somebody the room
has just given up on.

## Notepad

**One sheet of text a channel keeps**, saying what the channel is for: a
reading list, a few links, the standing question everybody in it is circling.
**Plain text since 2026-09-13**, capped at `MAX_CHANNEL_DESCRIPTION_LENGTH`
and shown exactly as it was typed. It accepted five marks of Markdown until
then — bold, italic, code, strikethrough and links, parsed by an
`InlineMarkdown` that no longer exists — with a live preview under the field
saying what they would become. A sheet of paper does none of that, and the
parser, the preview and the two lines explaining which marks worked were
more apparatus than the thing they served.

**Anybody with the room may write on it**, which is `canEditChannel`: either
you are present in the channel or nobody is. The same gate the channel's
*name* keeps, and for the same reason — what a conversation says it is for is
not for somebody who is somewhere else to rewrite under the people having it.
Somebody without the room reads the same words, with a line saying to step in
and no *Edit* beside them.

**It is read before it is written on**, which is what the *Edit* is for. The
card shows the words; pressing *Edit* puts a field where they were, and *Done*
— or leaving the field, the tab or the screen — writes and puts the sheet
back. The field was the notepad until 2026-09-13: whoever had the room saw a
box of text where everybody else saw the sheet, which is the wrong way round
for a thing read far more often than it is changed.

**It is `description` in the code and on the wire**, and this is one of the
places the two vocabularies differ on purpose. It was *Description* to the user
too until 2026-09-12: a section on the channel settings screen, with what it
said drawn above the channel tabs. Three changes in a day made the word wrong.
The rendering moved onto a tab of its own beside the *clipboard*, the two being
text the channel holds at two speeds; the tab was named *Notepad*, a notepad
being a single sheet that gets written over, which is both halves; and then the
field followed the rendering, since a notepad you must leave the page to write
on is not one. Renaming the field would be a wire change for a word — see
AGENTS.md on never shipping one to a server before the client can speak it —
and there is nothing to gain by it, `description` being exactly what it holds.

**Not a list, and not a message.** *Notes* was considered and rejected for
saying the opposite: one entry per thing somebody wanted to say, kept in order,
each surviving the next. This is one surface, overwritten, with no history and
nobody's name on it. If what you want is to say something to the people in a
channel and have it stay said, that is not this and does not exist yet.

## Notification kinds — invited / arrived / accepted / pinged

**The four things this server sends to a phone**, named in
`core/notifications.ts` and composed in `server/src/push.ts`. Each name is a
word the code already used rather than a coinage, and for three of them it is
the first word of the sentence that lands on the lock screen.

- **invited** — somebody added you to a channel, whether or not it existed a
  moment ago.
- **arrived** — somebody stepped into, or declared themselves *nearby* in, a
  channel you belong to and were not in.
- **accepted** — somebody you invited took it up: followed your *invite link*,
  or accepted your contact *request*. Added 2026-09-13.
- **pinged** — somebody in a channel asked for you by name, in their own words.

**Two seams cut this set, and they do not fall in the same place**, which is
the whole reason the names are worth having. By *what stays true*: `invited`
and `accepted` announce who belongs to something and are good for a month;
`arrived` and `pinged` say come now and lapse in five minutes. By *who decided
to send it*: `pinged` alone is a sentence a person composed, which is why it
overwrites nothing, reaches an app that is already open, and is the one that
makes a sound at the default level.

**A third seam was looked for and is not there: where a tap lands.** All four
open the channel they name, and none of them steps you into it — reasoned out
one kind at a time on 2026-09-15 and arriving at one rule, which is why the
list above says nothing about it. See
`decisions/2026-09-15-a-notification-names-the-room-it-is-about.md`. *Step in*
stays a second, deliberate tap on the footer, so *opened from a notification*
is an ordinary instance of looking at a channel you are not in.

**`accepted` is the odd one and is the one to read the entry for.** The other
three are a room reporting on itself to people who belong to it. This one
answers a question its recipient has been holding with nothing to check — *has
the person I invited turned up yet* — and it is the only one whose recipient
could not have been watching a screen for it. It names a channel all the same,
because becoming contacts creates the pair's channel in the same breath, and
the three things this system keys on a channel — the recipient's level, the
collapse key, the thread — all want a real id.

## Offline

**A state, not a description of the network.** The app is *offline* when its
websocket to the server has been gone for `OFFLINE_AFTER_MS` — ten seconds —
and not before: a socket drops on every foreground and on any change of
network, and an outage that resolves itself was never worth a word. Below that
threshold the app is *disconnected*, which is ordinary and mostly invisible.

**It is about the control socket alone.** The LiveKit room is an unrelated
connection and may be perfectly healthy — STATES.md § *Audio Connected* — so
being offline does not mean the conversation has stopped. It means nothing can
be *changed*: every control in this app is a `channel.action` down the socket,
the microphone included, so *offline* and *nothing works* are the same
sentence even while you can still hear the room. The wall says so in two
different ways depending on whether the room is up, and blocks in both.

**Crossing the threshold is one event with two halves**: the queue of actions
taken during the gap is discarded, and the app declares itself offline. They
are deliberately the same moment, because the screen that goes up is the only
notice those actions ever get. Below the threshold the client retries every
second or so; above it, the old doubling backoff resumes.

`AppState.offline` in the code, reported by `Realtime` through `onOffline`,
rendered by `OfflineView`. Distinct from `ConnectionStatus`, which cycles
while retrying and is not sticky. See decisions/2026-09-16-being-offline-is-one-state.md.

## Ping

A notification sent to one person in a channel who is not there, or whose
connection has dropped, telling them somebody wants them. Rate-limited per
person per channel, so somebody who has just been pinged cannot be pinged again
immediately. You may ping a contact; being in the same channel as somebody is
not enough.

**Sent from the room or from beside it, since 2026-09-14.** The sender has to
be *present* in the channel or *nearby* in it — the two rungs of the ladder that
are still at it. Somebody who has stepped out is away, and a summons from there
calls a person to a conversation the sender is not at either; the button is not
drawn, and the server answers *Step in or be nearby to ping.*, which names the
two taps that give it back. `canPing` in `core/channel.ts` carries both halves
of the condition — the sender's standing and the target being out of earshot —
and the contact check stays on the server, which is the only layer that knows
who knows whom.

**Its words outlive the notification, on the profile card.** For as long as the
window is open, anybody in the channel who opens that person's profile sees
*Pinged.* and, where the ping carried any, what was said and who said it. The
lock screen used to hold the only copy. That makes a ping's words a small
disclosure to the room rather than a private message, which is why the sender's
name travels with them — see `ChannelView.pingedWith`.

**And since 2026-09-15 a ping is also a row**, in `pings`: who asked, who was
asked, which channel, when, whether there were words — **never the words
themselves** — and when the target next arrived inside the window it opened.
Levels 9 and 10 of MARKETING.md's funnel, the second of which that file calls
one of the three leakiest points in the whole thing. It is instrumentation and
changes nothing: `lastPingedAt` is still the only authority on whether a ping
may be sent, the record is written after it has decided, and nothing in the
application reads the table. Swept at `USAGE_RETENTION_MS` with the rest of
the meter, and described on `/privacy`. See
`decisions/2026-09-15-the-funnel-is-instrumented-where-it-leaks.md`.

## Present

**In a channel, able to hear and be heard, right now.** The thing *Step in* and
*Step out* change, and the thing a deploy costs.

**Presence is not membership.** Stepping out leaves you a member of the channel
and takes you out of `present`; only leaving the channel outright removes you
from the roster. **And presence is exclusive** — an account is present in at
most one channel at a time, and stepping into one steps you out of the last.

**Which connection, since 2026-09-08: the media room.** *Able to hear and be
heard* is publishing or subscribing — the same test the 2026-09-08 design gives
for an occupant — so presence is holding a connection to the channel's LiveKit
room, and a phone that holds none is not present however much else it is doing.
This sentence is not new; the implementation of it is. The server used to take
`ENTER` on trust and let a live **control socket** sustain it, which is a
different fact about a different connection, and the two came apart: an app
force-quit and reopened held a room it was not in, for ever, because merely
watching the channel renewed the grace period. `Channels.reconcilePresence`
asks the room instead. See
planning/decisions/2026-09-08-present-is-the-media-connection.md.

**Entering is still what creates it.** The tap is what grants a presence,
because a step-in has to move the screen without a round trip through LiveKit.
The two directions are not symmetrical, and making them so would put the
interface behind the network.

**Either connection may take one away, and neither may give one back.** The
room falsifies a presence it stops holding; the **socket** does the same, and a
grace *it* started the room may not cancel — a phone keeps its claim for as long
as it holds the audio, and the socket is what says whether it still does. So a
suspended phone the SFU goes on listing reads *Nearby* rather than *Present*.
Only a reconnecting client's own re-entry restores it. See
planning/decisions/2026-09-08-the-socket-is-what-holds-a-place.md.

**A dropped connection is still not an absence — and since 2026-09-08 the
roster stops calling it presence.** A connection that dies and returns changes
nothing, and only staying gone past the grace period ends presence; but for the
length of that grace the card reads ***Nearby*** rather than *Present ·
reconnecting…*, because a window in which somebody may come back is not a claim
that they can hear you. The ping was already offered there — presence is not
reachability — so the button was right before the word was. See
planning/decisions/2026-09-08-the-grace-is-not-a-presence.md. What changed is which
connection is asked, not how patient the answer is.

**The socket keeps the other clock.** How long ago somebody was last heard from
— `lastPresentAt`, which ages *Nearby* to *Stepped out* at fifteen minutes — is
still the websocket's, and rightly: that measures reachability, which is what
being nearby means.

**In a browser it can also end without anybody doing anything.** A tab nobody
has attended for fifteen minutes steps itself out, there being no suspended
process to infer an absence from — see *Attention*.

## Public channel, public page

A channel that has declared itself public has a page on the web, at an
address carrying the channel's id. Any member may make one, and going back is
one tap.

**Making the page is not publishing anything**, and that separation is the
whole shape of the feature. The page exists; what is on it is every recording
whose participants have each *agreed to publish* it, which is a different
decision taken a different way. A public channel with nothing on its page is
the ordinary state on the day somebody turns it on, and is not a bug.

**No member is named on it, ever.** The name, the *notepad* and the
recordings, and nothing else — the task entry this was built from is explicit
that members stay private though they may be described in the description, so
the only words about who these people are are words they wrote. The episode
titles obey it too: a recording still carrying its participant-derived default
name is shown by its date instead.

The address is unguessable rather than secret, and is shared the way a *guest
link* is shared — by being handed to somebody. There is no directory, and
nothing here is listed in Apple's or anybody's.

See also *published*, *feed*, and publication.ts.

## Published

A *recording* anybody holding the *public page*'s address can listen to,
through the page or through the *feed*.

**It goes up when every *participant* has *agreed to publish* it, and not
before.** No member can publish a recording on their own; that is the point,
not a limitation. Every other act on a shared recording — renaming, deleting,
transcribing — shows it to people who could already reach it, and any member
may. Publishing shows everybody's voice to anybody at all.

**Coming down is not the opposite of going up, and the interface says so in
those words.** Any one participant may take their agreement back at any
moment, with no appeal to the others, and that removes the recording from the
page and the feed at once. It does not reach a copy a subscriber's podcast app
has already downloaded, and nothing in this system ever will. Publishing is
the first act here that a later act cannot undo.

Deleting the recording takes it down too, immediately — a week before the
sweep removes the audio, so no subscriber meets a dead link. Deleting your
account withdraws your agreement, which is the same act performed on the way
out.

## Agree to publish

One person's consent that one recording may be *published*. The control is a
checkbox on the recording's own card, and the line under it says who is still
outstanding.

**Per recording, never per channel.** Agreeing to publish last Tuesday's
conversation says nothing whatever about this one, and a standing permission
would quietly turn one judgement into every future judgement.

**A *guest* is asked too, where there is anybody to ask.** The rule turns on
whose voice would be broadcast, not on the word *guest*, so it asks two things:

- **Did they speak?** A guest who sat in the room and never opened their
  microphone is on the recording's roster and in none of its audio. Nothing of
  theirs would be published, so they are not asked and they stop nothing.
- **Do they have an account?** A guest is somebody holding a seat in a channel
  they are not a member of, *with or without an account here*. One who signed
  in before knocking is reachable, so they are asked exactly like a member and
  may withdraw exactly like one — the only place in this app where somebody who
  is not a member has a say over a channel's recording, and it is their own
  voice they have it over.

What is left is a guest who spoke and has no account. There is genuinely nobody
to ask, so that recording cannot be published at all. The alternatives were
dropping their audio, which changes what the conversation was, and asking the
members on their behalf, which is exactly the standing unanimity denies. The
fix is a guest link that says so before somebody uses it, which is outstanding.

## Feed

The *public page*'s machine-readable half: an RSS feed at the page's address
plus `/feed.xml`, carrying the same *episodes* the page lists.

It is what a podcast app subscribes to, and it is unlisted — pasted into an
app by somebody who was given the address, rather than found in a directory.
Artwork, an iTunes category and submission to Apple or Spotify are what a
*listed* podcast would additionally need; none of them is needed to hear an
episode, and each adds a review cycle rather than a capability.

`pubDate` is when the conversation happened, not when it was published, so
backfilling a year of them lands each where it belongs rather than presenting
all of them as today's news.

## Episode

A *published* recording as a listener meets it.

The audio is the same floor-gated mix the app plays — the one
`buildStemGraph` produced, with every speaker silenced across every window in
which they held no floor — re-encoded as M4A. The re-encode is a transcode of
that finished file and never a fresh render from the stems, because the floor
is applied in exactly one place and a second place it could be got wrong is a
place remarks somebody was silenced for get broadcast to the world.

M4A rather than the Ogg/Opus everything else here uses: Opus-in-Ogg is on
neither Apple's list nor most clients', and a feed that works for some
subscribers and not others is worse than one that fails outright.

## Record automatically

A channel setting, in Channel Settings, off until somebody in the room turns it
on. On, a *recording* begins by itself as soon as the room has anything to
capture — which is exactly when *Record* stops being greyed out, and is the
same condition, deliberately, so that nothing is recorded automatically that
could not have been recorded by hand.

**It waited for a second person until 2026-09-14** and now does not, having
widened with the guard rather than by a decision of its own. Stepping into an
auto-recording channel by yourself, with your microphone open, starts a run
there and then. Note what that costs before turning it on: an *egress* opens
for a lone speaker, billed per speaker per minute, and the room's turn is spent
on a recording of one person — the turn coming back only once everybody has
left and come back. See *Capturable*.

**It decides how a recording begins and nothing else.** Pause, resume and stop
are what they always were, and stopping is final: the room gets one automatic
recording, and the next one comes when everybody has left the channel and come
back. Without that the Stop button would appear not to work — the state returns
to idle, and a rule written as "record when you can" would start another at
once.

It belongs to the channel rather than to the person, like the name and the
*notepad*, and any *member* with the room may change it. The latch that
spends the room's turn belongs to the server and to this process: a restart
empties every room, so the setting survives one and the turn comes back with
it. `autoRecord` in `core/types.ts` and `autoRecordStarter` in
`core/channel.ts` are the whole of the rule.

## Recording

Audio kept from a channel, started and stopped by anybody present — and
paused and resumed by them too, the transport being one act split four ways.
*Present* is the operative word and is the whole of who may touch it: somebody
who has stepped out is outside the conversation being recorded, and until
2026-09-12 only the starting half of this sentence was enforced. A recording
belongs to the channel, is named when it stops, and carries the same name for
everybody who was in it. A recording in progress is announced continuously to
everybody in the room, guests included.

**One person alone may record, and this reversed twice.** It was allowed until
2026-09-07, refused until 2026-09-14, and is allowed again — the refusal having
rested on a mechanical argument that the next day's audio redesign retired, and
on a claim that nothing happens in a room of one which the same rule then
contradicted by exempting a room of one with a track playing. What is asked
instead is *Capturable*: not how many people are here, but whether anything
would land in the file.

A recording that has just stopped is **mixing** for a few seconds before it can
be played or shared — its card appears immediately, with those two actions
disabled, rather than being withheld with nothing to explain the gap.

## Seat

A guest's standing in a channel: a place they may go back to for as long as it
lasts, rather than a membership. It appears on Home as a smaller card that
opens the guest page, and it expires on its own if unused.

**A seat may exist before anybody has sat in it**, since 2026-09-21: that is
what a *guest invitation* is, and it is the one kind whose holder has never been
in the room. Home draws those as invitations rather than as seats, because a
place to go *back* to is what a seat card means and there is no back yet.

Distinct from *membership* in almost every way that matters — a seat has no
roster, no recordings and no history of the channel, only when it was admitted.
Distinct also from being *present*: a seat outlives the visit, which is what
lets a guest come back. **And distinct from having an account**, which a seat
may or may not have behind it; the two are what *guest* used to run together.

**A seat ends in one of two directions.** Downwards, when it is ejected,
expires, or goes with the last member out. Upwards, when the account behind it
is asked into the channel — one person holding a seat and a membership in one
channel would be two people to the roster, the stems and the usage spans, so
*add to channel* closes it.

## Self-mute

A microphone closed by hand rather than by the *floor*. It is separate from the
floor and costs nothing — it never affects whether somebody may claim, and a
claim does not change it.

Stepping out clears it; losing your connection does not. A phone that dropped
out for a minute must not come back with a live microphone its owner had
deliberately closed.

**It is a statement about transmission, not about being here.** Being muted
must not cost you presence — you are still in the room, still listening, still
somebody others can talk to. Three other things in the code are also called
"mute" and only this one is a person's; *mute* in Part Two separates them.

**Since 2026-09-07 it is not necessarily your own hand — but only in one
direction.** Anybody present in a channel may *close* the microphone of anybody
else in it, from that person's profile: the favour among people who invited
each other into a room, when a dog is barking or somebody has walked away from
a live microphone. **Nobody can open anybody's but their own.** That asymmetry
is the design rather than a limit on it — the feature can never make a person
louder than they chose to be, and the remedy for being muted is always in the
muted person's own hand.

Three further clauses: a guest can be the object of it and cannot perform it,
nobody can mute the floor-holder, and nobody can mute somebody who has unmuted
themselves in the last minute — that last being what stops the favour becoming
a loop, where a person unmutes to speak and is shut again each time.
`canMuteOther` is the whole policy and argues each clause; `canSetSelfMute` is
the self case, goes both ways, and is unchanged.

**So the name is now narrower than the thing, deliberately, and this is the
disagreement to know about.** *Self* was accurate when the only hand was your
own. It survives because `selfMuted` is a field of `ChannelState`, which goes
over the wire in every channel snapshot: renaming it is a wire change, owed the
two-step every wire change is owed, for a word rather than a behaviour. Read it
as "muted by hand" and it is right; read it as "only by yourself" and it is a
year out of date.

## Share

Handing a copy of something to whatever else is on the device: a *recording*, a
*transcript*, or the track the channel is listening to. One verb, three
buttons, all three labelled `Share` — and on a phone all three end at the
system share sheet.

**It was called *Export* until 2026-09-12**, which said what the file did and
not what the person was doing with it. Nothing about the mechanism changed with
the name; the route is still `GET /recordings/:id/export`, because a wire name
is not a word anybody reads and renaming one costs a two-step.

**It is a read, and that is the whole of the rule.** Sharing changes nothing
anybody else can see or hear, so none of the things that govern *changing* a
channel govern it: not the *floor*, not presence, not `manageable`. A member
may take a copy of a recording while two other people are mid-conversation in
the channel it was made in, and may take a copy of the track while somebody
else holds the floor and decides what plays. What is greyed out on those cards
stays a statement about what would change the room.

**A track is the odd one of the three.** A recording and a transcript are
artefacts this project produced in formats it chose; a track is whatever file
somebody picked on their phone, so its name and its type come back from the
server rather than being known by the client. See `shareTrack`.

**On the web there is no share sheet, so a share is a download** — the file
lands in the browser's downloads folder and the person does the rest.
`app/src/api/download.web.ts` carries why it cannot be a plain link.

## Step in / Step out

Entering and leaving a conversation without leaving the channel. See *present*.
The verbs are deliberately not *join* and *leave* — *Leave the channel* is a
different, larger action that gives up membership, and the channel disappears
from Home when you take it.

**Stepping in is a claim on the audio system, since 2026-09-08, and that is
what the word now means.** The phone takes `playAndRecord` immediately and
**exclusively**: the microphone opens before anybody has arrived, another app's
audio stops, and a Bluetooth headset goes to the mono hands-free profile — for
as long as the visit lasts, whether or not anybody else is there and whether or
not anybody is speaking. The point of standing in a room is to hear somebody
the moment they speak, and a voice mixed under a podcast is a voice you have to
attend to rather than one you simply hear.

**The escape hatch is *nearby***, which claims nothing at all. The two are the
two ways of being in a room and the difference between them is exactly whether
you claim the audio system. See *Nearby / Stepped out*.

**So *Step out* names two acts, and one word is right for both**: leaving the
room, and ending a declaration of nearby. Both land you on the same rung —
*Stepped out* — which is what the word says. Since 2026-09-09 every card that
offers either offers whichever of *Step in*, *Be nearby* and *Step out* are the
two moves off the rung you are on, in that order.

**The footer names the rungs instead, and is the one place that does.** Its
three slots are *In*, *Nearby* and *Out* — the same ladder, said as states
rather than as acts, because the slot you are on is lit and a lit word naming
an act would be naming one you cannot perform. They are short forms and not new
terms: a roster card still says *Present* and *Stepped out* about other people,
and at 11pt in a fifth of a phone those truncate. See
`decisions/2026-09-09-presence-is-a-ladder.md`.

**A session is held if and only if the phone is stepped in.** Nearby, stepped
out and not in a room are one audio state, and it is *none*.

**Neither verb is about navigation, and since 2026-09-21 neither is about the
screen either.** The screen and the room are two things at both doors, for
everybody: a tap opens the screen without entering, and stepping out gives up
the room and leaves you looking at the channel. *Home* in the header is what
takes you off the screen.

This was a setting — *Tap a channel to look, not step in* — from 2026-08-31,
and the screen followed it symmetrically from 2026-09-08: for somebody whose
tap stepped in, stepping out closed the screen, because arriving at the screen
had been the step in and there was nothing left to look at. The setting and its
column went on 2026-09-21 and the looking half became the only half. See
`decisions/2026-09-21-a-tap-only-ever-looks.md`.

## Support tab

**Home's third tab, after the two lists**, and the one thing on the tier that
is about the application rather than about anybody you can reach. It holds
*Help* — always — and, when each is available, *Chip in*, the *Leaderboard*
and the audio bench. `/support` in a browser.

**It is not a list, and the type that names it still says `List`.** What that
type chooses between is which body the tier is showing, which is the same
question whether the body enumerates people or not.

**All of it was the tail of whichever list was showing until 2026-09-12.**
That was the right container — these rows had been promoted out of the channel
list on 2026-09-01, when they stopped being at the bottom of somebody's
channels by accident — and the wrong place in it: a row about the application
still waited out every channel or contact somebody had, and did it twice, once
under each list. A tab is one tap from either, and pushes neither down.

**Both senses of the word are here and are two sections, not one.** *Support*
the section means support this project — money; *Help* means get support. The
tab's own label is the first sense, which is why Help is the section above it
rather than a row inside it.

## Transcript

Behind *Labs*, since 2026-09-06: without it, a recording shows no transcript
and no way to ask for one.

Text made from a recording, on request, by a third-party provider named on the
screen that asks. Everybody gets one free; asking sends everybody's audio out,
so who asked is always shown.

A transcript is never edited. What can be said about it — renaming a *voice*,
dropping one — is a *declaration* laid over the text, so getting it wrong costs
a tap rather than a second paid run.

## Username

**A name for somebody, unique across everybody, written with an `@`.** Letters,
digits and underscores only, four to thirty of them; `core/username.ts` is the
rule.

**Chosen, or derived from the display name at signup** — the second since
2026-09-12, so a new account has one without asking: *Anna Kowalski* gives
`@anna_kowalski`, lowercase where the name above it is capitalised, numbered
when somebody already holds it. It is a suggestion and nothing more, editable on
the Contact screen and given up by clearing the field, and only a new account
gets one: renaming yourself later leaves the handle alone, since by then
somebody may be holding the *invite link* built out of it. Accounts predating
this, and anybody who has cleared the field, have none — so nothing may assume
a username exists. `core/derivedNames.ts` is the derivation.

**It is not the name anybody is called by.** That is the *display name*, which
is what appears in every roster, invitation and recording, need not be unique,
and can hold anything a keyboard produces. A username is the opposite of all
three: one owner, ASCII, and shown on one screen. Two spellings differing only
in case are one username, and only the first person to ask gets it — but what
is drawn is the case its owner typed.

**One thing reads it.** As of 2026-09-06 it is displayed on a profile and is
the first half of an *invite link* — still no search, no mention and no
sign-in. The distinction that matters is that the link carries a name somebody
was *handed*; nothing anywhere looks a username up, and a screen that appears
to reach somebody by typing one is a screen doing something this word does not
mean.

## Voice

One speaker within a transcript. Usually one voice per person, since each
person's audio was captured separately — see *stem* in Part Two — so a voice
label is only ever drawn where the provider heard more than one voice in audio
this system assumed was one.

## Watch party

Behind *Labs* from 2026-09-06 to 2026-09-18, on the starting side only —
anybody in a channel could always stop, pause and seek a party already running,
whoever started it. It is behind nothing now: the tab is on every channel
screen and anybody in the room can begin one. See
planning/decisions/2026-09-18-the-watch-party-comes-out-of-labs.md.

A YouTube video everybody watches on their own screens, in step. Nothing about
it is fetched, published, recorded or stored here: it is a link, and each
device plays it.

**It is a mode the channel is in rather than a thing it is carrying**, and
since 2026-09-18 an exclusive one. While a film is loaded — playing or paused
— no *floor* may be claimed and no recording begun. The reasons differ and the
answer does not: a recording beside a party would be missing the thing
everybody was reacting to, and a claim is a demand that the room be quiet,
which *mute the room* already does for a film with a control that belongs to
the film. Stopping the party lifts both at once.

**Against the shared track the exclusivity is between the two transports
rather than the two loads, since 2026-09-20.** Both may be loaded at once;
neither may *play* while the other is playing. So the audio player's controls
grey while a film is running and come back the moment it is paused, the
film's do the same against a track that is playing, and the way out of either
is pausing rather than stopping or clearing. Starting a party no longer clears
a loaded track, and loading a track has not ended a party since 2026-09-18 —
the replacement that once ran both ways now runs neither. The rule it replaced
greyed a whole card for anybody who had paused a film, and explained it with a
sentence about the floor.

**Mute the room** withholds every microphone *while the video is playing*, and
pausing gives them all back — you pause a film to talk about it. It writes
nobody's *self-mute*, and it is not the *floor*: it withholds everybody and
confers nothing.

**Since 2026-09-17 the film plays inside the app**, on whichever device you
choose — a WebView on a phone, an iframe on the web. It is still YouTube's own
player, unmodified and unobscured, and The Floor still carries no video.

**And since 2026-09-19 it does not live on the *Watch* tab**, only on the
device that is showing it: the picture is pinned under the tabs there and is a
small draggable rectangle in the corner of the other five. It was a child of
that tab's card until then, so somebody stepping into a room with a film
running — landing on *Members*, as everybody does — saw nothing, heard
nothing, and was reported to the room as watching. See *the picture* below and
decisions/2026-09-19-the-film-is-not-a-tab.md.

**The video's own controls are off**, and have been since 2026-09-18:
`controls: 0`, with `disablekb` beside it. The picture is not a control. The
transport is the app's own row — Play, ±15s, and a progress bar that seeks
where it is tapped — and the frame answers no finger at all, a refused video
excepted, where the only thing left in it is YouTube's own explanation and the
way out it offers.

The bar was the party's controls for two days and never once worked for a
whole one; *intent* carries the account. Anybody *present* may drive, no claim
being possible while a film is on — presence rather than occupation since
2026-09-20, so that no control here moves a film for somebody standing outside
the room it is being watched in. The cost of the bar going is dragging
to a point in a film, which the progress bar took over.

**Full screen is the app's layout, for the same reason.** The player's
full-screen button was on the bar that went, the IFrame API offers no method
for one, and the browser's `requestFullscreen` is unreachable inside a
`WKWebView` nobody has enabled it on — so expanding the picture is something
the app does to its own layout, and nothing is asked of the player. It happens
only on the device actually showing the film, since a phone that handed the
picture to the laptop has nothing to expand; it is ungated by the *floor*, how
big a film is on somebody's phone being nobody else's business; and it is not
in any snapshot, so nobody else's screen changes with yours.

**There are two ways in and a surface gets whichever it can perform.** *Full
screen* on the watch card is the press, everywhere. On a *handheld*, **turning
the device sideways** is the other, and turning it upright is what leaves —
the gesture every other film on that phone already answers to. *Exit full
screen* is on the scrim wherever the wrist is not: a laptop, an iPad, and a
phone held upright or lying flat.

**On a turned phone the exit button is not drawn**, deliberately. While the
phone is sideways the state *is* the window — *turned*, read at render, never
stored — so a press would set a flag the window immediately overrules and
nothing would happen. A dead control is worse than an absent one, and the
film has no controls of its own competing for the same tap.

**That pairing took three tries and the middle one is the lesson.** From
2026-09-19 the turn was the whole rule and the buttons were gone, which
stranded every surface that is landscape sitting still — a desktop browser
window, an iPad held the way iPads are held — in a state with no device to
turn out of it. The buttons came back with *handheld* drawing the line. Then
for a few hours on 2026-09-20 the buttons were the whole rule, under a
*portrait lock* that covered the entire application: a phone that may not be
sideways anywhere is a phone iOS never hands a landscape window, so the turn
was not merely unused but unreachable. Narrowing the lock to the film's own
screens is what gave it back.

**A press expires the moment the phone is turned.** Otherwise somebody who
pressed *Full screen* upright and then turned the phone would hold a press and
a turn at once, and turning back would leave the picture expanded for a
gesture that visibly should collapse it. The turn is the stronger statement.
**Portrait is still a supported way to be here**, which is what the press is
for on a phone: iOS holds the interface orientation it had when the gravity
vector stops saying anything, so a phone lying flat never turns and never
turns back.

**And the old exit bug cannot come back.** What made it one was that the
expanded state locked the phone *landscape*: exiting released the lock, an
unlocked phone goes back to the way it is being held, and a press of the exit
while sideways handed back the channel screen sideways with nothing to say
otherwise with. Nothing is pinned to landscape now: leaving the film at all —
a tab, a stopped party, a refusal — locks portrait, which is a rotation
*towards* what the screen underneath wanted, and it arrives upright however
the phone is being held.

Besides all that are the three automatic collapses — the party stopping, the
picture moving to another device, and YouTube refusing the film — each of
which would otherwise leave somebody holding a black rectangle.

**The chrome fades, since 2026-09-19, having been built not to.** For a day
the transport and the channel's bar stayed up for the whole of a film, on the
argument that fading them would hide the only way out behind a gesture nobody
was told about. What that cost was the point of the state: the two together
took about a fifth of a sideways phone, and a 16:9 film fitted into the rest
falls well short of the glass. What is left on the scrim fades after three
seconds of nothing being pressed and comes back at a touch anywhere — the
gesture every other player on the phone has already taught — and it starts up
rather than down, so it is seen before it goes. The film is fitted, never cropped: what
is left at the sides is the film's own letterbox. Expanding and collapsing each rebuild the
player, so the film reloads and the follower drives it back to where everybody
is; the cost is a few seconds of black for the one person who turned the phone.

## Screen

**The app instance showing a party's film.** Any instance of your own account,
on any device you are signed in on — a role an instance takes, never a place to
be. A screen does not *step in*, so it neither displaces the device holding
your voice nor claims an audio session of its own, which is why a film on a
second device sounds best.

Chosen with one switch, *Watch on*, whose two answers are **This device** and
**Other device** — relative to the device in your hand, like the two buttons
they replaced on 2026-09-17, but a matched pair rather than a *here* and an
*another* that read as two unrelated acts and inverted their meanings as you
walked between rooms. They read *same* and *separate* until 2026-09-18: same
*as what* is a question the switch never answers, where *this* points at the
thing in your hand and *other* at everything else. Picking *other* lists your
own live instances, and only when there is more than one to choose between.

**One of the two is always chosen, and which one is the default depends on
whether you are *stepped in*.** In the room, a film comes up on the device you
are on; outside it, nothing starts and the answer is *other device*. So the
switch is how you move a picture rather than how you turn one on, and a
channel you are only reading never begins playing a film at you.

There was a third state until 2026-09-18 — neither answer chosen, for a party
sitting loaded with the film on nothing — which in practice meant starting a
watch party showed you no film until you noticed a control you had not
touched.

The default is taken **once per film**, and only while stepped in. Not an
invariant: handing the picture away clears this device's role a moment before
the server says where the film went, and a standing rule would read that gap
as *nobody is showing it* and take the film straight back. Not marked as taken
while stepped out either, so stepping in later is what it waits for.

**Leaving the room gives the role up, which is the change of 2026-09-19** —
it used to leave an existing screen where it was. The picture is mounted
wherever you are in the channel now rather than on one tab, so the tab bar has
stopped being a way to stop a film and the ladder is what is left: *nearby*
and *out* are the two answers to not wanting to watch, and both of them say so
to the room. It is the **account's** presence that decides, not the instance's,
or the laptop somebody handed the film to would lose it the moment it arrived.

**One device shows the film at a time.** Taking it here takes it off whatever
else of yours was showing it — the video moves, not merely the controls — and
the server is what enforces that, being the only thing that can see all of
somebody's devices at once. **Off every instance of the account, since
2026-09-21, and not only the ones it has a record of**: what it holds is what
each device last managed to *say*, which a dropped socket takes with it, so
filtering the eviction on it skipped exactly the devices that had drifted. See
decisions/2026-09-21-a-declaration-displaces-every-instance.md.

**Handing it over only *asks*.** The film moves when the target instance
declares itself the screen, and the eviction that follows is what takes it off
the device that asked. Until 2026-09-18 that device cleared its own role in
the same breath, which opened a window with the film on *nothing* whenever the
target was slow, backgrounded or no longer had the channel open. Waiting for
the eviction makes *exactly one* true by construction; the cost is that the
asking device goes on showing the film for a round trip, which is what is
actually the case.

**It is refused while the film is running**, and pausing is the whole of what
it asks: moving a picture between devices mid-scene means the film leaves what
you are looking at and turns up on something across the room a second later,
in the middle of a sentence, with the sound crossing after it. Refused rather
than hidden, so the answer goes on saying where the film is. The *floor* does
not govern it at any point — which of your own devices shows a film is not
what the channel is attending to.

**And refused from outside the room, since 2026-09-19.** *This device* would
otherwise be a way to start a film playing at somebody who is *nearby* or
*stepped out*, which are the two rungs that mean they do not want to watch
one. Both halves go rather than the one: with nothing of this account showing
the film, there is nothing to move and no question for the switch to answer.

**The chosen answer is the same fact on every device, said in each one's own
terms.** Hand the film to the laptop and the laptop shows *this device* while
the phone shows *other device*: both are describing where the film is. The
phone can only say so because the server pushes which channels this account's
*other* instances are showing — the picker's list is frozen at the moment of
choosing and could not answer this.

## First device / second device

**The two instances a watch party can be spread across, and they are not
interchangeable.** The **first device** holds the presence — the microphone,
the floor, the rungs, every control of the channel and every control of the
party. The **second device** is the *screen*: it holds the film and nothing
else. One person, one account, two things open.

**Neither is stored.** A second device is a screen that is not *stepped in*,
read at render — `secondDevice` in `ChannelView`. So which is which follows
from where the presence is, and the rungs are what move it: pressing *In* on
the second device takes the presence and makes it the first one.

**Since 2026-09-20 the second device draws a view of its own** rather than the
channel screen with the film docked on its sixth tab. On it: the picture, the
transport, *Full screen*, *Other device* — which hands the screen role
back and ends nothing else — and the three rungs; the header is a caption and
holds no control at all. Not on it: *Watch on*, *Stop watching*, the field that
swaps the video, the room mute, the share links, the settings gear, the
recording pill, the five tabs that are not the film, *Home*, and the channel
list `Panes` would draw beside it above `SPLIT_AT` — it claims the window the
way the expanded picture does. The principle is that **only controls about the film are on both
devices** — the first device stays the remote control, and a second copy of a
switch like *Watch on*, pointing at the device it is drawn on, is that remote
control being in two places at once.

**The rungs are the exception, and mechanically rather than tastefully.** They
are the only way out of the state: *In* takes the presence, *Nearby* and *Out*
leave and so give up the screen role and stop the film. The switch that sent
the film here is on the other device, so without them the second device is a
picture that cannot be put down. **They are not the only way off it.** *Home* lasted
a single afternoon — a television is exactly an application that cannot be used
for anything else until somebody stops watching, and the account is holding the
other device, where every way into the rest of the app already is — and what
replaced it is *Other device*, beneath *Full screen*: the film paused, the
screen role handed to whichever of the account's devices is standing in the
channel — asked for by description rather than chosen from a list, since the
picker cannot say which device the person is on — and nothing said to the room
at all. It read *Not on this device* until 2026-09-20 — the *Watch on* answer
said in the negative, where it is now simply that answer, said from the
television. All
three rungs change your standing in the channel; that one does not.

**A second device never draws the picture in a corner.** Leaving the television
by any route gives the screen role up, the browser's own back button included,
so the floating rectangle every other screen in the app can show is a state
this one has no version of.

**The film arriving opens the channel here, which is what makes that true of
the arrival as well as of the exit.** Being asked to be the screen subscribes
this device to the channel and puts it on that channel's screen, on the
*Watch* tab — the person who sent the film is looking at their other device
and there is no tap to come on this one. Until 2026-09-20 neither half was
written: the picture was drawn off a snapshot nothing had asked for, so a
device handed a film it did not already have open drew nothing at all, and the
channel screen it was opened on by hand gave the role straight back while the
first snapshot was still on its way. Only the server's ask counts as an
arrival — pressing *This device* opens nothing, that being the device the
person is already holding.

**A film on a second device sounds best**, which is the configuration the
design prefers: a screen does not step in, so it claims no audio session and
displaces nothing. See *screen*, which is the role, and
`decisions/2026-09-20-the-second-device-is-a-television.md`.

## The picture

**Where a party's film is drawn, on the device that is the *screen*.** Three
places and no fourth: **docked**, a pinned row under the tabs on the *Watch*
tab; **floating**, a 168pt rectangle resting in one of the four corners of the
application, dragged to any of them and tapped to go back to the controls; and
*full screen*, which is the entry above.

**It is one player throughout, which is why the word is worth having.** A
`WebView` that is reparented is rebuilt — the page reloads, the film starts
from black and the follower drives it back — so docked and floating are one
element in two styles rather than two renders in two branches of the screen.
The one exception is full screen, which replaces the screen and does mount its
own; that costs a few seconds of black to the person who turned the phone, and it is
written down where it is paid.

**Its parent is the application rather than any screen**, since 2026-09-19 and
for exactly the reason above: wherever the player is mounted is the furthest
anybody can walk without losing the film. It was mounted on the *Watch* tab
until earlier that day, and a tab bar was far enough; mounted on the channel
screen, Home was. So it hangs above the route table, and Home, the settings, a
profile and a transcript all draw underneath it. `watch/Picture.tsx`.

**Floating, it rests against a corner rather than at a remembered offset**, and
the corners are the application's — so it sits over the pinned header and the
pinned footer as readily as over a body, which is what makes it reachable on a
screen that has neither. It starts bottom-right, snaps to whichever corner's
quadrant it is let go in, and stays there for the life of the party. By
quadrant rather than by nearest corner: a phone is more than twice as tall as
the picture is wide, so a rectangle let go halfway up the left edge is nearer
where it came from than either corner on the left, and a snap measuring
distance would send it back and read as a failed drag.

**And it floats only while the film is playing**, as of 2026-09-20. The corner
is for a film that goes on running while somebody is somewhere else in the
application, which is the whole of why it followed them off the *Watch* tab;
paused, it is a still frame over the notepad, and the transport that would
start it again is one tap away on the tab it came from. Hidden rather than
unmounted — a `WebView` that goes away reloads, and pausing is the most
ordinary thing anybody does to a film — and it is a reading of the channel
rather than of what was pressed here, so somebody else pressing play puts the
corner back while this device is still on another tab. Docked is not touched by
this: a paused film on *Watch* is the card with its transport under it.

**Docked, what is in the flow is a hole rather than the picture.** A pinned row
has to take its own height out of the body so nothing is hidden beneath it, and
a picture positioned over the whole application cannot do that — so the *Watch*
tab leaves an empty black rectangle of the right size, measures where it landed,
and the picture lays itself over it. **The absence of a hole is the instruction
to float**, which is why no other screen in the application says anything about
the picture at all.

**Nobody outside the room gets one.** Being in the room is part of what makes
this device the *screen*, checked where the picture is drawn rather than only
in the rule that gives the role up — an effect runs after a commit, so a rule
written only there would load the page and take it away again. *Nearby* fails
it exactly as *out* does: that rung is reachability rather than attendance,
which is what makes it an answer to *I do not want to watch this*.

**In the room rather than *present*, which is the distinction that matters
here**: a *guest* is in the room without ever being in `present`, and a guest
link is very often the one sent in order to watch something together. The
reducer draws the line the same way — `WATCH_HERE` asks `inRoom` — so the
screen is agreeing with it rather than keeping a second rule.

**The tab decides where it is, not whether it exists — and so does the screen**,
which is the whole of the 2026-09-19 change. It was a child of the *Watch* tab's
card until then,
so it existed only while that card was drawn: a person who stepped into a room
with a film running saw no picture and heard no film, while the room was told
they were watching and their own microphone was closed on the strength of it.
What used to stop a film — tapping another tab — is the ladder now.

`app/src/watch/Picture.tsx` for the player and its four corners, `Dock.tsx`
for the rectangle itself; the hole is `DockSlot`, in `Screen`'s `aside` slot.

## Watch shape

**How the *Watch* tab lays itself out at a given size**, which is one pure
function — `watchShapeFor` in `ui/layout.ts` — and two answers: how many
columns, and how big the picture may be.

**One column stacks the picture over its transport; two put them side by
side.** They compete for height stacked and for nothing at all beside each
other, so a pane with room for both gets both. `TWO_COLUMN_AT` is the
turnover and is **a sum rather than a chosen number**: the narrowest picture
worth having (440, a phone's widest) plus the narrowest control column worth
having (300) plus the gap. Move either minimum and the breakpoint follows.
**It is not `SPLIT_AT`** — that asks how wide the window is and answers
whether a list fits beside a screen.

**Stacked, `RESERVE_UNDER_PICTURE` is kept below the film**: 150 points, being
the section label, the progress bar with its two times, and the transport row.
The promise is that **the scrubber and the three transport buttons are
reachable without scrolling on every surface**; the rest of the card is some
four hundred points and is meant to scroll. The picture takes what is left,
capped at 620 wide.

**The height is the half that was missing**, and the web is what makes it
obvious: a browser window is short and wide, has no rotation to rescue it, and
nothing in a width-only cap stops a 16:9 picture taking the whole viewport. An
iPad on build 251 was the report; the fold landing mid-button was the symptom.

**Both inputs are given rather than produced.** *Two columns when the controls
would not otherwise fit* is the obvious rule and oscillates — two columns
shrink the picture, the picture fits in one column again, and the layout flips
under a finger for ever. The pane's width and the body's height are moved by
the window and by the chrome, never by the answer.

## Portrait lock

**A phone is upright unless the film has the glass.** Every screen this
application has apart from *full screen* is a column of rows read upright —
the roster, the settings, a transcript, Home — and a phone turned sideways on
one of them gets a short, wide version of a layout that wanted height. The
film is the one thing that is better for the turn, so it is the one thing the
turn is permitted for.

**And inside it, both ways up are permitted**, which is the half that is easy
to get backwards. The obvious implementation of *the film is landscape* is a
landscape lock, and this project had one until 2026-09-20; what it costs is
somebody watching a phone flat on a table or propped upright in bed, who is
not asking to be rotated. The lock is released in full screen rather than
reversed, and the picture is fitted to whichever shape the glass is.

**Only a *handheld***, by the short side — `isHandheld` in `ui/layout.ts`, and
500 is the number. A tablet and a browser window are landscape sitting still
and have no turn to perform, so telling either which way up to be would be
moving somebody's furniture; they are unlocked, which is what they would have
had anyway. On the web it is a no-op entirely: `screen.orientation.lock`
refuses outside the browser's own full-screen element, which this application
never enters.

**It is what killed the turn-to-expand route.** Turning a phone sideways on
*Watch* entered full screen from 2026-09-19; a phone outside full screen is
never handed a landscape window now, so the route is gone rather than
unreachable and *full screen* is a button on every platform. It also lays the
old exit bug for good: the landscape lock made exiting hand back a sideways
channel screen, where this one turns the phone upright onto a screen that
wanted upright.

**The plist is what makes it possible at all.** `lockAsync` narrows the set of
orientations `ios.infoPlist.UISupportedInterfaceOrientations` allows and cannot
widen it, so both landscapes have to stay listed in `app.json` or full screen
would be a bigger portrait picture. See planning/RELEASING.md § *Orientation is
per-platform*.

`app/src/watch/orientation.ts`, called once from `Picture.tsx` so that it
covers every screen rather than the channel alone.

## Film title

**What the video is called**, on the watch card under the progress bar and on
a *second device* in the same place. Not on the expanded picture, whose scrim
carries the transport and the way out and nothing else.

**Learnt from a player, exactly as the length is.** The embed already holds the
name of the video it loaded — `getVideoData` — so the device showing the film
reports it in the report it was already making, and the channel keeps the first
answer. `WatchParty.title`, and `learnTitle` is the rule.

**Nothing asks YouTube anything**, which is the constraint the card went
without a title for: the URL came off it on 2026-09-18 and nothing replaced it,
because fetching a name would have been the first request this project ever
made to Google. A player describing the video it already has is not that
request. See decisions/2026-09-20-the-film-says-what-it-is-called.md.

**Null is ordinary**: the first seconds of every party, a party nobody is
showing anywhere, and an embed whose `getVideoData` is missing — the method is
undocumented, so it is read through a guard. The card then draws what it drew
before there were any titles.

**An advert can name a party**, exactly as it can already give one its length:
a pre-roll is a different video in the same frame, and both facts are learnt
from the same first report. It is the known cost of learning anything from a
player, and it corrects itself the next time a party starts.

## Watching (on the roster)

**That this person has the party's film up on something of theirs**, said as a
third suffix on their roster card — after *muted* and *has the floor*, which
are the two a reader may need to act on within the minute.

**The account and never the device.** What the room is told is that somebody is
watching; which of their screens it is on is their own business, and is a fact
only their own devices are shown — see *Watch on*. `ChannelView.watching` is
the list, gathered from live connections, and `Connection.screening` is what it
is gathered from.

**It is not *watching here*, and the two cannot be collapsed.** That one exists
to decide a microphone and so names somebody only when one device holds both
the room and the picture; a *second device* — the film on a television, the
voice on a phone — is a person plainly watching whom it deliberately does not
mention. A roster asked *is everyone with me* has to count them.

**Retracted when the app goes away, on a phone.** The declaration is withdrawn
while the app is backgrounded and restated on return, because iOS suspends a
backgrounded WebView and the film has genuinely stopped — and the person a host
is looking for is exactly the one whose phone is in their pocket. A hidden
browser tab goes on playing, so nothing is retracted there; that asymmetry is
measured rather than preferred. **Not the role itself**: `screenFor` survives
the trip, so the picture is where it was on the way back.

**Two things it cannot say.** A *guest* watching is never on it — a guest
socket is a scope of its own and carries no declaration — and neither is
anybody at all unless the film is *running*, the roster asking about the party
rather than about the list, since a device goes on offering itself as a screen
until it notices.

**A pause counts as stopped**, from 2026-09-20: the guard is `status ===
'playing'` and not merely that a party exists. A film is paused so that the
room can talk about it, every picture in it is sitting still, and a declaration
survives somebody putting the phone down — so *watching* across a pause is a
claim about attention with nothing behind it. The question the line answers,
*did the room come with me*, is live only while something is actually playing.

See decisions/2026-09-20-the-roster-says-who-is-watching.md.

## Watching here

**Your screen and your voice on one device**, which is the case that costs
something. A device cannot both play a film in stereo and hold a microphone
open — an open microphone forces a voice-mode session, which is mono, ducked
and voice processed — so a screen that is also in the room stops capturing
while the film plays, and the room's mute is **enforced** for that run so that
nobody is waiting on a voice that cannot arrive.

Sampled when a run starts rather than watched continuously: somebody switching
to their only device mid-film changes nothing until the next Play, so no voice
is cut mid-sentence. Drawn on the roster, because between the switch and the
next pause that person is silent and the room would otherwise read it as a
dropped call.

A *guest* with no speech grant does not count — no microphone, nothing to give
up. A *self-mute* does, a muted microphone being held open rather than
released.

---

# Part Two — words that exist only in the codebase

## Address

**What a URL says, in the two parts the app is actually in**: which of the
tier's bodies is showing, and what is open over it. `/channels`, `/contacts`
and `/support` are the frames; `/channels/settings`, `/contacts/standings` and
the rest hang off them. Fifteen paths, under the train's prefix, and never
anything else. `/support/support` is one of them and is not a mistake — the
tab, and the screen about giving that opens over it.

**An address names a place and never an id.** Not an account, not a channel,
not a recording. So it can name Settings, Standings and Support — one of a kind
each — and says nothing at all about a *channel* or a *Contact* screen, which
would need an id to be told apart: those read as the tab they were opened over.

**Every address restores**, which is what nesting bought. What the projection
loses, it loses on the way out; nothing the app is handed can fail to be
honoured, so the wiring has no repair step. The tab you were on is not
something opening Settings costs you — it was, for three days, when the six
screens were flat.

Exists only on the web. Native has no addresses and wants none, and
`useRoute.ts` is a no-op for exactly that reason.

**The word does two other jobs in the server, and neither is this one.** An
*address* in `devices.ts` and in the sign-out routes is a push address — see
*device token* — and a **sign-in address** is an email address, which is what
`COHORT_HOST_IDENTIFIERS` names a *cohort host* by. This entry is the routing
one, and is the only one of the three a user ever sees.

## Attention

The clock a **web** client keeps over its own *standing*, in
`app/src/state/attention.ts`. Fifteen minutes without evidence that anybody is
at the machine and it steps this device out of the channel it is standing in.

It exists because a browser tab does not die. A phone that is put away loses
the process in about a second and its presence about a minute later, and
nothing decides anything — absence is inferred from a connection that stopped.
A tab keeps its socket, its heartbeat and its audio for as long as the machine
is awake, and the *heartbeat* is sent by a machine rather than by a person, so
an abandoned laptop reads as *present* indefinitely.

**Three things are evidence, and one conspicuous thing is not.** Somebody
*other than you* being audible; somebody *other than you* arriving, guests
included; and this person's own hand on the page — a click, a key, a touch, a
scroll, the tab brought forward. **Your own voice is not**: a microphone left
open in an empty room hears traffic and hums.

**Capture is not activity**, which is why `anyMicrophoneOpen` is not this
predicate however much it looks like it. That one asks whether anybody *could*
be heard and holds steady through every silence on purpose. Two abandoned tabs
each make the other's microphone needed, so both read as capturing and neither
would ever expire.

**It is a device's and not an account's**, like the *standing* it reads and
unlike the *presence* it ends — see STATES.md. And its expiry is an ordinary
`STEP_OUT`, identical to the button: nothing new appears on anybody's roster,
and *Nearby* is not what it produces. Which of the two words a browser produces
is decided by which clock ran out first — see *Nearby / Stepped out*.

## Capture watch

The meter a browser runs over the microphone it has published, in
`core/capture.ts` plus an `AnalyserNode` at each caller —
`server/web/guest.ts` and `app/src/audio/useSessionAudio.web.ts`.

**Not a level meter and not *speaking*.** It asks one question once: is
anything at all coming out of this microphone. Four samples a second, eight
seconds below the floor to say no, and one sample above it settles the
question for that microphone for good — where *speaking* is the room's
continuous judgement about who is talking, pushed by the SFU, and is about
people rather than about a device.

It exists because on the web every step of the path can succeed and carry
silence: an in-app browser on iOS grants the microphone, the track is live,
the SFU forwards, and nothing anywhere reports it. *Embedded browser* is the
warning at the door for the same failure, and is a guess by user agent; this
is the measurement. Both can be right on their own.

**A question and not a verdict**, which is why what the screen says is what
was observed: a quiet room with noise suppression reads the same way.

## Card

One row in the *Channels* list, from either source — an invitation or a channel
you belong to. The two are alternative presentations of the same row rather than
a list and an exception to it.

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

## Conversing

You, present in a channel, with somebody else in it — `isConversing` in
`app/src/state/conversing.ts`, asked of every channel snapshot the client
holds. Two things read it and both are about that moment:
`thefloor.intro.doneAt`, which ticks the *introduction*'s *step in with
somebody* rung, and the notification ask, which latches the first conversation
as the moment worth spending iOS's one dialog on.

**Somebody else means a member or a *guest*.** Guests were not counted until
2026-09-13, so a conversation held entirely through a guest link read as
silence — on a ladder whose third rung is *bring in a guest*. Membership of a
channel's `guests` means present, so counting keys is counting people in the
room.

**It is not *step in*.** Stepping into an empty channel is not conversing, and
the rung that reads this said *Step in* until people who had stepped in were
told they had not. See
`decisions/2026-09-13-a-rung-says-what-ticks-it.md`.

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

**Which of Home's tabs is showing is not one of its kinds**, which is the
distinction worth keeping: that is not something you opened but which body the
*list* pane is showing. It is `List` — `'channels' | 'contacts' | 'support'` —
its own value, and it reads the same in both layouts. It was a boolean called
`contactsOpen` until 2026-09-01, which was the asymmetry written down: it named
one list and called the other *not that one*.

## Detail (of a notification level)

The sublabel under a notification option — `describeLevel(level).detail` in
`core/notifications.ts`, the sentence that says what the level does. A local
field name, not a concept.

## Device token

**An address, not a credential.** Where APNs delivers to one install: minted by
Apple on the device, and stored whole in `device_tokens` because it has to be
handed back to Apple to send anything. A *session (auth)* token is its opposite
on every count — our secret, stored only as a hash, and proof of who is asking
rather than of where to reach them. The two are separate tables and separate
words, and conflating them is the readiest mistake in this area.

**An install may hold a session and no device token.** Notification permission
is what mints one; an install that declined has a live session and no row here
at all. That single fact is why this table cannot stand in for a list of
somebody's devices, however much it looks like the nearer half of one — see
decisions/ § *Sessions are ended wholesale, and that is not a defect*.

`session_hash` joins a row to the session that registered it, and is the only
join the server has between a push address and a live socket: `POST /devices` is
the one request carrying both credentials at once, the bearer token in the header
and the APNs token in the body. Nothing else ever sees the pair. Deliberately not
a foreign key, and null both for rows written before the column existed and for
rows whose session has since been revoked; both fall back to the person-level
test.

It is also why `/auth/sign-out` and `/auth/sign-out-others` take a device token
in the *body* while authenticating from the header. The server cannot tell which
row belongs to the phone that is asking, so the caller names its own — and a
caller with no row of its own names none, and correctly loses them all.

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

## Growth classes — alone, first circle, onward

The three cohorts `bin/growth` sorts every account into, by its depth in the
invitation forest that `accounts.invited_by` describes. **Alone** arrived with
no inviter and is the top of a tree; **first circle** was invited by somebody
who came alone; **onward** was invited by somebody who was themselves invited,
which is every remaining depth taken together. Exhaustive and disjoint, and
named by depth rather than by how the invitation was sent — an address
resolving at sign-up and `creditInviter` writing an edge inside a room are the
same arrival.

Not frozen: `creditInviter` can name an inviter for an account that has been
here for weeks, which moves that person out of *alone* and everybody under
them down a class. It cannot happen twice to the same account.

An account in *alone* is a **root**, which is the word for its position in
the forest and carries no claim beyond it.

Distinct from the *leaderboard*, which ranks every inviter by their whole
subtree. These say what a person *is*, not what they have done.

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

**Both shared features stopped asking it on 2026-09-20** and ask presence
instead, for their transports as well as for starting — `canControlWatch`,
then `canControlPlayback` a few hours later. Every control on the film moves
something other people are watching in real time; and the audio player's turned
out to let a member play a track into a channel from outside it, seen on build
261. What the empty half still governs is what a conversation can *see* — its
name, who gets in, the clipboard. See *Watch party* and
decisions/2026-09-20-playing-is-not-tidying.md.

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

## Intent (a watch party's)

**Retired on 2026-09-18, and worth keeping as an account of why.**

The video's own bar was a second way to press the transport: play, pause and a
scrub on YouTube's own controls became `WATCH_PLAY`, `WATCH_PAUSE` and
`WATCH_SEEK`. It never worked for more than a day at a time.

**The bar is an input surface on the same player the channel drives as an
output surface**, and the API will not say which of the two caused a state
change — `onStateChange` carries the new state and nothing else. So a follower
watching its own player was listening for a person through a speaker it was
talking into. Everything built to separate the two separated them by *time* —
a dwell, a quiet period, a settle window, a pending press, four phases and
seven constants — and each was a window in which the follower stopped
listening in case what it heard was itself. Every window is a press that can
be swallowed; every window closed is a misread that can loop. The trade moved
five times and never settled, the last move swallowing every scrub in order to
stop a play press being stopped again.

`controls: 0` removed the surface rather than the ambiguity. The transport is
the app's own row, which was never the problem, for the reason that makes it
not one: **a button press is an action.** Nothing infers anything, so nothing
is swallowed, and actions are applied in the order they arrive and fanned out
to every player — which is all the channel ever did.

See planning/decisions/2026-09-18-the-picture-is-not-a-control.md.

## Introduction

What a new account is shown above both of Home's lists, until every rung of it
is done or dismissed. `state/introduction.ts` decides it and
`ui/Introduction.tsx` draws it; planning/ONBOARDING.md is the design.

One shape, for everybody: a ladder — get somebody here, step in with somebody,
and then four things to try inside a channel — each rung carrying an
instruction naming where it is done and a button that goes there.

**There were two until 2026-09-13**, the second being a single card for an
account that arrived with a contact, on the ground that its first rungs were
true before it arrived and a list congratulating somebody on what was done for
them is theatre. The *starting line* ended the born ticking — nobody's first
rung is ticked by what somebody else did for them — and with it the argument
for a second shape. What went with the card is the one control in this feature
that opened a channel rather than a list.

**Two rungs say what ticks them rather than what they are called after.** *Step
in with somebody* is stamped by being in a channel while another member or a
guest is, not by stepping in; the card it replaced said *You have not stepped
in yet* to people who had. *Get somebody here* is measured against the
*starting line*.

**A third rung exists in a browser, since 2026-09-13, and only there**: *put
The Floor on your home screen*, between the two account rungs — the one rung
that is about the client rather than about the account. It is never ticked; a browser running the installed app
reports it and the rung is simply not drawn, so its absence is the tick. What
each browser is told to do is `state/install.ts`, and where a browser
volunteers a `beforeinstallprompt` the row installs it directly. See
*installed (web app)*, and
`decisions/2026-09-13-the-web-app-can-be-installed.md`.

**It was four rungs until 2026-09-13**: *say who you are* and *choose a
username* went when both became derived at signup, and with them the profile
request the username rung needed. See
`decisions/2026-09-13-the-checklist-is-two-rungs.md`.

**Four more rungs since 2026-09-13, and they are a different kind**: *claim
the floor*, *say you are nearby*, *bring in a guest*, *play something
together*. All four are done inside a channel, and they are the only rungs
nothing else on the Home snapshot could answer — nothing the server otherwise
holds says whether an account has ever done any of them — so the server was
taught to record them, four stamps on the account written as the control that
does the thing is used, and they ride on that snapshot like every other rung.
They say *try this* where the rungs above say *this is true of you*. They were
per install, in `thefloor.intro.tried.*`, for the day between their being
built and the account taking them; those keys are read once and handed to the
server now. `core/tried.ts` and
`decisions/2026-09-13-the-tried-rungs-belong-to-the-account.md`.

**One rung is drawn in full: the first that is not done.** The ones behind
somebody are a title each, and the ones after the next are behind *See more*,
shut again on every mount. Seven rungs each carrying an instruction, a note
and a button is a wall above the lists rather than a ladder, and what a card
read on the way past is for is the next thing to do.

**It retires when the last rung is done, not on the first conversation.** That
reverses the original rule, which was right for a ladder whose every rung came
before stepping in and wrong the moment four came after: the first conversation
is the one instant at which none of those four can have been reached. Nothing
is drawn *during* a conversation, which is a separate rule and unchanged — the
card returns to Home afterwards carrying what is left.
`thefloor.intro.doneAt` is still written at the first conversation and still
called that on disk, but it now ticks *step in with somebody* and nothing else,
rather than retiring anything by itself. See
`decisions/2026-09-13-the-checklist-outlives-the-first-conversation.md`.

**Every row carries a cross, since 2026-09-13, and that is the second exit.**
Until then the only way out was finishing it, which is fine for a ladder
somebody is climbing and wrong for one rung of it they have read and decided
against — a browser that will never be installed to, a guest link for somebody
with no guests. Dismissing hides a rung and never ticks it: the four *try*
stamps are facts about the account and a dismissal is a statement about the
list, so it is written on this install, in `thefloor.intro.dismissed`, beside
the *starting line* and `doneAt` rather than on the account. The last dismissal
retires the whole card, an empty one being a bug rather than a quiet card. See
*dismiss (a rung)* and
`decisions/2026-09-13-the-checklist-has-a-second-exit.md`.

**And *Show the checklist again* returns the whole ladder hollow.** It moves
the *starting line* to the contact count of the moment rather than clearing it,
so *get somebody here* asks an established account for somebody *more* — a line
left where it was would hand back a ladder whose first rung was ticked before
it was drawn. All six come back unticked. It used to latch an arrival of
`alone` instead, for a defunct reason: clearing the arrival re-derived it,
`arrivalOf` answered *invited* for anybody with a contact, and the reset drew
the one-line card whose five cleared rungs it could not show.

Called *introduction* in the code and never on screen, where it says *Getting
started*. The convention's name is an onboarding checklist; this is the
activation-ladder half of it and deliberately not the guided-tour half.

## Island

A connected component of the accepted-contacts graph: a set of accounts every
one of whom can be reached from every other by walking mutual contacts.
Somebody with no accepted contact is an island of one. `bin/growth islands`
is the only thing that computes them; nothing in the server has the concept
and no screen says the word.

**Not a root's tree, and the two do not have to agree.** An invitation is
not a contact and nothing makes it one, so somebody can be invited, arrive,
and sit on an island of their own; and two people who each came *alone* can
become contacts, putting two roots on one island — which the invitation
forest cannot see, neither having invited the other. See *growth classes* for
the other structure, and use the right word: a tree is who brought whom, an
island is who can reach whom.

Pending contact requests are not edges. A contact is somebody you have both
agreed to be in touch with, so an island is a claim about agreement; the
bridges a pending request *would* build are reported separately.

**Which is exactly where *reach* differs, on purpose.** The gate on a
*getting-started channel* counts pending rows as edges, because it is asked at
signup — when the invitation that brought somebody here is a pending row and
nothing else. The two measures answer different questions and are both right
about their own; see *reach*, and do not reconcile them.

## Live channel

`liveChannelView` — the channel this **account** is standing in, chosen from
every snapshot the app holds rather than from the last one to arrive.
`liveChannelHere` is the narrower and more often correct one: the channel this
**device** is standing in, which is what decides whether this device holds a
microphone. An account is present whether the room is held here, on the phone
in their hand, or by a process since killed.

Not what Home's **Live** section means. See *live* in Part One — and *the
channel one is present in*, which is what this ought to be called. The
adjective is wrong here rather than there: *live* describes a channel,
*present* describes you and a channel, and this is the second. Named
2026-09-08, not yet renamed, the rename touching the wire.

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

## Mute (four things, one word)

**The word does four jobs and only the first is the user's.** They are
routinely confused in conversation about this code, and two builds on
2026-09-06 went astray on the confusion, so they are separated here.

**1. Self-mute — the act.** `channel.selfMuted[userId]`, set by the Mute
control, cleared by stepping out and *not* by losing a connection. A statement
about transmission and nothing else: it does not affect the *floor*, and it has
never meant "I am leaving". **The one of the four a person performs, which is
not the same as the one a person performs *on themselves*** — since 2026-09-07
anybody in the room may close anybody else's from their profile, though only
its owner may open it. The entry in Part One says why the name did not follow.
See *self-mute*.

**2. What the footer icon shows — the appearance.** Not the same set. The icon
reads muted when you self-muted, **and** when the device has no microphone at
all (`SessionAudio.inputAvailable` false, as on a Mac mini), and it is coloured
differently again when somebody else's floor claim is *silencing* you. So the
icon means **"you are not being heard"**, which has three causes, only one of
which you chose. A reader who takes the icon as a view of `selfMuted` will be
wrong about two of them.

**3. `MicIntent = 'muted'` — the instruction to the device.** In
`useSessionAudio.ts`, one of three: `capturing`, `muted`, `released`. It means
**keep the device exactly as it is** — still open if it was open, and
deliberately *not opened if it was shut*, because publishing a track and muting
it a moment later leaves a live microphone on the wire for two awaits. It is
**not** a user concept: `holdForPlayout` forces it whenever a remote track is
subscribed and the microphone is not otherwise needed, so it appears with
nobody having muted anything. Its own hazard is that it says nothing useful
when there is no device — see DECISIONS § *A hold with nothing to hold*.

**4. Track mute — what the room reports.** LiveKit's `TrackInfo.muted`, carried
through `MediaPlane.audioTracks` since 2026-09-05. A published-but-muted track
is present in the roster and carries no audio, which is what lets `meterRoom`
count *transmitting* microphones rather than existing ones, and what lets Rule A
tell a defunct room from a busy one. Below it sits a fifth, unused as of this
writing: `AudioDeviceModule.setMicrophoneMuted`, which mutes at the device
rather than at the track.

**None of these is *silenced*.** That is the floor withholding you from
everybody else, done by unsubscribing listeners rather than by muting anything
— which is why a watch party's tracks stay unmuted through a film, and why the
floor does not register in sense 4 at all. See *silenced*.

## Participant

`ChannelState.participants` — everybody who belongs to a channel, initiator
first. **The codebase's word for what the guest-facing screens call a
*member*.** Every guard that must refuse a guest is written as `isParticipant`
rather than as presence or room occupancy, which is what makes a guest refused
by default.

Grows on `INVITE`, shrinks only on `LEAVE_CHANNEL`. **Membership is not
presence** — see *present*.

## Playback blocked

`SessionAudio.playbackBlocked` — the browser refusing to let this page make
sound, which every engine may do to a page nobody has interacted with.

**Not a failure and not a mute.** Nothing is broken, the room is arriving, and
no retry lifts it: what lifts it is a real gesture, which is why it is a state
with a button — `allowPlayback`, drawn on the *Audio* card — rather than
something the audio hook resolves on its own. Read from
`RoomEvent.AudioPlaybackStatusChanged` rather than from one attempt at
connection, since a tab restored from the background can become blocked long
after a connection that was fine.

**Always false on a phone.** An installed app owns its own `AVAudioSession`
and asks nobody's permission to play; the field exists on the native
`SessionAudio` so that the shared view can read it without a platform test.

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

## Pump

`PlaybackPump` in `server/src/playback.ts` — the thing that *produces* shared
playback, as distinct from *publishing*, which is how any track reaches a room.
It decodes one file with ffmpeg and emits a continuous stream of 10ms frames to
two sinks: the room, so both parties hear it, and, while recording, an encoder,
so the recording is the same bytes that were heard rather than a re-render.

**It emits silence as diligently as sound** — "decoded audio while playing,
silence otherwise" — and that is the property to know. For the recording it
keeps a paused track occupying its real duration instead of collapsing to
nothing. For diagnosis it is what makes *playout* readable at all: because
frames keep arriving while a track is paused, a stalled sample count means this
device has stopped rendering rather than that nobody pressed play. A pump that
went quiet by sending nothing would make a broken client and a quiet channel
the same reading.

In the room it appears as an ordinary remote participant under the identity
**`media:chan_<channel id>`**, which is the name it goes by in the audio log —
`sub + media:chan_H90XCmha58Cs`, `playout frozen … media:chan_…`. So *pump* is
the server-side component and `media:chan_…` is its face inside a LiveKit room;
they are one thing named from two sides. It is not a person and holds no seat.

See PLAYOUT.md, whose whole investigation is about this participant's track
failing to render on a device that is subscribed to it.

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

## Reach

How many people somebody can get to by walking contacts, counting themselves,
and **counting pending rows as edges**. `Accounts.reachableFrom(userId, limit)`.
One of the two things that decide whether a new account is given a
*getting-started channel*: below `COHORT_REACH_FLOOR`, which is four, they may
be; at it or above, they are not. The other is whether they have turned
notifications on, and both have to hold.

**Not an *island*, and the difference is the whole reason it has its own
word.** An island walks accepted edges alone and is right to — it is a claim
about who has agreed to be reachable to whom. Reach is asked about an arrival
whose invitation `resolveInvitesFor` has written as a *pending* row, with
nothing accepted yet and possibly nothing ever accepted. Walking
accepted edges there would measure every invited arrival as an island of one
and hand a cohort to precisely the people the gate exists to exclude. What it
is asking for is the island somebody is *about* to be on — what `bin/growth`
calls the bridges that would merge islands if the pending rows were accepted.

**Bounded, and the bound is not an optimisation.** It stops as soon as `limit`
people have been seen, so it costs the limit rather than the size of the
component. The transitive closure `bin/growth` uses is quadratic in an island,
which is fine in a report somebody runs by hand and is not fine on the signup
path. Nothing ever needs the true number; the only question asked of it is
whether it has reached a threshold.

## Root

An account at depth 0 in the invitation forest — nobody's invitation brought it,
so it is the top of a tree. `root` is the column `bin/growth` labels each person
with, and `bin/growth roots` is one row per tree that has anything in it.

**It is a position and not an achievement.** A root is where somebody sits in
the forest, whatever grew under them, and most roots grow nothing: the report
gives them a single count at the bottom, `roots_who_brought_nobody`. The word
here was *founder* until 2026-09-10, which read true while eight people had
arrived on their own and stops reading true the moment a marketing campaign
produces accounts that have founded nothing. Depth 0 says only that the box
knows of no invitation — see *growth classes*, which is what the depth means.

Not an island. Two roots can end up on one island by becoming contacts, and a
root can be an island of one; see *island*.

**And not a *cohort host*.** The task that asked for *getting-started
channels* called the people who run The Floor its "root users", which is not
what this word means here: a root is a position in the invitation forest, every
cold install is one, and there are more of them than of anything else. A host
is named by address in `COHORT_HOST_IDENTIFIERS` and there is one.

## Run

One recording from start to stop, identified by a `runId` the server mints. A
run survives pause and resume; there is no *stopped* state, because a stopped
run is simply over and the channel returns to idle so another can begin.

## Seat (developer sense)

The durable half of a guest: a row in `guest_sessions` with a secret and an
expiry, pushed out on every sign of life. `ChannelState.guests` is the volatile
half and means *present*; the seat is what lets somebody come back. See *seat*
in Part One.

## Session (auth)

One sign-in, and so in practice one device: a row in `tokens` holding a hashed
secret, an account, a minted time, an expiry ninety days out, and — since
2026-08-24 — `last_seen_at` and `last_build` for that device alone. `issueToken`
mints a fresh row on every completed `/auth/verify` and never reuses one, so a
phone and a tablet are two rows and two secrets.

**Several per account, as of 2026-08-24.** Signing in used to revoke every other
token first, so the table held at most one row per account and *session*,
*device* and *account* were interchangeable in conversation. They are not now. An
account may hold as many sessions as it likes and still has one voice and one
pair of ears — that is *displaced*, which is about rooms rather than about
credentials.

**A session is anonymous by construction.** Nothing records what presented the
token: the row is a hash and some timestamps, with no platform, no model and no
origin. So the only two operations are the session you are holding
(`/auth/sign-out`) and every other one at once (`/auth/sign-out-others`), with no
way to name a third — and the second spares the caller by hash rather than by
count. That is deliberate and settled: decisions/ § *Sessions are ended
wholesale, and that is not a defect* is the gap, and why it is not being
closed.

**Not the audio session**, which is the other thing this word means in this
codebase and is more often what a file named `session.ts` is about — see *session
want*. Nor a `guest_sessions` row, which is a *seat (developer sense)*.

## Session want — `call`, `idle`

The three answers to *what is this app asking iOS for*, named by `SessionWant`
in `app/src/audio/session.ts` and decided in one place, `wantFor` in
`useSessionAudio.ts`. **A request, not an observation** — the audio debug panel
shows `asked` against `actual` precisely because they can differ, and most of
this system's audio history is that gap.

**`call`** is `playAndRecord` / `videoChat` with `allowBluetooth`,
`allowAirPlay` and `defaultToSpeaker`. No `mixWithOthers`, so it is
**exclusive**: taking it stops another app's audio. It is the only one under
which this device may transmit, and on a Bluetooth headset it is the hands-free
profile — mono, 24 kHz. Asked for whenever there is audio to hear, *and* for a
**silent wait**: standing in a quiet channel with nothing else playing, where
the microphone is opened at step-in so an arrival can be heard and answered
without touching the phone. That is only possible up front — iOS refuses a
backgrounded app a microphone it did not already have.

**`idle`** is `playback` / `spokenAudio` / `mixWithOthers`, and **hands the
audio system back**: stereo A2DP on a headset, another app's audio untouched.
Asked for when this app should take nothing — a *watch party* withholding for
its film — and for an **accompanied wait**, where somebody steps into a channel
while their phone is already playing something.

**An accompanied wait gives up presence.** The phone is not kept awake, so it
suspends, its presence lapses, and the roster reads *Nearby* — the arrival
notification does the work. That was decided after the alternative was built
and tried: staying awake meant the arrival could be *heard* but not answered,
since iOS grants a backgrounded app no microphone, and being talked to with no
way to reply is worse than being absent.

**Which wait you get is decided at step-in**, from whether another app was
playing at that moment, and re-decided only when the app is brought forward.
`isOtherAudioPlaying` tells the truth only while this app is active — it
reports our own foreground state rather than anybody else's audio — and that is
also the only moment the decision can be acted on.

**Two other values have existed and gone.** `WAITING` was `call` plus
`mixWithOthers`, meant to hold the hands-free route through a quiet channel. It
was deleted on 2026-09-06: a call-shaped session stops another app's audio
whether or not it mixes, so the option bought nothing and the category cost
everything. A reader who finds it in an older document is reading about
something that no longer exists. `ducked` was `idle` plus `duckOthers`, and
lasted about an hour: it could only be reached from a state this app then
stopped keeping alive, so nothing could ever have reached it.

`sessionFor` turns a want into the configuration; `policyFor` hands the same
answer to the SDK's native observer, which is a second writer that re-applies a
configuration on every engine transition with no JavaScript in the path. The
two must agree or the last write wins. See STATES.md § *Audio Session
Configuration*.

## Silenced

Derived from `floor.holder` rather than stored: you are silenced iff somebody
else holds the floor. `isWithheld` combines it with the watch party's room-wide
mute, which is a different thing — a claim withholds everybody but one and
confers control; the party mute withholds everybody and confers nothing.

## Snapshot

One `ChannelView` or `HomeView` pushed over the socket. It carries `serverNow`
so countdowns are computed against the server's clock rather than the device's,
which drifts and can be set by the user.

## Speaking report

`ClientMessage.channel.speaking` — a *withheld* speaker's own device telling the
server it is talking, carried back to the room on the snapshot as
`ChannelView.speakingWhileWithheld`.

**It exists because nothing else can see it.** Withholding is done by
unsubscribing every listener, and LiveKit tells a listener nothing about
somebody they are not subscribed to — so a *claim* freezes every other device's
speaking indicator for the people it silences. The only participant the SFU
still reports a withheld speaker to is that speaker, which makes their own
device the sole witness. Self-asserted and uncorroborated: the worst it can buy
is a dot on your own card during a claim you are silent in.

Sent only while withheld, on the edges of the *smoothed* signal, so a claim
somebody talks through costs two messages.

## Starting line

The contact count an account's *introduction* began from —
`contactsBase` in `app/src/state/introduction.ts`, stored as
`thefloor.intro.contactsBase`. *Get somebody here* is done when the account's
contact count has gone **above** it, rather than when it is above nought.

**It is what turns a count into an act.** `contacts.length > 0` is a standing
fact about an account rather than something anybody did while the ladder was
in front of them: an invited account arrives holding a contact, so its first
rung was ticked before it was drawn, and *Show the checklist again* handed an
established account the same free tick. Latched at the first Home snapshot the
install ever saw, and moved to the count of the moment on *Show the
checklist again* — which is what makes that tap ask for somebody *more*.

**Latched rather than recomputed, and that is the point rather than an
optimisation.** Read against today's count the rung would be unticked for ever,
the line following it up.

It replaced *arrival (invited / alone)*, which recorded whether an account's
first snapshot held anybody and picked one of two introductions on the answer —
a ladder for an account that had nobody, a one-line card for one that did,
since that cohort's first rungs were born ticked. With nothing born ticked
there is no second cohort and no card; what survived is the other half of the
arrival's job, being the latch that says this install has seen a snapshot
before. `thefloor.intro.arrival` is read once and deleted — planning/SHIMS.md.

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
box. See decisions/ § *Three variants of deploy*.

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
- **decisions/** and its closed volumes — why a thing is the way it
  is, including what was deliberately not built. Grep the whole set.
- **EXPIRATIONS.md** — every deadline measured in days.
- **AGENTS.md** — the traps that cost a day, and the five verbs (*land*,
  *deploy*, *upload*, *submit*, *release*), which are five different things and
  are not defined here because they are about shipping rather than about the
  product.

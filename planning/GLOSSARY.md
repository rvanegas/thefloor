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
- **Channels** — One of Home's two lists: conversations you can walk into, in three sections
- **Chip in** — The donation link, in Settings
- **Clipboard (a channel's)** — One piece of text the channel holds, readable and replaceable by anybody in it
- **Close** — The way off any screen you opened, and the word every one of them uses
- **Contact** — Somebody you have both agreed to be in touch with
- **Contacts** — The other of Home's two lists: the same people indexed by name rather than by room
- **Floor, the** — The thing the app is named after
- **Guest** — Somebody in a channel with no account here, admitted by a member through a *guest link*
- **Guest link** — A link a member shares that lets somebody open a channel in a browser without an account
- **Home** — The screen the app opens on and the frame the rest sits in; holds two lists, not one
- **Invitation** — An ask to join a channel, from whoever actually asked rather than whoever created it
- **Invite link** — A link that makes whoever opens it a *contact* of whoever sent it, once they are signed in
- **Invite pin** — The six digits at the end of an invite link, good once
- **Knock** — A named person at the door via a *guest link*, settled by one member answering
- **Labs** — A Home setting deciding whether the unfinished parts exist for you; per account, off by default
- **Leaderboard** — The invitation standings: who is here because of whom
- **Live** — On Home, a channel with somebody in it right now — the top of the priority ladder
- **Member** — A user with an account who belongs to a channel; the guest-facing word for *participant*
- **Nearby / Stepped out** — The two things a roster card says about somebody who is not here; *nearby* is now also something you can declare and step out of, and it offers you a step in when somebody arrives rather than taking one
- **Ping** — A notification to one person in a channel who is not there, saying somebody wants them
- **Present** — In a channel, able to hear and be heard, right now: holding a connection to its media room
- **Recording** — Audio kept from a channel, started and stopped by anybody present
- **Seat** — A guest's standing in a channel: a place to return to, rather than a membership
- **Self-mute** — A microphone closed by hand rather than by the floor; anybody in the room may close yours, and only you can open it again
- **Step in / Step out** — Entering and leaving a conversation without leaving the channel; stepping in claims the phone's audio system outright, and stepping out is also how a declared *nearby* ends
- **Transcript** — Behind *Labs*: without it a recording shows no transcript and no way to ask for one
- **Username** — A name somebody chooses for themselves, unique across everybody, written with an `@`. Optional, and most people have none
- **Voice** — One speaker within a transcript
- **Watch party** — Shared playback in a channel; behind *Labs*, starting side only

**Words that exist only in the codebase**

- **Address** — What a URL says: which list the tier is showing, and what is open over it
- **Attention** — Whether somebody is at a channel: frontmost on a phone, a hand on it in a browser, and never the audio. One server-held clock per person per channel, and the one the roster shows about anybody absent
- **Subscribeable** — Whether there is anything in a room to hear — another occupant, a track, a party — which is what stops *attention* retiring a silent listener
- **Card** — One row in the *Channels* list, from either source — an invitation or a channel you belong to
- **Channel state** — `ChannelState` in `core/types.ts` — everything true of a channel, reduced by pure functions
- **Claim** — One holding of the *floor*: `floor.holder` plus `claimedAt`
- **Core** — `core/`, the rules: pure functions over a `ChannelState`, no I/O and no imports outside itself
- **Detail (pane)** — The right-hand pane of the two-pane layout, above the width breakpoint — the other is the *list*
- **Detail (what is open)** — The `Detail` type: one value naming the single thing the detail pane is showing
- **Detail (of a notification level)** — The sublabel under a notification option, saying what that level does
- **Displaced** — The message telling a session it is no longer the one standing, another device having entered
- **Egress** — LiveKit's recording jobs
- **Expired (build)** — An install below `MIN_SUPPORTED_BUILD`; it replaces itself with an update screen
- **Ghost** — A button variant and nothing else: transparent, muted, for a control that must not compete
- **Guard** — An exported `can…` predicate in `core/channel.ts` — `canClaimFloor`, `canPasteClip`, `canManageGuest`
- **Has the room** — `hasTheRoom` — you are in the channel, or nobody is
- **Heartbeat** — `STILL_HERE`, sent per channel while somebody is in one
- **Identity** — The string a participant publishes under, and the key a *stem* and transcript line file under
- **In-app** — `ContactView.inApp` — whether somebody holds a socket right now
- **Live channel** — `liveChannelView` — the channel this *account* is standing in, across every snapshot held
- **Media plane** — LiveKit — `livekit-server`, `livekit-egress` and Redis — plus the S3 bucket recordings land in
- **Mix** — The single file a finished recording becomes, made from its *stems*
- **Mute (four things, one word)** — The word does four jobs and only the first is the user's; they are separated in the entry
- **Participant** — `ChannelState.participants` — everybody who belongs to a channel, initiator first
- **Playout** — Whether this device is actually rendering the audio it is subscribed to
- **Protocol** — `core/protocol.ts` — the wire
- **Pump** — `PlaybackPump` — what *produces* shared playback, as distinct from publishing
- **Reconcile / restate** — Comparing what was stated to the media plane against what the room carries, once a tick
- **Restore** — Reviving every unended channel from its state blob at startup
- **Room** — The media plane's word for a media thing; never appears in the interface, which says *channel*
- **Run** — One recording from start to stop, identified by a `runId` the server mints
- **Seat (developer sense)** — The durable half of a guest: a `guest_sessions` row with a secret and an expiry
- **Session want — `call`, `idle`** — What this app is asking iOS for, decided in one place (`wantFor`)
- **Silenced** — Derived from `floor.holder` rather than stored: you are silenced iff somebody else holds the floor
- **Snapshot** — One `ChannelView` or `HomeView` pushed over the socket
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
(`MAX_CHANNEL_PARTICIPANTS`), plus any guests they let in.

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

**In a browser it is the only way off, and the Back button is not one.** Four
of these screens have no *address* — a profile, a transcript, a channel's own
settings, and which channel a channel screen is — so the browser's Back does
not see them: pressing it leaves for the list, or leaves the site. Chosen on
2026-09-04 rather than overlooked, and the alternative was giving those screens
addresses, which would have meant putting ids in them. See
decisions/ § *An address names a place and never an id*.

**The channel screen's own way off used to be two words and three cases** —
*Home* on a phone, *Close* in the *detail* pane, and neither while you were
present in the channel. All three collapsed into this one on 2026-09-01, when
*Home* became the frame that carries the live bar over whichever list is
showing: closing a channel can no longer hide a conversation somebody is in, so
there is nothing to withhold and nothing to navigate to.

Distinct from *Home*, which is a place rather than an action, and from *Step
out*, which gives up presence rather than closing anything.

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

**The screen the app opens on, and the frame everything else on it sits in.**
Not a list: it holds two of them — *Channels* and *Contacts* — with a switch
between, and above that the room you are present in if there is one. Settings,
*Chip in* and the *Leaderboard* are Home's rather than either list's, being
about the application rather than about anybody you can reach.

**Home has no address**, which follows from the same fact and took until
2026-09-04 to reach the code. The two lists have one each — `/channels` and
`/contacts` — and Home is the frame around both, so there is nothing left for a
third address to name: whenever nothing is open, one of the two lists is what is
showing. The `Screen` type called the pair `home` and `contacts` until then,
which was the root-and-child asymmetry surviving one layer up from the boolean
it had already been renamed out of.

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
account rather than to the phone. Two things are behind it today: *transcripts*
and the *watch party*.

It is a gate, not a preference: with it off the sections are not on the screen
at all — no greyed buttons, no empty cards. And it is only about you. Somebody
in your channel who has turned it on can start a watch party you never asked to
see; you get the card for it while it is running, because your own player is
following it, and you can stop it. What Labs decides is whether *you* can begin
one. See `labs` in core/settings.ts.

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

## Nearby / Stepped out

The two things a roster card says about somebody who is not here.

**Stepped out** — they left, deliberately, and the card says how long ago.
**Nearby** — within reach, one notification away: ping rather than give up. It
is shown for fifteen minutes (`WAITING_WINDOW_MS`) and then reads as *Stepped
out* like anything else.

The distinction is one bit, and it is the difference between telling somebody
to give up on a person and telling them to ping.

**One clock, and it is attention**, since 2026-09-09. How long somebody has
been nearby, and how long they have been away, are the same number: the time
since they were last attending *this channel*. The server holds it, one stamp
per person per channel, fed by a report the client sends when the app is
frontmost or a hand is on it; the tick reads it and ends both states.

**Per channel and not per person**, because the same person is stepped out of
different rooms at different times and that difference is most of what a roster
carries. A device names what it is attending: the channel on screen, and the
channel it is standing in — so reading Home holds the conversation you are in,
and a declaration in a room you are not looking at ages as it always did. So the roster says *nearby 20s* and *away 4 minutes*, and both answer
the question anybody actually has — whether a notification will find them —
rather than when somebody last left a room.

**Three clocks preceded it inside a single day**, which is worth knowing only
because the words still exist in the code: `lastPresentAt`, the last sign of
life in a channel, which now orders Home and nothing else a reader sees;
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

**Nearby has three ways in, and since 2026-09-08 two of them are declared.**
It used to be only something that happened *to* somebody.

- **Declared** — *be nearby*, from outside a channel.
- **Declared** — *be nearby*, from inside one, which abandons the claim on the
  audio system.
- **Inferred** — present, and the connection ran out of grace before the
  attention clock expired.

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
declared-nearby phone is standing in, it says who arrived and **offers** a step
in — a card with *Step in* and *Stay nearby*, `nearbyArrival` in the code.
Answering the offer is not answering the declaration: *Stay nearby* leaves you
nearby and the next arrival offers again. Promotion, where the phone stepped
itself in, was built and removed on 2026-09-08 without ever running on a
device; see `decisions/2026-09-08-the-arrival-is-offered.md`.

**Nothing else about it changed, and that is the point.** It is not kept alive,
it lapses to *Stepped out* after the same window, and it is carried by the same
`waiting` field — so every build that predates the declaration renders one
correctly, with a ping. The two new ways in were behind `labs` until
2026-09-09, when the ladder above gave them a shape worth shipping.

**One clock governs all three, and it measures the last sign of life** rather
than the moment anything was declared: how long since we heard from you, which
is how likely a ping is to reach you. `ATTENTION_WINDOW_MS = WAITING_WINDOW_MS`
in `app/src/state/attention.ts`, and `Exit` in `core/channel.ts` is what leaves
`lastPresentAt` alone for every kind but a tap.

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

**Neither verb is about navigation, and since 2026-09-08 the screen follows the
setting rather than the verb.** Stepping out closes the channel screen only for
somebody whose tap steps in — the default — because for them arriving at the
screen was the step in and there is nothing left to look at. With *Tap a
channel to look, not step in* on, the screen and the room are two things at
both doors: a tap opens the screen without entering, and stepping out gives up
the room and leaves you looking. *Close* is what takes you off the screen. See
`tapToLook` in core/settings.ts.

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

**A name somebody chooses for themselves, unique across everybody, written with
an `@`.** Optional, and most people have none. Letters, digits and underscores
only, five to thirty of them; `core/username.ts` is the rule.

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

Behind *Labs*, since 2026-09-06, on the starting side only: anybody in a
channel can stop, pause and seek a party that is already running, whoever
started it.

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

## Address

**What a URL says, in the two parts the app is actually in**: which list the
tier is showing, and what is open over it. `/channels` and `/contacts` are the
frames; `/channels/settings`, `/contacts/standings` and the rest hang off them.
Eight paths, under the train's prefix, and never anything else.

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

**Which of Home's two lists is showing is not one of its kinds**, which is the
distinction worth keeping: that is not something you opened but which index of
people the *list* pane is showing. It is `List` — `'channels' | 'contacts'` —
its own value, and it reads the same in both layouts. It was a boolean called
`contactsOpen` until 2026-09-01, which was the asymmetry written down: it named
one list and called the other *not that one*.

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

## Run

One recording from start to stop, identified by a `runId` the server mints. A
run survives pause and resume; there is no *stopped* state, because a stopped
run is simply over and the channel returns to idle so another can begin.

## Seat (developer sense)

The durable half of a guest: a row in `guest_sessions` with a secret and an
expiry, pushed out on every sign of life. `ChannelState.guests` is the volatile
half and means *present*; the seat is what lets somebody come back. See *seat*
in Part One.

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

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
- **Channel name** — What a member has called a channel (`channel.name`), and only that; most channels have none and are *unnamed*
- **Channel title** — What a channel is shown as, everywhere: its *name*, or, for an unnamed channel, who else is in it by display name (`describeChannel`), so it is the viewer's own and changes as people come and go (`channelTitleFor`)
- **Channel one is present in, the** — The channel you have stepped into, as against a *live* one, which anybody may be in
- **Channel tabs** — The six views of a channel, one at a time: People, Clipboard, Invite, Record, Listen, Watch; the first was *Roster* until 2026-09-14, *Members* until 2026-09-22, and now labels its four groups — *Members*, *At the door*, *Guests*, *Invitations* — rather than naming one of them; the fourth was *Player* until 2026-09-18
- **Channels** — One of Home's two lists: conversations you can walk into, in three sections
- **Chime** — The sound a device makes when somebody *else* crosses the boundary of the channel you are in: the rung they land on picks it — two notes rising for stepping in, the same two falling for stepping out, the same note twice going nowhere for stepping back to *nearby* — and a move that does not cross *present* makes no sound at all; see also *recording chime*, the fourth, which is about the room rather than about who is in it, and the *film chimes*, the fifth and sixth
- **Film chimes** — The two sounds the *watch party* makes, since 2026-09-26: a falling octave (A5 A4) when the film starts playing, a rising one (A4 A5) when it stops. They say what happened to the *room's voice* rather than to the film — a run shuts every microphone in the room and a pause gives them back — which is why *play* falls the way *out* does; A4 is the only note under the presence chimes' register, and that is what keeps the pair from being heard as a variation on *in* and *out*. Everybody present hears both, including whoever pressed the button; a stop and a film running out sound like a pause, there being no third thing to say. On the device *watching here*, and only there, each is ordered against the *audio session*: the play chime is sounded first and the microphone released after it, the pause chime waits for the microphone to come back — a chime is played into the session this app holds, and a run is the length of time it does not hold one
- **Chime path** — Which way a chime reaches the speaker: `player` since 2026-09-17, an `AVAudioPlayer` on the media path, so a phone in silent mode still plays it while it is in a call; `system` is the alert path it shipped on, kept as the control
- **Chime loudness** — One number, `CHIME_AMPLITUDE` — full scale, the top of a ladder that was a setting for one day; the peak the file is rendered at, the media path then playing it at full gain
- **Beat (between chimes)** — 300ms of silence held between two chimes that fall in the same tick, so they are heard as two events rather than as one chord — longer than a whole chime, since a shorter rest is filled by the decay of the note before it; the queue is in `chime.ts` and spans every chime the app plays
- **Recording chime** — The fourth chime and the only one that is not about presence: three notes rising when a recording *somebody started* begins, heard by everybody present including the starter; an automatic run is silent
- **Chip in** — The donation link, on Home's *Support* tab
- **Clipboard (a channel's)** — One piece of text the channel holds, readable and replaceable by anybody in it
- **Close** — The way off any screen you opened, and the word every one of them uses bar the channel screen, whose way off is *Home*
- **Community** — A channel with an *owner*, which anybody holding its *community link* may join, up to twenty; made only by *Make channel into a community*, by a channel's one member while alone in it, and for good. Never a *podcast* too, and the one place the no-admin rule bends
- **Community link** — A community's `/j/<code>`, which opens its *community page* and makes nobody anything by being opened; reset by its owner to revoke it, and by any rename, being read from the name
- **Community page** — What a community link opens: the community's name, description and member count, the App Store, the *join link* and the web app, and no member's name
- **Contact** — Somebody you have both agreed to be in touch with
- **Contacts** — The other of Home's two lists: the same people indexed by name rather than by room
- **Dab** — The soft rose disc carrying an `!`, in the top-right corner of the control it is about, a Home tab or a button: something is waiting behind it. Never a count, and on *Contacts* it clears itself while on *Support* it has to be read — where it is drawn twice, on the tab and on the *Help* card that tab meant
- **Description** — One line or two of plain text saying what a channel is, written on *Channel Settings* by anybody with the room and offered only to a *public channel* and a *community*, whose pages (and the podcast's *feed*) are where it is read. It was the *notepad*, on a tab of the channel screen, from 2026-09-12 to 2026-09-27. `description` in the code, which never moved
- **Display name** — What somebody is called everywhere: rosters, invitations, recordings. Not unique, holds anything a keyboard produces, and derived from the local part of the sign-in address when nobody types one
- **Floor, the** — The thing the app is named after
- **Floor Settings** — The settings screen behind Home's gear; the account's, not a channel's
- **Getting-started channel** — The one channel a new account with nobody here is put into, called *Getting Started* and nothing else: four such arrivals and a *cohort host*, nobody a contact, leaveable like any other, and temporary — it stops being made when growth no longer needs seeding. Given only to somebody who has granted notifications, at the moment they do, and never to a tombstone or to an address of ours
- **Cohort-eligible** — That a *getting-started channel* is waiting on this account turning notifications on and on nothing else: not a *cohort host*, not already in one, within *reach* of nobody, and the feature switched on. `HomeView.cohortEligible`, and the one thing that lets the app raise the notification question for somebody who has nobody
- **Guest** — Somebody holding a *seat* in a channel they are not a member of, admitted through a *guest link* or a *guest invitation*; with or without an account here. At most forty at once, of whom at most two may hold a microphone
- **Guest invitation** — An offer of a *seat*, addressed to a contact by name and delivered as a push; unlike an *invitation* it makes nobody a member and spends none of the six, but it does hold one of the forty and is drawn under *Invitations* on the *People* tab. Expires when the room empties, or when a member takes it back
- **Guest link** — A link a member shares that lets somebody open a channel in a browser, with or without an account. Always the browser: the *seat* it produces is openable in the app afterwards, and only for an account
- **The three asks** — What a member may put to a guest, each one tap and none implying the next: *ask them to join* (an account, nothing else), *add contact* (a relationship, no membership), *add to channel* (the membership, which ends the seat)
- **Help** — The screen for asking The Floor a question, reached from Home's *Support* tab; a person answers it in place, under the question
- **Home** — The screen the app opens on and the frame the rest sits in; holds two lists, the *Podcasts* tab and the *Support* tab, not one thing
- **In the app now** — What a *contact*'s row says about somebody who is there: holding a socket, and attended within fifteen minutes. The line under a name, and *Last seen 3 hours ago* is the same line when they are not — one clock, so the two can never disagree. A socket alone until 2026-09-25, which said it for hours about a desktop client nobody was sitting at
- **Invitation** — An ask to join something. Two distinct things can be asked to: the app, as somebody's *contact*, by an *invite link* or an *invitation email*; and a *channel*, by a member — see *guest invitation* for the third, a *seat*
- **Invitation email** — The message a *contact request* sends when the address has no account; twenty a day per sender, and the only thing here that spends money on somebody who is not a user
- **Invite link** — Somebody's standing link, `/i/<username>`, which makes whoever follows it a *contact* of theirs once they are signed in; the same address every time, and the page it opens asks them to install the app
- **Invite pin** — Six digits that used to end an invite link and made it good once; gone since 2026-09-25, and read now only on links minted before then
- **Join link** — `thefloor://j/<code>`, drawn on the community page: what makes whoever follows it a member of the community once signed in. Membership only — never a *contact*, unlike an *invite link*
- **Knock** — A named person at the door via a *guest link*, settled by one member answering
- **Labs** — A per-account gate for the unfinished parts of the app, off by default; **nothing is behind it since 2026-10-09**, when transcripts left, so its switch is not drawn — kept for the next experiment
- **Language** — Which of the two catalogues the app speaks to you in — English or Spanish — as a *Floor Settings* choice: *Automatic*, which is the phone's and is the default, or either one named. Per account, so it follows you to the next device; changing it redraws rather than restarting
- **Leaderboard** — The invitation standings: who is here because of whom
- **Live** — On Home, a channel with somebody in it right now — the top of the priority ladder
- **Lock screen card** — The one piece of this interface outside the app: a Live Activity, up while this device is standing in a channel *and still in touch with it* — ended by the server, by push, when it steps this device out — carrying the channel's name, a microphone glyph that strikes through when you are not being heard and greys rather than disappears when it is refused, an *Out* button that steps you out, and a tap anywhere that opens the app at that channel. iOS only, 16.1 and later, and the microphone and Out buttons 17 and later
- **Marketing email** — Permission to write to somebody about the application rather than to sign them in: offered as a checkbox at sign-up and as a switch on *Floor Settings*, which is the only place it can be withdrawn; so far unspent — nothing sends any
- **Member** — A user with an account who belongs to a channel; the guest-facing word for *participant*. Having an account does not make you one — see *the three asks*. A *community*'s members are not one another's contacts
- **Motion to remove** — One member's open proposal that another be removed, carried the moment a second member agrees and lapsing after a day; withheld from the person it is about, withdrawable by whoever moved, and impossible in a channel of two
- **Removal notice** — The card on the *Channels* list telling somebody a channel's members removed them, and the only account they are given of it; it names the channel and names no member, and *Close* deletes it for every device
- **Refusal** — The server's sentence for a channel action it would not take, shown as a card at the top of that channel — *That did not go through*, the sentence, *Got it*. Not a greyed control, which is the same rule seen before the press; a refusal is a race the greying lost. Held on this install only, unlike a *removal notice*, and only the registry's refusals: one by a reducer guard says nothing on the wire
- **Nearby / Stepped out** — The two things a roster card says about somebody who is not here; *nearby* is now also something you can declare and step out of, declaring it is an arrival — it notifies the absent, dates *stepped out* from the tap, and restarts its own clock when tapped again on the rung — and it says in a line who arrived rather than stepping you in or asking whether to; stepping into one channel leaves you nearby in the others rather than stepped out of them, five at once being the limit and a sixth evicting the oldest; Home pins a bar for each channel you are nearby in, beneath the one you are present in and alongside it, and hoists a channel nobody is in but somebody is beside
- **Offline** — Not a word about the network but a state: the socket to the server gone for ten seconds, at which point queued actions are discarded and the app becomes one screen saying so — except on a device showing a film, where a playing film goes on over that screen under a strip saying the same. The media room is a separate connection and may be fine, so you can be offline and still hear the room — what it means is that nothing can be *changed*, the microphone included
- **Owner** — Whoever made a channel into a *community*, and the only one in it who holds the controls (`holdsTheControls`): invitations and guests, removal, media and recordings, muting anybody else, the name and description, the link, deleting. Other members mute themselves, claim the floor, use the clipboard and ping. Cannot leave or be moved against. No other channel has one
- **Ping** — A notification to one person in a channel who is not there, saying somebody wants them; sent only from the room or beside it, by somebody *present* or *nearby*, and only to a contact; its words stay on their profile card while the window is open
- **Present** — In a channel, able to hear and be heard, right now: holding a connection to its media room
- **Podcast** — What a *public channel* is called on screen, since 2026-10-04: *This channel is a podcast* on *Channel Settings*, where it was *Public page*. Never a *community* too. `public` in the code
- **Public channel** — A channel that has given itself a *public page* — a *podcast*, on screen; any member may, a channel must be named first, it cannot be a *community*, and it puts nothing on that page by itself
- **Public page** — A channel's page on the web, at an address carrying its id: its name, its *description* and its *published* recordings, readable by anybody and naming no *member*
- **Directory page** — `/podcasts`: every *public channel*, in one list a stranger can read. Not a *podcast directory*, which is Apple's or Spotify's and is somewhere this project has never submitted anything
- **Podcasts tab** — Home's third tab: the *directory page* itself, in a frame. The app shows the server's document rather than a second rendering of the same list, so the two cannot disagree. Drawn in Home's body on a phone and in the pane beside it on a wide screen, a document being the wrong shape for a 360pt column
- **Public notice** — The card telling a member their channel has a *public page*, drawn above the *channel tabs* until they say they have read it: owed to everybody except whoever turned the switch on, owed again after a channel goes private and comes back, and a notice rather than a veto — nobody is asked to agree, and the page is up either way
- **Published** — A *recording* anybody at all can hear. It goes up when every *participant* has *agreed to publish* it and not before, and comes down when any one of them takes that back — which reaches no copy already downloaded
- **Agree to publish** — One person's consent that one recording may be *published*; everybody whose voice is in it must, and any one of them may take it back at any moment. A *guest* with an account is asked per recording like a member; one without is asked once, at the microphone — see *speech consent*
- **Speech consent** — What a *guest* with no account agrees to, on the page, at the moment they ask for the microphone: that a recording their voice is in may be *published*. Not a condition of being heard, withdrawable while the seat lasts, and gone with the seat — the only consent here that is not per recording, because a seat is the only thing there is to ask
- **Cover art** — A *public channel*'s square image, shown on the page and carried in the *feed*. Square, 1400–3000 pixels, JPEG or PNG, no transparency — Apple's rules, refused at the upload rather than at a submission
- **Feed** — The *public page*'s machine-readable half, at the same address plus `/feed.xml`: what a podcast app subscribes to, listing the same *episodes* the page does
- **Podcast directory** — Apple's, Spotify's, and the rest: somewhere a *feed* is submitted, reviewed and then findable. Nothing here does it; what needs doing is a person pressing a button. Not the *directory page*, which is this server's own
- **Episode** — A *published* recording as a listener meets it: the same floor-gated mix the app plays, re-encoded as M4A because no podcast client plays Ogg/Opus
- **Episode start** — The unit the public podcast is counted in: one read of an *episode*'s audio that begins at the first byte and asks for more than a probe's worth. A count of starts and never an audience — a replay is two, a podcast app that downloads and never plays is one — and it holds nobody at all
- **Record (the tab)** — What was kept of a channel, as a log laid out in *rooms*: the *live transcript* as plain lines under each speaker's name and time, each *recording* a muted line where it began that opens to its actions — one from before rooms standing as a room of its own —, each room headed by a line with its date, hours and share that is pinned once it scrolls off, and the *Audio* and *Text* switches pinned over it all. The noun, not the verb on its Record button. *Recordings* and *Transcript* until 2026-10-09, and *Conversation* that day
- **Audio and Text (the switches)** — What a channel keeps of what is said, as two switches pinned on the *Record* tab, radio style — one, the other or neither, never both: *Audio* is a *recording*, *Text* the *live transcript*; Pause beside them holds whichever is running and Resume restarts only what it held. Since 2026-10-09, replacing the Record and Pause buttons and the *Live transcript* setting. `KeepSwitches`
- **Record automatically** — A channel setting: the room's first recording begins by itself, and only its first
- **Recording** — Audio kept from a channel, started by anybody present by switching *Audio* on and ended by switching it off — a Pause between holds it and keeps it one recording, joined without the gap; each one a segment of the *Record*
- **Seat** — A guest's standing in a channel: a place to return to, rather than a membership. A *guest invitation* is a seat nobody has taken up yet. Opened in the app when it has an account behind it, in a browser when it does not
- **Self-mute** — A microphone closed by hand rather than by the floor; anybody in the room may close yours, and only you can open it again
- **Share** — Handing a copy of a *recording*, a *room*'s recordings back to back or its live transcript as text, a *transcript* or the channel's track to whatever else is on the device; called *Export* until 2026-09-12
- **Step in / Step out** — Entering and leaving a conversation without leaving the channel; stepping in claims the phone's audio system outright, and stepping out is also how a declared *nearby* ends
- **Standing elsewhere** — The room you are in, seen from a device that is not the one holding it: since 2026-09-25 Home pins it there too, in the live bar's shape and hue, with a hollow dot and *On another device* in place of *tap to go back*. Presence is the account's and is held by one device, and before this the other devices of one account pinned nothing at all — the same person, the same moment, two different lists of hoisted rooms. A tap opens the channel and never steps in; moving the room is *In* on the channel's own screen, which displaces the device that was holding it
- **Support tab** — Home's last tab: *Help*, *Chip in* and whatever else is about the application rather than about anybody you can reach
- **Transcript** — Text made from a recording, on request, by a provider; behind *Labs* from 2026-09-06 to 2026-10-09, and behind nothing now
- **Live transcript** — What is said in a channel, written down as it is said, with no recording: switched on per channel by somebody on the house with the *Text* switch on the *Record* tab (`ChannelState.liveTranscription`), shown in the *Record* tab as one history, and announced by a *Transcribing* pill where the recording's goes. Since 2026-10-09
- **Transcribing** — The header pill, and the seat page's sentence, saying the room's *live transcript* is listening: the recording's red and the recording's place, no clock, and drawn only while no recording is, the recording saying the same thing already
- **Transcription model** — A channel setting, *Standard* or *Pro*, naming the grade of speech model a *recording*'s transcripts are asked for — not the *live transcript*, which streams on a model of its own; *Standard* unless a `debug` account chose otherwise, and the only accounts shown it. `transcriptionModel`
- **Username** — A name for somebody, unique across everybody, written with an `@`. Derived from their *display name* at signup, editable on the Contact screen, and can be given up
- **Voice** — One speaker within a transcript, which since 2026-10-09 is exactly one *stem*: labelled with its owner's display name, or *Played audio*, and never renamed
- **Waiting bar** — A pinned line on Home saying somebody has asked something of you, since 2026-09-23: one for the *contact requests* you can answer, one for the *invitations*, neither drawn when there is none. It carries the sentence and not the controls — a tap goes to the list that holds the row, the way the *live bar* goes to the room — and it exists because an account invited by email arrives with a request already pending, on the tab Home does not open on, marked by a *dab* that is deliberately not a sentence. `WaitingBar` in `ui/HomeView.tsx`
- **Watch party** — Shared playback in a channel; behind *Labs* until 2026-09-18, and behind nothing now. A mode rather than a cargo: while a film is loaded no recording may be begun, and the film is unloaded when the *room* ends (since 2026-10-09), and while one is *playing* no *floor* may be claimed — the floor asked about the load too until 2026-09-24, which left a film paused at its own end refusing every claim in that channel for ever. Against the shared track it is the two *transports* that are exclusive, since 2026-09-20 — both may be loaded, neither may play while the other does, and pausing is the way out of either. The transport is the app's own row on every device, the film's own bar being off since 2026-09-18, and every control on it asks presence — driving as well as starting, since 2026-09-20
- **Screen** — The app instance showing a party's film; any device you are signed in on, moved by whichever single offer applies — *Watch on another device* where the film is, *Watch on this device* where it is not, and *Watch on this device* bare where no device of yours has it at all (since 2026-09-24; nothing at all only when you have stepped out); a switch showing both until 2026-09-23, and on Home a pinned bar making the same claim from the device you have walked to, and which moves while the film is playing — it refused to until 2026-09-23, on an argument about mid-scene confusion that a measurement retired. Given up when the account leaves the room — and, since 2026-09-20, by *Other device* on a *second device*, which hands the film to whichever device is standing in the channel without stopping it, and is the one way to stop watching that leaves your standing in the channel alone
- **First device / second device** — The two instances a party can be spread across: the *first* holds the presence and every control of the channel, the *second* is the *screen* and holds the film. Not stored anywhere — the second device is simply the screen that is not *stepped in* — and since 2026-09-20 it draws a view of its own rather than the channel screen: the picture, the transport, *Full screen* and the three rungs, and nothing else of the channel or of the party — no *Home* — the way to stop being the second device is *Other device*, under *Full screen* — no corner to float into, and no channel list beside it however wide the window; a film sent here subscribes this device to the channel and opens it on *Watch*, taking the device over whatever it was showing — another channel, the channel list, a settings screen, a transcript, a profile — and only the server's ask counting as an arrival
- **The picture** — Where a party's film is drawn on the device showing it: a pinned row under the tabs on *Watch* — or under the header alone on a *second device*, which has no tabs — or a column beside its transport where the pane is wide enough (see *watch shape*), a small draggable rectangle resting in one of the four corners of the application everywhere else — and that corner only while the film is *playing*, a paused one being hidden rather than parked over another tab — or *full screen*. Mounted above the route table for as long as this device is the *screen*, so since 2026-09-19 neither leaving the Watch tab nor leaving the channel stops a film — Home and the settings keep it in the corner, and going *nearby* or *out* is what stops it. It neither mounts nor plays for somebody who is not in the room — *nearby* and *out* both fail that, a *guest* passes it — and that is a precondition on drawing it rather than a rule that fires afterwards
- **Full screen** — The film filling one device. Two ways in, and a surface gets whichever it can perform: the *Full screen* button on the watch card everywhere, and on a *handheld*, *turning* the device sideways — unless the film is an *upright film*, which has only the button. *Exit full screen* on the scrim leaves — except on a turned handheld, where it is not drawn and the wrist is the way out. On the scrim, the transport and that button and nothing else, fading after three seconds and back at a touch anywhere; the channel's own bar and *Back to portrait* both went on 2026-09-20. Three automatic collapses besides. One device's own business and never the party's
- **Handheld** — A window whose short side is under 500 points, which is to say one somebody is holding: every iPhone in either orientation, a phone browser, and nothing else this app is opened on. The one surface this app turns — see *portrait lock* — a tablet and a browser window being landscape sitting still. `isHandheld` in `ui/layout.ts`; a different question from the layout breakpoint, which a phone on its side is already past
- **Turned** — A *handheld* whose window is landscape, which on a handheld can only mean somebody turned it: nothing else this app runs on is handheld, and a handheld is locked upright away from the film. It is the whole state of *full screen* on a phone — `isTurned` in `ui/layout.ts`, read at render rather than stored, so the picture and the glass cannot disagree
- **Watch shape** — How the *Watch* tab lays itself out at a given size: one column with the picture above its transport, or two with the picture beside it, and in either case how big the picture may be. Decided from the pane's width and the body's height and from nothing the answer itself moves — *two columns when the controls would not otherwise fit* oscillates. `watchShapeFor` in `ui/layout.ts`, and STYLE.md § *The watch body has two shapes*
- **Portrait lock** — The rule about which way up a phone may be: a *handheld* is upright everywhere in the app except *at the film* — the watch card with a film this device can expand, and *full screen* — where both orientations are permitted — unless the film is an *upright film*, which keeps the phone upright there too. A tablet and a browser window are never turned. It is what makes *turned* readable as a gesture, and narrowing it from *full screen alone* to *the film* is what gave the turn back its way in. `usePortraitUnlessAtTheFilm` in `watch/orientation.ts`; on the web a no-op
- **Upright film** — A film whose link is a `youtube.com/shorts/` link, which is what a Short's own *Share* hands out: the phone stays upright for it on the card and in *full screen*, so turning does nothing and the button is the way in and out. Read off the link because the player reports no dimensions and asking YouTube is refused; a Short pasted as `watch?v=` plays as any film. `isUprightFilm` in `core/watch.ts`, since 2026-09-29
- **Film title** — What the video is called, drawn under the progress bar on the watch card since 2026-09-20; learnt from the first player that can say *while it is showing the film*, the way its length is, and never asked of YouTube
- **Showing the film** — Whether what is in a player's frame is the party's video or a pre-roll in front of it, which decides whether the follower speaks to it and whether anything is learnt from it; by the video id the player names since 2026-09-23, by comparing lengths where there is no id. `showingTheFilm`
- **Watched before** — The films a channel has watched, newest first, offered back on the watch card as rows to press since 2026-09-22; a property of the channel rather than of any person, deduplicated by video and ten deep, holding whatever each party managed to learn about its name and its length before it ended. A row is pressed the way a link is pasted — it carries the stored URL back through the same parse — and the list stands behind a press on an idle card and open behind *Change video* on a loaded one. `WatchState.history`
- **Watching (on the roster)** — That somebody has the film up on one of their devices, said as a suffix on their roster card since 2026-09-20; the account and never the device, drawn only while the film is *playing* — a pause is when nobody is watching — and a wider fact than *watching here*, a *second device* being on this and not on that. Since 2026-09-26 the other answer is said too: a member *in the room* without the film up reads *not watching*, the blank having meant both that and *this roster does not report screens*; withheld from a guest and from a server that does not send the field, neither of which can be denied honestly
- **Watching here** — Your screen and your voice on one device, which mutes the room

**Words that exist only in the codebase**

- **Address** — What a URL says: which list the tier is showing, and what is open over it
- **Starting line** — The contact count an account's *introduction* began from, latched at its first Home snapshot and again on *Show the checklist again*; *get somebody here* ticks when the count has gone above it. Replaced *arrival (invited / alone)* on 2026-09-13
- **Attention** — Whether somebody is at their app, and at a channel in it: frontmost on a phone, a hand on it in a browser, and never the audio. Two server-held clocks of different scope from one report — per person per channel, which the roster's *nearby* line counts, and per person, which is what *in the app now* means; *stepped out* counts presence instead. One window governs both, so a roster and a contact row cannot describe the same silence differently
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
- **Excess flag** — A row the excess monitor writes when one caller — an account, or an address when signed out — asked far more of one route in an hour than everybody else did: past a floor, and ten times the median — or, as `unbudgeted`, made one lookup the accept route's spent budget let through free. A question for a person, surfaced only by `bin/usage excess`; it never refuses anything
- **Expired (build)** — An install below `MIN_SUPPORTED_BUILD`; it replaces itself with an update screen
- **Follower** — The code on each device showing the film that keeps its YouTube player doing what the room is doing: `useFollow` in `watch/drive.ts` over `stepFollow` in `core/watch.ts`; it follows presses and the room's state, never the room's clock, since 2026-10-03
- **Growth classes — alone, first circle, onward** — The three cohorts `bin/growth` sorts every account into, by its depth in the invitation forest
- **Guard** — An exported `can…` predicate in `core/channel.ts` — `canClaimFloor`, `canPasteClip`, `canManageGuest`
- **Guess (a credit)** — `invited_via = 'inferred'`: credit worked out from somebody's first contact rather than from a record of an invitation, and the one kind that may be wrong
- **Present or empty** — `presentOrEmpty` — you are in the channel, or nobody is; *has the room* (`hasTheRoom`) until 2026-10-09
- **Hearing (a device's)** — `Hearing` — who in the media room is publishing audio and which of them this device is subscribed to; read off the room, the only account of what LiveKit actually did with a subscription, and nothing to do with *reach*
- **Heartbeat** — `STILL_HERE`, sent per channel while somebody is in one
- **Identity** — The string a participant publishes under, and the key a *stem* and transcript line file under
- **In-app** — `ContactView.inApp` — whether somebody holds a socket right now
- **Installed (web app)** — A *train* put on a home screen or dock by the browser; it reports `display-mode: standalone`, gets an icon, and still cannot notify anybody
- **Intent (a watch party's)** — *Retired 2026-09-18.* The video's own bar was a second way to press the transport, read off the player because the IFrame API never says what caused a state change. Telling a thumb from the echo of the app's own command took four phases and seven constants and failed five times; `controls: 0` removed the surface instead. The transport is the app's own row, and a button press *is* an action
- **Introduction** — **Not drawn since 2026-10-08**, pending a replacement (`task/replace-the-getting-started-checklist.md`); the ladder is still computed and the rest of this describes it. What a new account is shown above both lists until every rung of it is done *or dismissed*: one ladder, the same for everybody — get somebody here, step in with somebody, an install rung in a browser that can, and four things to try inside a channel that are the only rungs the server had to be taught to record; one rung is drawn in full — the next one — and every other rung, done or still to do, is behind *See more*, which since 2026-09-24 is where the ticks live too. Held back entirely while a *waiting bar* is up, an account that has not answered the person who brought it here having a shorter job to do first
- **Island** — A connected component of the accepted-contacts graph: people who can all reach each other through mutual contacts
- **Ladder (the follower's)** — What a *follower* climbs while its player does not agree with the room — told, told again, seek and play, rebuilt, given up — each rung entered when the one below runs out of time; at rest only in agreement or at the top, which is said on the picture
- **Live channel** — `liveChannelView` — the channel this *account* is standing in, across every snapshot held
- **Media plane** — LiveKit — `livekit-server`, `livekit-egress` and Redis — plus the S3 bucket recordings land in
- **Mix** — The single file a finished recording becomes, made from its *stems*
- **Mute (four things, one word)** — The word does four jobs and only the first is the user's; they are separated in the entry
- **Nav action — `home` / `swipeOut` / `swipeIn` / `liveCard`** — The four ways between Home and the channel you are standing in, named so they can be counted against each other: the Home glyph and the right swipe are the same journey out, the pinned live line and the left swipe the same journey in — the swipe going to the topmost hoisted bar, which is the live line whenever one is drawn. Named by the *control* rather than by the outcome, because two of them mean the same thing to the application and differ only in what the thumb did, which is the whole question. Counted in `nav_counts`, which holds no account — so it can say which way is common and can never say what any one person did
- **Notification kinds — invited / arrived / accepted / pinged** — The four things this server sends to a phone; only *pinged* is words somebody wrote, and only *accepted* is about a person rather than a room
- **Notification answer** — `accounts.notifications` — whether the app may reach somebody when it is not running, as their client last said: granted, undetermined or denied, and **null for nobody has said**. Not the same fact as holding a *device token*, which proves only the first
- **Paused (of arrivals)** — That the server has stopped announcing arrivals to somebody who was sent them for a week and never opened the app, until they do; `NOTIFICATION_PAUSE_MS` and `accounts.unanswered_since`. **Arrivals alone**, both in what is withheld and in what counts towards the week — the other three kinds are one person aiming something at another and go on being sent. A state the server infers, and the only one that makes the app quieter without anybody choosing it: not a *notification level*, which is a choice, and not a *notification answer*, which is the phone's
- **Unanswered (of an arrival)** — Announced to somebody who has not been seen since; the oldest one outstanding is `accounts.unanswered_since`, and a week of it is what *paused* measures
- **Funnel level** — One of the fourteen steps in MARKETING.md between an impression and a recommendation; the code knows four of them by number — 3 in `accounts.notifications`, 4 in `bin/cohorts`, 9 and 10 in `pings`
- **Participant** — `ChannelState.participants` — everybody who belongs to a channel, initiator first
- **Playback blocked** — A browser refusing this page permission to make sound; lifted by a real gesture and by nothing else, and always false on a phone
- **Placed** — A player seen where the room is since the room's position last jumped; owed one seek when it is not — arriving, rebuilt, back from an advert, after a scrub or a replay — and none after, drift being corrected by nobody
- **Playout** — Whether this device is actually rendering the audio it is subscribed to
- **Promotion (of the audio session)** — A stepped-in device going from `LISTENING` to `CALL`, taking a microphone it did not hold — the film leaving it, a guest granted speech. *Deferred* while the app is backgrounded, since iOS refuses a backgrounded app a new microphone: it stays on `LISTENING`, hears the room, and promotes at the next foreground. Not stepping in, and not a session already `CALL` going to the background, which keeps what it has
- **Protocol** — `core/protocol.ts` — the wire
- **Pump** — `PlaybackPump` — what *produces* shared playback, as distinct from publishing
- **Reconcile / restate** — Comparing what was stated to the media plane against what the room carries, once a tick
- **Reported call** — A step-in reported to iOS through CallKit as an *outgoing* call, whoever arrived first, shown under the *channel title* and lasting exactly as long as `mediaRoom` — never cycled by a reconnect (`modules/reported-call`). It buys Recents and the green pill and has no call screen, Channel View being that. Its muted flag, which CarPlay and the Watch show and set, follows the lock screen card's mute both ways. Not `CALL`, which is an audio session configuration
- **Restore** — Reviving every unended channel from its state blob at startup
- **Room** — One LiveKit room from creation to deletion: a channel's sitting, first step in to last step out (`rooms`, `RoomView`), the unit the *Record* log is laid out in and whose audio is shared whole. `mediaRoom` is the name a channel's rooms are opened under. Since 2026-10-09 it means nothing else: the people present are *here*, their sound is *everyone*, and *has the room* is *present or empty*
- **Root** — An account at depth 0 in the invitation forest: the top of a tree, whatever grew under it — most grow nothing
- **Reach** — How many people somebody can get to through contacts, counting themselves and counting *pending* rows as edges, bounded by whatever limit was asked. One of the two things a *getting-started channel* is gated on — notifications being the other — and deliberately **not** the *island* of `bin/growth`, which walks accepted edges alone
- **Run** — One recording from start to stop, identified by a `runId` the server mints
- **Seat (developer sense)** — The durable half of a guest: a `guest_sessions` row with a secret and an expiry
- **Session (auth)** — One sign-in, and so in practice one device: a row in `tokens`. Several per account since 2026-08-24, and anonymous by construction
- **Session want — `call`, `listen`** — What this app is asking iOS for, decided in one place (`wantFor`): `call` captures, `listen` only hears — a guest without speech, a device *watching here*, a deferred *promotion*; being in no room asks for nothing
- **Silence notice** — `SilenceNotice` — the server's record when a restoration missed, when a room is still not restored ten seconds after a release, or when an *unheard report* arrives; kept a week in `silence_notices`, read by `bin/diagnostics`
- **Silenced** — Derived from `floor.holder` rather than stored: you are silenced iff somebody else holds the floor
- **Snapshot** — One `ChannelView` or `HomeView` pushed over the socket
- **Speaking report** — A *withheld* speaker's own device saying it is talking, because no other device can see it
- **Stem** — One participant's isolated audio from a recording, uploaded by its own *egress* job
- **Switchable set** — The developer's own accounts, by address in `SWITCH_ACCOUNT_IDENTIFIERS`, any of which may become another from *Floor Settings* without a code (`POST /auth/switch`); never a review account, whatever `.env` says. `server/src/switching.ts`
- **Train** — A deployed build of the web app: `/app` (stable) and `/beta` (TestFlight)
- **Transport** — Two things, kept apart: the row of play, pause, ±15s and the scrubber (`WatchTransport`, the only way to drive the film), and the room's playback state it drives (`WatchState`'s status, position and start), which every *follower* follows
- **Unheard report** — A *listener's* device saying it has gone five seconds without a subscription to somebody in the room, publishing and not *withheld*; logged and changes nothing. Not a *speaking report*, which is the withheld speaker's own device
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

**A user-facing term is renamed in both languages or in neither**, added
2026-09-23 with Part Three. The Spanish is a decision about the vocabulary and
not a translation of a string: it is settled here, once per term, and
`app/src/i18n/es.ts` implements what this says. A word changed on one side
only is the same lagging source of truth the paragraph above is about, one
language further in.

**It is not an index of the code.** Where the reasoning behind a term is long,
the entry says the term's meaning in a sentence or two and points at the file
that argues it — usually STATES.md, decision/, or the type's own
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
`decision/2026-09-21-asking-somebody-in-as-a-guest.md`.

Never called a *room* on screen. See *room* in Part Two, which is the media
plane's word for the audio underneath a channel and is a different thing.

## Channel name

What a member has called a channel, and only that: `channel.name`, set on
*Channel Settings* under **Channel name** — *Nombre del canal*. Most channels
have none and are **unnamed**, and that word stays literal: an unnamed channel
has no name. It still has a *title*, below, which is what every surface shows.

**Do not say *name* for what a surface shows.** That is the title. Saying
*name* for both is what made *unnamed channel* read as a contradiction. On
2026-10-08 this file briefly called the two *given* and *derived* names, and
the title is what replaced that.

## Channel title

What a channel is shown as, everywhere — the channel header, the list row, the
profile card, the lock screen card, and the *reported call* in Recents: its
*name*, or, for an unnamed channel, who else is in it, by display name, from
`describeChannel` in `core/naming.ts` — one name, a pair, or two names and a
count. **Every channel has a title**, named or not, and no surface shows the
raw field: a heading of `null`, or of nothing, is worse than who is there.

**An unnamed channel's title is the viewer's own.** It leaves the viewer out,
so the same channel reads differently to each member, and it changes as people
arrive and leave. A named channel's title is its name for everybody.

`channelTitleFor` in `app/src/state/useLockScreen.ts` is the rule for the lock
screen card and the reported call. The header, the list row and the profile
card write the same two terms inline. The strings already say `title` where
they take one (`liveBarLabel`, `standingElsewhereLabel`, a row's label).
**Three fields still say `channelName` while holding a title**: the lock
screen card's state, its ActivityKit attributes in
`modules/live-activity`, and a seat's view. The widget extension decodes the
first two by that key, and the third crosses the wire, so renaming any of
them is a compatibility change, not a rename.

Named 2026-10-08, when the reported call took its label from it and *channel
name* had come to mean two things. *Título* in Spanish, against *nombre* for
the name.

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
planning/decision/2026-09-08-the-tier-says-which-room-you-are-in-always.md.

## Channel tabs

**The six views of a channel**, one at a time, on the switch a channel screen
draws: *People*, *Clipboard*, *Invite*, *Record*, *Listen*, *Watch* —
the same six always. For one day, 2026-10-09, there was a seventh, *Transcript*,
offered while a *live transcript* was on; it went into *Conversation*, now *Record*,
with *Recordings* the same day, and the strip stopped changing length.
Peers, in the way *Channels* and *Contacts* are on Home — none is a child of
another. A glyph and a word each, since 2026-09-12, built the way the channel
*footer*'s controls are.

**Who, then what.** The first three are the people — who is here, what
somebody in the channel has just handed everybody else (the *clipboard*), and
how somebody who is not here gets in. The second was *Notepad* until
2026-09-27 and held the *description* above the clipboard; the description is a
setting again, and the tab is named after the one card left on it. The last three are what the channel
is carrying, which outlives the moment: what was said, what is playing, what
is being watched. The recording transport has been with the recordings since
2026-09-12 — it was a second card on *Listen* until then, on the reasoning that
recording is what playing is doing to the room, but the tab somebody goes to
about a recording is the one that holds them — and since 2026-10-09 it sits
under the *Record* timeline rather than above a list. Neither it nor the
shared track's card carries a label over it: the tab is the heading where a
tab holds one thing.
*Watch* being last is also what keeps the other five still, it being the only
one that can be absent.

**The first is *People*. It was *Roster* until 2026-09-14 and *Members* until
2026-09-22.** *Roster* was the only tab named after a thing rather than after
the people or the object it holds, and it was a word this app used nowhere a
user could see it — the vocabulary a screen teaches should be the vocabulary
the rest of the app answers in. **And it does not translate**, which was the
reason that reached none of the three places that rename was written up and is
the one that decided it. Part Three below is where that reasoning ended up
once the app actually had a second language;
`decision/2026-09-23-every-word-the-app-says-is-a-function.md` is the pass
that settled it.

*Members* was narrower than its contents deliberately, on the grounds that a
guest is a visitor to a membership rather than a second kind of it, and that
the heading over a list of people should say whose room it is. **Guest
invitations are what ended that**: an invitation is neither a member nor
anybody in the room, and it made a fourth kind of card in an unlabelled stack.

So the tab names the container and **each group carries its own label** —
*Members*, *At the door*, *Guests*, *Invitations* — drawn only when there is
somebody in that group, except *Members*, which always has somebody in it and
which now teaches the word the tab used to. *Invitations* was named on
2026-09-22 and drew nothing until later the same day, when a pending
*guest invitation* reached `ChannelState`. The vocabulary is not lost by the
rename; it moved one level in, to where it is said about the right people.

**The Spanish for all four is in the comment over them** in ChannelView.tsx,
because one of the four was chosen around it: *invitado* is both *guest* and
*invited*, so the pending-seat group is *Invitations* — *Invitaciones*, clear
of *Invitados* — rather than *Invited as guests*, which renders as *invitados
como invitados*. See *member*, which is the term *Members* spends on a second
thing.

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
See planning/decision/2026-09-13-the-channel-tabs-stay-at-the-top.md.

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

See planning/decision/2026-09-12-the-channel-screen-is-six-tabs.md.

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

**The sound a device makes when the room changes shape, when a recording
begins, or when the party's film starts or stops.** Two notes rising when
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
rather than decisions. See `decision/2026-09-17-the-chime-follows-the-room.md`.

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
`decision/2026-09-17-two-chimes-at-once-are-a-chord.md`.

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
`decision/2026-09-17-a-recording-somebody-started-says-so-out-loud.md`.

**A fifth and a sixth since 2026-09-26, and they are the *film*'s.** A falling
octave — A5 then A4 — when a **watch party**'s film starts playing, and a
rising one when it stops.

**What they say is what happened to the room's voice, not what happened to a
video player**, and that is what decides which way each goes. A running film
shuts every microphone in the channel — the run is *enforced*-muted for its
length, see *watching here* — and a pause gives them all back. So the room's
voice leaves on *play* and arrives on *pause*, which is the direction *out* and
*in* already mean, an octave down. Somebody who would "correct" this to
rising-for-play is correcting the film's transport, which is not what is being
announced.

**A4 is the whole of why they are distinguishable.** Every other kind lives
between C#5 and A5, so a fifth sound in that band is heard as a variation on the
four already there — which is exactly how *nearby* came to sound like arriving.
A note an octave under the lot of them is not a variation, and A5-against-A4 is
also the widest interval the table draws, against the fourth that *in* and *out*
span.

**What they are for is the ear that cannot see the transport**, which during a
party is most of the room: the conversation simply stops, and until these
existed nothing said why. The pocket case is ordinary rather than an edge — a
stepped-in phone goes on running while backgrounded because the call keeps it
alive, so the room genuinely falls silent in somebody's hand. **Everybody
present hears both, whoever pressed the button included**, on the recording
chime's reasoning rather than the presence chimes'.

**Two sounds over three states.** A film is *idle*, *paused* or *playing*, and
only the third takes anything from anybody, so every edge into *playing* rings
the first and every edge out of it rings the second. A link merely pasted is
silent — a party is loaded *paused* — and so is a paused party being stopped.
**A stop and a film reaching its end both sound like a pause**, deliberately:
what the sound says is *the room has its voices back*, which is equally true of
all three ways out, and a listener who cannot see the screen has no use for a
third cue to tell them apart. See
`decision/2026-09-26-the-film-says-when-it-starts-and-stops.md`.

**On the screening device the two chimes are ordered against the audio
session, and in opposite directions.** A chime is an `AVAudioPlayer` playing
into the session this app holds, and *watching here* is precisely the state in
which this app gives that session up — so a chime fired on the edge of a run is
fired into `playback`, or into a session the `WKWebView` has taken, and is
lost. The play chime is therefore sounded **first** and the microphone released
after it, which `filmStart.ts` does by holding the device for the length of
the sound, whether the Play was pressed here or came from the room; the pause chime is sounded **last**, waiting out the ~700ms retake
that brings `playAndRecord` back. A play chime cannot be deferred — late, it
announces a film that is already running — and a pause chime that waits more
than two seconds is thrown away rather than played late. **Nobody else waits**:
a phone in a pocket is present without watching here and never leaves
`playAndRecord`, and a *guest* without a speech grant is on `playback`
throughout, so the gate is *did this device hand its session over* rather than
*what category is it in*. See
`decision/2026-09-28-the-film-chimes-wait-for-the-session-they-are-played-into.md`.

**It is not in the media room**, and that is the distinction the word has to
hold. Nothing is published into LiveKit; each device makes its own sound about
other people, so it is absent from recordings, absent from transcripts, and —
the rule that decided the whole design — for the three presence kinds, **never heard by the person it is
about**. You know you walked in; the recording chime and the two film chimes
are the exceptions, and both say why above — in each case the sound is the
moment the room was told rather than feedback for whoever caused it. See
`decision/2026-09-14-the-room-says-who-came-and-went.md`.

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
`decision/2026-09-15-the-chime-has-one-loudness-again.md`.

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
`decision/2026-09-17-the-chime-is-not-an-alert.md`. `usePresenceChime` is the
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
decision/ § *An address names a place and never an id*.

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

## Community, owner, community link, community page, join link

**A *community* is a channel with an *owner*, which anybody holding its link
may join.** Contents private, door open — the other kind of public, beside the
*public channel*'s podcast sense, which is why it could not be called that.
It holds up to twenty members where a channel holds six (`capacityOf`), and
nobody in it need be anybody's contact.

**The owner is the one bend in the no-admin rule, and since 2026-10-05 it is a
wide one: the owner alone holds the controls** (`holdsTheControls`). Who gets
in — inviting, guest links, answering a knock, managing guests — and who goes,
removing a member in one move with no *motion to remove*; what plays, the film,
and recording, including *Record automatically* and changing a recording;
muting anybody else; the name and the description; the link; and deleting the
community at any size. **Every other member mutes themselves, claims and
releases the floor, uses the clipboard and pings a contact**, and nothing else
of the channel's. A recording the owner set to start by itself still starts
whoever walks in. The owner cannot leave — deleting
is their way out — and nobody may move against them. **An owner exists only by
*Make channel into a community***, pressed by a channel's one member while
nobody else belongs to it, so nobody is ever subject to an owner they did not
walk in under; it cannot be undone. **A community is never a *podcast***: its
contents are its members', and a podcast's are anybody's. Not a *cohort host*, who has no
powers and is in the channel by configuration.

**Two links, and only the second does anything.** The *community link*,
`/j/<code>`, is what the owner hands out; it opens the *community page*, which
describes the community — its name, description and member count, never a
member's name — and carries the App Store, the *join link* and the web app. The
*join link*, `thefloor://j/<code>`, makes whoever follows it a member once they
are signed in. Both are one code, a slug of the name and a random suffix, so
resetting the link revokes both at once — **and so does renaming the
community**, which mints a code from the new name rather than leave a link
carrying one the community no longer has. A link that is off stays off.

**Not an *invite link*** — that makes a *contact* and nothing else; this makes a
*member* and nothing else. **Not a *guest link*** — that opens a room to a
visitor until it empties; this opens a membership that lasts. A community link
never expires and is not spent by use.

See planning/decision/2026-10-04-a-community-is-a-channel-with-an-owner.md
and planning/decision/2026-10-04-a-community-is-made-from-a-channel-of-one.md,
and planning/decision/2026-10-05-a-community-has-one-name-and-renaming-revokes-its-link.md,
and planning/decision/2026-10-05-a-community-s-controls-are-its-owner-s.md.

## Contact

Somebody you have both agreed to be in touch with. Contacts are mutual;
becoming one comes with a channel for the pair. A *request* is a contact that
has been asked for and not yet agreed — outgoing or incoming.

**Accepting a request opens that channel**, since 2026-09-24: the acceptance
is what creates the place the two of you talk — `ensurePairChannel`, on the
accept route, which has made it from the first and named it in the reply only
since that date — so whoever tapped *Accept* is taken there rather than left
to notice a new row in *Your channels*. It navigates and does not *step in*;
the microphone is a decision with its own control on the screen it opens.

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

**The mark that says something is waiting behind a tab or a control**: a soft
rose disc with an `!` in it, in the top-right corner of the control it is
about — inside a tab's segment, and hung over a button's corner. `styles.dab` in
`ui/components.tsx`, drawn by one `Dab` there and reached
through `badge` — on `Segmented` for whichever tabs `HomeView` asks, and on
`Button` for the one control that wears one.

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
so the disc can go where nothing is lost — which from 2026-09-15 was the
leading edge of the word, and from 2026-09-22 is the control's own corner: a
label is as wide as it reads, so hanging the mark on one put it in a different
place on every tab. STYLE.md § *Dots, pills and rules* has the geometry.

**Two things raise one, and they are not symmetrical.** On *Contacts* it means
somebody has asked to be a contact and it is your turn — live state off the Home
snapshot, so it arrives with the request and leaves when the request is answered,
and nothing is remembered. On *Support* it means an answer to one of your *Help*
questions has come back since this phone last opened that screen — which has to
be remembered, an answered question staying answered for ever. One clears itself;
the other is cleared by being read. `state/helpSeen.ts` argues it, and
`decision/2026-09-15-the-two-dabs-are-not-symmetrical.md` is why.

**The *Support* one is drawn twice, and is still one fact.** The tab wears it
and so does the *Help* card behind the tab, off one condition, because a tab
saying *go and look* onto a screen of four cards is a direction turned into a
search. Both clear together the moment the help screen is opened.
`decision/2026-09-22-a-marked-tab-marks-the-card-it-meant.md` has it, and it
is the only place a control rather than a tab wears this mark: a dab on a
button means *the tab you came through was marked about this*, never a second
thing of its own.

**The *Contacts* one is now said in words above the tabs as well**, by the
*waiting bar*, since 2026-09-23 — and the two are not a duplicate for the
reason the *Support* pair are not: the mark says *go and look*, the sentence
says what is there. The dab still earns its place on the tab a reader is not
standing on; what it could not do is name the person, and that is what an
account arriving to a request it has to go and find was missing.

**Never a count**, deliberately. An outgoing contact request is not in the
Contacts count at all — only the other person can answer one, and a mark for it
could not be cleared by tapping through — and the Support one cannot be counted
without the *Help* screen gaining the unread marks it does not have. What a tab
owes is *go and look*, which is what the `!` says and a number would not.

Rose rather than red: it is good news arriving slightly inconveniently, not a
fault. `waiting` in `theme.ts`, which is the palette's seventh hue and the only
one added since the interface was designed.

## Description (a channel's)

**One line or two saying what a channel is**: a reading list, a few links, the
standing question everybody in it is circling. Plain text, capped at
`MAX_CHANNEL_DESCRIPTION_LENGTH`, shown exactly as it was typed.

**Only a *public channel* is offered a field for it**, on *Channel Settings*,
under the switch that gives the channel its *public page* — which since
2026-09-27 is the whole point of it. Nobody in the channel needs telling what
the channel is; they are in it. The one reader who does is the stranger on the
page or in the *feed*, so the words belong beside the thing that makes those
exist, and a channel with no page is not asked to write a blurb nobody can
read.

**A channel that goes private keeps what it wrote.** The field disappears, the
row is not cleared, and turning the page back on brings the same words with it
— the same bargain taking a page down strikes with the recordings' agreements.

**Anybody with the room may write it**, which is `canEditChannel`: either you
are present in the channel or nobody is. The same gate the channel's *name*
keeps, and for the same reason — what a conversation says it is for is not for
somebody who is somewhere else to rewrite under the people having it. Somebody
without the room sees the field greyed with a line saying to step in, which is
what the name field beside it does.

**It was the *notepad* from 2026-09-12 to 2026-09-27**, and that fortnight is
worth knowing because the vocabulary moved twice. It had been *Description*, a
section on Channel Settings with what it said drawn above the *channel tabs*;
then the rendering moved onto a tab beside the *clipboard*, the two being text
the channel holds at two speeds, the tab was named *Notepad* — a notepad being
a single sheet that gets written over — and the field followed, since a notepad
you must leave the page to write on is not one. What that reasoning left out is
*who the words are for*, which is what brought it back. Gone with it: the
markdown parser and its live preview, dropped on 2026-09-13 and not restored;
the *Edit* the sheet hid behind, a settings field needing none; and the tab's
name, now *Clipboard*.

**It is `description` in the code and on the wire throughout**, and always was.
Renaming it would have been a wire change for a word — see AGENTS.md on never
shipping one to a server before the client can speak it — and for the fortnight
the user's word differed, this section was the record of the mismatch.

**Not a list, and not a message.** *Notes* was considered and rejected for
saying the opposite: one entry per thing somebody wanted to say, kept in order,
each surviving the next. This is one surface, overwritten, with no history and
nobody's name on it. If what you want is to say something to the people in a
channel and have it stay said, that is not this and does not exist yet.

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
what the channel is attending to: shared playback belongs to the floor-holder
while a claim is live.

**The *watch party* transport does not, and has not since 2026-09-18** — this
entry went on saying so for six days. A film's controls are inside the picture
and cannot be taken off it, so a claim did not grey them, it made a visible
control do nothing on somebody else's screen; driving is anybody in the room's.
What a claim does take is *which* film is on. The two are distinguishable
because a claim over a film is reachable at all only since 2026-09-24, when the
floor stopped refusing one over a *paused* party.

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
somebody to a second device: the *language*, the colour scheme, whether the
channel screen repeats its footer's controls as cards, and *Labs*. A tap on a
channel was one of them until 2026-09-21. Below those sit the things
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
`decision/2026-09-15-a-cohort-seat-goes-to-somebody-who-can-be-told.md`.

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
`decision/2026-09-15-a-new-account-does-not-arrive-alone.md`.

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
spends none of the six, and is gone when the room is.

**It does hold one of the forty from the moment it is made**, since
2026-09-22, and is drawn on the *People* tab under *Invitations*. It lives in
`ChannelState.guestInvites`, which is a separate field from `guests` rather
than an entry in it: an invitation is nobody in the room, and everything that
asks who is in the room reads that other field. Until 2026-09-22 it was a row
and nothing else — which kept it out of `participants`, and also out of every
ceiling, so forty offers and forty knocks let eighty claims into a forty-seat
room.

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
*Podcasts* tab and the *Support* tab, with a switch between the four, and above
that the room you are present in if there is one. Settings is Home's rather than either list's,
being about the application rather than about anybody you can reach; *Chip in*,
*Help* and the *Leaderboard* were Home's on the same grounds and are now the
Support tab's.

**Home has no address**, which follows from the same fact and took until
2026-09-04 to reach the code. Each of its tabs has one — `/channels`,
`/contacts`, `/podcasts`, `/support` — and Home is the frame around them, so
there is nothing left for a further address to name: whenever nothing is open,
one of the four is what is showing. The app's `/podcasts` is under the web
app's base — `/app/podcasts` — and is not the server's page of that name at
the root, which is what that tab shows. The `Screen` type called the pair `home` and `contacts` until then,
which was the root-and-child asymmetry surviving one layer up from the boolean
it had already been renamed out of.

**A channel's header names it**, since 2026-09-12: the way off that screen is
a house labelled *Home* rather than the cross every other header draws. See
*Close*.

**It named the channel list until 2026-09-01**, when the two lists became peers
inside it; passages elsewhere that say "Home" for a list of channels are from
before that. Above the width breakpoint Home is the *list* pane and never goes
away, which is what lets *Close* mean one thing in both layouts. See
decision/ § *The tier above both lists*.

## In the app now

**What a contact's row says about somebody who is there**, and the only thing
on Home that speaks about a person rather than about a room. The line sits under
a name; when it is not true the same line reads *Last seen 3 hours ago*, and
when neither is knowable there is no line at all — a non-*contact* is told
nothing, and an outgoing *contact request* is an address rather than a person.

**It means two things at once, and both are necessary.** They hold a live
session socket, and somebody has been attending it inside the fifteen minutes
*attention* runs for. The socket is what makes the words revocable the moment
the app closes; attention is what makes them a claim about a person rather than
about a machine that happens to be powered on.

**A socket alone until 2026-09-25**, which is the mistake worth remembering
because it is the one this phrase invites. A desktop client left open on a
machine nobody was sitting at satisfied the old rule for as long as the machine
was awake, and the row said *In the app now* about somebody who had been
unresponsive for hours. The socket was the right *kind* of evidence and the
wrong question — the fix was not a shorter timeout on it but a different
question, which *attention* was already asking about rooms and now asks about
people. See `decision/2026-09-25-in-the-app-now-counts-attention.md`.

**One clock for the words and the number**, which is the other half of that
correction and the reason it was not a one-line change. The timestamp underneath
used to be the last heartbeat, and a heartbeat under a minute old is rendered as
*In the app now* by the floor in `agoOrNull` — so the sentence would have gone on
saying what the boolean had stopped saying. Both now count from `attended_at`.

**Not the same claim as anything on a roster.** *Nearby* and *stepped out* are
about one room; this is about the application, and would be read as "in this
channel" if it were ever put on a channel card — which is why a third sentence
exists there instead. `ContactView.inApp`, `ProfileView.inApp`,
`describeAvailability`; STATES.md § *In-App* for where the fact is composed.

## Invitation

**An ask to join something**, and the word is one sense over two distinct
objects rather than two meanings. What follows it says which:

- **to a channel** — from whoever actually asked rather than from whoever
  created the channel. It outlives the moment it was sent, so a card says how
  many people are in the channel now rather than claiming somebody is still
  waiting. This is what *invitation* means unqualified, and what the *Invite*
  tab and the *Invitations* group on the People tab are about.
- **to the app, as somebody's contact** — by an *invite link* or an
  *invitation email*. It reaches a person who may have no account at all.

A *guest invitation* is a third and is always qualified: an offer of a *seat*
rather than of membership.

**Read the object, not the verb.** Somebody is invited *to* a thing, and the
things are not alike: one adds a person to a conversation that exists, another
gives you somebody to talk to at all. Two entries in this file were written as
though the second were a misuse of the first; it is not, and the confusion cost
a session in September 2026.

## Invitation email

**The message that goes out when a *contact request* names an address with no
account**, carrying the sender's *invite link* when they have a username and
the door into the web app when they do not. An *invitation* in the second of
that entry's two senses — an ask to the app rather than to a channel — and the
only ask in the application that reaches somebody who is not here, and the only
one that spends money on a stranger.

**It is taken up by signing up**, since 2026-09-25, rather than leaving a
request to be answered: the address was written to, and the person turned up at
it. Which is the same consent an *invite link* takes, by the other road — and
since this email carries that link, the two had to agree or one invitation
meant two things. See
`decision/2026-09-25-an-invite-link-is-a-standing-door.md`.

Which is why it is the only ask with a price on it. **Twenty per sender per
twenty-four hours** — `INVITE_MAX_SENDS` — counted at the attempt and never
refunded, so withdrawing the request does not buy the quota back. A request to
an address that *does* have an account is a push notification rather than a
message, costs nothing, and is not counted.

## Invite link

**A link that makes whoever follows it a *contact* of whoever sent it**, once
they are signed in. `/i/<username>`, optionally carrying `?name=` for the page
to greet its reader by — the username says whose it is and is not secret, and
the name is drawn from the address rather than looked up, so this server never
answers who a username belongs to.

**It is a standing door, since 2026-09-25**: the same address every time, never
spent, never expired. It used to carry an *invite pin* and be good for one
person; what that bought was a limit rather than a consent, which is the
argument in
`decision/2026-09-25-an-invite-link-is-a-standing-door.md`. Following one
twice, or after somebody else has, is not a refusal — it is the second call
finding the pair already contacts.

Not a *guest link*, and the two are worth keeping apart. A guest link opens one
*channel* to anybody holding it, without an account, until the room empties; an
invite link opens a *relationship* and needs an account at the far end. One is a
door to a room and the other is an introduction.

It is sent two ways: copied from the Contacts tab and handed over however you
like, or carried in the *invitation email* that goes to an address with no
account. An account with no username has neither, since there is no link to
write.

**Both ways end in the same relationship**, which they did not until
2026-09-25: an invitation sent to an address is taken up when that address
signs up, exactly as a link is taken up by being followed. Before that the
email's two halves disagreed — clicking the link made a contact, ignoring it
and signing up left a request to answer.

**The page it opens asks for one thing, and since 2026-09-25 that thing is the
install.** It used to lead with accepting in the browser, which cost anybody who
later installed a second sign-in — the same address and the same mailed code,
twice. So the page is now a sentence and one button, and the link is spent by
whichever road the person took: from a browser it rides `sessionStorage` to the
tab the page hands over to, and from a phone it comes back over
`thefloor://i/<username>` when they press *Open in the app* after
installing. Either way the pin is redeemed once there is a session, and the
inviter is a *contact* with a *channel* before the first screen is drawn. See
planning/decision/2026-09-25-the-invitation-asks-for-one-thing.md.

## Invite pin

**Six digits that used to end an invite link**, and made it good for one
person. Gone since 2026-09-25 —
`decision/2026-09-25-an-invite-link-is-a-standing-door.md`. Nothing mints one;
what still reads them serves links minted before that day, and
`planning/SHIMS.md` § *Gate 290* says when that goes.

It was checked only alongside the username beside it, so guessing meant
guessing at one named account rather than at every outstanding invitation, and
it expired after thirty days — which is why every pin that was ever minted is
dead after 2026-10-25.

**What it bought was a limit, not a consent**, which is the sentence the
decision turns on: publishing a link is the owner's half of the ask whether or
not the link has a seat in it.

## Knock

What arrives when somebody follows a *guest link*: a named person at the door,
shown to everybody present, settled by one member answering. It buzzes the
phones of people in the room, since a knock is a question addressed to whoever
is in the channel rather than to whoever has the screen open.

## Labs

**A gate on the unfinished parts of the app**, per account, off for everybody
until they turn it on. **Nothing is behind it since 2026-10-09**, and the switch
is not drawn — a switch that changes nothing is a control somebody presses to
no effect. The setting is still stored, sent and accepted, so the next
experiment has somewhere to stand, and the section in Settings comes back
with it.

Two things have graduated from it: the *watch party* on 2026-09-18 (see
planning/decision/2026-09-18-the-watch-party-comes-out-of-labs.md), and
*transcripts* on 2026-10-09, when the *live transcript* arrived and what is
kept of somebody's speech stopped being something they had to opt in to read.

It is a gate, not a preference: while something is behind it, the section is
not on the screen at all for somebody with it off — no greyed buttons, no
empty cards. See `labs` in core/settings.ts.

## Language

**Which of the two catalogues the app speaks to you in**, chosen on *Floor
Settings*: *Automatic*, which is the phone's own language and is what every
account has until somebody says otherwise, or *English* or *Español* named
outright. The two languages are named in themselves in both catalogues — the one
person on that screen who cannot read the language it is drawn in is the person
about to change it — and the third button is *Automatic* rather than *System*,
though it is the same idea Appearance calls that one card below, because two
buttons of that name on one screen are announced identically and cannot be told
apart in a sentence.

**Per account rather than per phone**, on the colour scheme's reasoning and more
strongly: a scheme you dislike is still readable. So it crosses the wire, is
stored on `accounts.language`, and is pushed to every device the account holds
the moment one of them changes it — as `language` in core/settings.ts, where
`system` is a stored value rather than an absence.

Changing it **redraws rather than restarting**, which is what the app's own
choice adds over the phone's: iOS relaunches an app whose system language
changes, and nothing restarts when somebody taps *Español* here. See
`LanguageProvider` in app/src/i18n/language.tsx, which sits above everything
including `AppProvider` because that provider reads words of its own.

The vocabulary itself is Part Three.

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
`decision/2026-09-17-the-lock-screen-carries-two-controls.md` is the entry,
and `decision/2026-09-29-the-lock-screen-carries-a-way-out.md` the third
control.

**That sentence used to say *exactly as long as*, and it was not true twice
over.** An activity outlives the process that started it, so a force-quit or a
crash left a card describing a room the server had since stepped the account
out of; and the last snapshot stops being evidence when nothing is arriving, so
a phone that lost the network went on asserting a presence the grace had run
out on. Neither is the hook's doing — it takes the card down the moment there
is no channel. The card is now adopted at launch and ended when the process is
told it is going away, and `useLockScreen` takes an `inTouch` that holds it for
a little less than DISCONNECT_GRACE_MS. See
`decision/2026-09-18-the-lock-screen-card-does-not-outlive-the-room.md`.

**And since 2026-10-01 the server ends it too**, by an ActivityKit push, in
the same change as any step-out it makes — the grace or attention expiring, a
removal, another device stepping in — because the phone those happen to is
most often one iOS has suspended, which runs nothing that could take the card
down. The phone's own hold is fifteen seconds shorter than the grace, so that
while it *is* running the card goes first. See
`decision/2026-10-01-the-server-ends-the-lock-screen-card.md`.

**The test is the design rather than the count**: the card offers only what a
locked phone can deliver. A mute button, a way into the channel — the tap on
the card, since the *Open* button that spelled it out went on 2026-09-29 — and
since the same day a way out of it. It said *two, and the count is the design*
until then, and the count was only ever the test's outcome.
**There is no way to claim the floor from it** — claiming means opening a
microphone, which iOS refuses to a backgrounded app, and the card would be
offering something it could not deliver. That refusal is what
`useSessionAudio` calls deferring, and the entitlement that would lift it is
Apple's PushToTalk, which this app does not hold.

**Out is the footer's last rung**, `STEP_OUT`, drawn with the footer's glyph
and never grey, since nothing refuses a departure. **It is the one control
that is answered**: giving up the room gives up the audio session, after which
iOS may suspend the app before a snapshot takes the card down, so the intent
waits to hear whether the step-out reached the socket and ends the card itself
if it did. If it was only queued the card stays, because the device is still
in the room and can still be heard.

**Both buttons ask for Face ID or the passcode on a locked iOS 26 phone**,
though both declare `.alwaysAllowed`: iOS requires it of third-party Live
Activity buttons whatever they declare, and Face ID answers it unseen when the
phone is being looked at. See
`decision/2026-10-01-a-lock-screen-button-asks-whatever-is-declared.md`.

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

**The way in is the tap on the card**, which is also what stands in for the
sentence a greyed mute button cannot carry — open the app and every reason is
stated in its own place — and STYLE.md carries that as a named exception to
its rule that a disabled control is accompanied by a reason. A button reading
*Open* spelled the tap out from 2026-09-17
(`decision/2026-09-17-the-lock-screen-card-shows-its-controls.md`) and was
removed on 2026-09-29
(`decision/2026-09-29-the-lock-screen-card-drops-open.md`).

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

## Motion to remove

**One member's open proposal that another member be removed from the channel,
and it is carried the moment a second member agrees.** *One moves, a second
confirms.* Until then nothing has happened: the person is still a member, and
they have not been told.

**Two, because nobody owns a channel.** The roster is flat — every member may
name it, invite into it, record in it and give it a public page — so there was no
position to hang the power on, and *two of you* is the only majority a flat
roster can express. It is not a majority of the roster and deliberately does not
rise with it: two out of six is not most of anybody, and a threshold that grew
would make the fifth member harder to remove than the third for no reason
anybody in the room could state. What the second agreement buys is that the act
was considered twice, and a third buys nothing more.

**Which makes it impossible in a channel of two**, since the only two people in
it are the one moving and the one being moved against. The way out of a channel
of two is to *leave* it, which is exactly as effective and is nobody else's
decision. The server refuses the move out loud and says so, rather than leaving
a control that does nothing.

**It lapses after a day**, measured from the *first* move and never rewritten —
so a roster cannot walk the window forward by taking turns. A day is long
because the two who agree are not required to be in the room together and usually
will not be, a channel being asynchronous; it is not longer because agreeing a
week later to something the mover has forgotten proposing is not the question a
second member is being asked. A lapsed motion is simply not there, and the next
move opens a fresh one.

**It is withheld from the person it is about.** Their snapshot has the entry
stripped on the way out — `withoutRemovalsAgainst` — and there is no version of
that screen worth drawing: a motion the target can watch is one they can lobby
against, which is the opposite of what asking two people independently was for.
Motions they have *made* stay on their own screen, since a mover who could not
see theirs could not withdraw it.

**Withdrawable, and only by whoever moved.** *Stand down* takes one member's
agreement off; the last one to go takes the motion with it. One member cannot
clear another's, that being a veto rather than a withdrawal. It exists because a
motion stands for a day and the case is ordinary — something is said, the reason
evaporates, and the proposal is still sitting there for somebody else to happen
upon.

**Nothing outlives the act.** There is no record of who was removed from a
channel and no list of people who may not come back: somebody removed may be
invited in again by anybody, which is the same tap it always was. What the
removed person gets is a *removal notice*.

The control is on the person's profile card, reached from the *People* tab, and
never on the roster row — the same rule that keeps *mute them* off a list of
faces, and for a stronger reason. `REMOVAL_MOVES_REQUIRED`,
`MIN_PARTICIPANTS_TO_REMOVE` and `REMOVAL_MOTION_WINDOW_MS` in
core/constants.ts; `canMoveToRemove`, `canWithdrawRemoval`, `removalMotion` and
`removalMovesWanted` in core/channel.ts; and
`decision/2026-09-26-removing-a-member-takes-two.md`.

## Removal notice

**The card on the *Channels* list telling somebody that a channel's members
removed them.** It is drawn above everything else in that list and goes when
they press *Close*.

**It is the whole of what a removed member is told, and it is told after the
fact.** The *motion to remove* was withheld from them while it was open, so
without this the channel would simply cease to be in their list — which is
indistinguishable from a channel somebody deleted and from a bug. A conversation
you belonged to disappearing with no account of it is the failure this exists to
prevent, and nothing else in the app would reveal it.

**It names nobody, and that is the decision rather than an omission.** Two
members agreed; naming one makes the other's agreement invisible and points a
grievance at whoever happened to move first, and naming both hands somebody a
list of people to take it up with. What it can truthfully say is which channel
and that it was the members' decision, so that is what it says.

**It carries the channel's name as it was**, frozen at the moment of removal
rather than joined to the live one: the reader cannot ask what that channel is
called any more, and by the time they read this it may have been renamed by
people they can no longer see. An unnamed channel is *a channel you were part
of* — **deliberately not described by its roster**, which is how every other row
in that list describes an unnamed channel, because who was in that room is not
something a removed member gets to keep reading.

**No push.** A removal is somebody else's decision about them, and waking a
phone to deliver it would make the app the messenger for an act it has kept
anonymous. The card is there when they next read their channels.

**Stored on the account, and the row *is* the notice** — where a *public notice*
is a record of an answer to a question that recurs, this answers once, so
*Close* deletes it rather than marking it read. It follows them across devices
and survives the channel itself being deleted afterwards: a card that vanished
because the room did would leave the removal unexplained. `removal_notices` in
db.ts, `RemovalNoticeView` in core/protocol.ts.

## Refusal

**The server's sentence for a channel action it would not take, said on the
channel it was taken in.** A card at the top of the channel, above the tabs:
*That did not go through*, the sentence, and *Got it*, which takes it away. A
newer refusal in the same channel replaces it. Since 2026-10-03.

**Against a greyed control.** The app greys or removes a control using the same
rules the server applies, so most refusals never happen. A refusal is the case
the greying lost: the room changed between drawing the button and pressing it,
or an older build drew a control a newer rule forbids.

**Against a *removal notice*.** That one is a row on the account, follows
somebody across devices and outlives the channel. A refusal is held by the
install that acted, in memory, and is gone on sign-out. It answers a press
that was just made, not a decision somebody else took about you.

**Only what the registry says out loud.** `dispatch` refusals reach the phone
as an `error` frame carrying `channelId`. A reducer guard returns the state
unchanged and says nothing on the wire, so it cannot be shown. The server's
sentence is English. `refusals` in `AppProvider`;
decision/2026-10-03-a-refused-channel-action-is-said-on-the-channel.md.

## Standing elsewhere

**The room you are present in, drawn on a device that is not the one holding
it.** Added 2026-09-25, and it exists because presence and standing are two
different things that had only one bar between them.

**Presence is the account's; standing is the device's.** A channel's `present`
names accounts, so every device somebody is signed in on is told the same thing
by the same snapshot — and not one of them can tell from it which of them is
holding the room. Only the server sees all of somebody's devices at once, and
`Connection.standing` is where it keeps the answer.

**What that cost was a tier that disagreed with itself.** Home's live bar is
drawn from what the app knows *this* process is connected to, which is the only
honest answer to *is my microphone open here* and the wrong one for *where am
I*. So a laptop sitting in a conversation pinned the room, and the phone in the
same person's pocket pinned nothing whatsoever: one account, one moment, two
different lists of hoisted rooms, with no way for the second to say what it was
missing. Which device is holding a room is a real fact and a small one; drawing
nothing was not a way of saying it.

**The bar is the live bar's shape and hue, and that is the point of it.** The
complaint is that two screens of one account did not match, so the thing that
stands in for the live bar has to look like the live bar. What differs is a
hollow dot rather than a filled one — the floor hue either way, the outline
meaning *not the device inside it*, exactly as `nearbyDot` means it in its own
hue — and the sentence, *On another device · 2 present*, where the live bar
says *tap to go back*. There is nothing here to go back to.

**Deliberately not hollow and grey**, which is `liveDotMuted` and means you
muted yourself. Mute belongs to the device holding the microphone, and this is
the other one.

**It does not step in**, on the *nearby* bar's rule with a sharper edge: an
`ENTER` here would take the room off the device somebody is actually talking
into. The tap opens the channel, and *In* under a thumb on the channel's own
screen is where the room moves — one action, which displaces the other device
exactly as it always has.

**On the wire it is `standingElsewhere`**, a push shaped exactly like
`screening` and for the same reason: each connection is told about the others
and never about itself, which makes the answer mean *another device of mine* on
every device at once. See
`decision/2026-09-25-the-room-is-pinned-on-every-device.md`.

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
`decision/2026-09-12-a-declaration-is-an-arrival.md`.

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

**And per person as well, since 2026-09-25**, which is a second clock of a
different scope rather than a retreat from the paragraph above. What it answers
is *in the app now* — whether anybody is at this account at all — and the rooms
cannot answer it: somebody on Home, standing nowhere, is attending the
application and no channel in it, and the report used to be dropped on exactly
that reasoning. It is now sent with an empty list, and the list is the room half
while the message itself is the account half. `accounts.attended_at`, one
column, against `channels.attentiveAt`, one volatile map keyed per pair.
**One window governs both**, so a roster and a contact row can never describe
the same silence differently.

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
  `decision/2026-09-12-moving-rooms-leaves-you-nearby.md`.

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
`decision/2026-09-09-presence-is-a-ladder.md`.

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
hour ago. See `decision/2026-09-15-the-arrival-is-a-line.md`.

**Nothing about the arrival is answered, then.** The line is filtered against
the roster rather than dismissed or expired, so it goes when the person who
arrived leaves. Promotion, where the phone stepped itself in, was built and
removed on 2026-09-08 without ever running on a device; see
`decision/2026-09-08-the-arrival-is-offered.md`.

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
`decision/2026-09-13-tapping-nearby-restarts-the-wait.md`.

**Home hoists it, since 2026-09-12.** The tier pins a bar for each channel you
are nearby in, under where it pins the channel you are present in and never
beside it — a paler hue of its own, a hollow dot, and *Nearby · 2 present*.
Several bars is ordinary. Pressing one opens the channel and steps in nowhere,
that being the act which ends the state. See
`decision/2026-09-12-nearby-is-hoisted-too.md`.

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
`decision/2026-09-15-a-notification-names-the-room-it-is-about.md`. *Step in*
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

## Paused (of arrivals)

**The server has stopped announcing arrivals to somebody, and nobody chose
it.** An account is *paused* once it has been sent arrivals for
`NOTIFICATION_PAUSE_MS` — a week — without once being seen; no further arrival
is sent until they are, and being seen is what it always is, `markSeen` as a
socket opens. `accounts.unanswered_since` holds the oldest *unanswered*
arrival, the notifier in app.ts reads it, and clearing it is the whole of
resuming.

**It is a defence of the iOS toggle, not of anybody's attention.** A person who
has stopped answering has one move available to them, and it is permanent: the
system switch, which silences every notification this app will ever send and is
invisible from the server — APNs answers 200 for a phone that drops everything.
A handful of announcements nobody was reading is the cheaper loss.

**Arrivals alone, on both sides of it.** They are the only kind that lands in
the volume the argument is about — a room reporting who walked in, several
times a day in a busy channel. *invited*, *pinged* and *accepted* are one
person aiming something at one other person, they happen a handful of times,
and they go on reaching a paused account: spending the pause on them would cost
the whole of its goodwill on the notifications least responsible for it, and
would make the pause self-perpetuating, since a note from a human is the
likeliest thing to bring a lapsed person back. The gate governs the clock too —
only an arrival starts the week, or a single ping could pause a month of
arrivals on its own.

**Two things it is not.** Not a *notification level*, which is a preference
somebody set per channel and which the pause neither reads nor changes; and not
the *notification answer*, which is what the phone reports about permission.

**Being absent is not being paused.** Somebody nobody has had reason to notify
can be away for a year with nothing outstanding, and their first arrival is
announced — it is the one most likely to bring them back. This is why the
column is a stamp rather than a subtraction from `last_seen_at`. For the same
reason the clock does not restart on each send: it marks the *oldest*
unanswered arrival, or a busy channel would keep resetting the week for exactly
the person the rule is for.

The only trace it leaves is a `paused` count on the `push sent` and
`push skipped` log lines, a `push paused` line for a *debug* account, and the
`paused` column in `bin/people`.

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

**A film is the one thing it leaves running, since 2026-09-30.** The film is
fed by YouTube rather than by this server, so on a device that is the *screen*
the wall is drawn over the application instead of replacing it, and a playing
film fills the window above the wall with a strip across its top — the wall's
sentence, shrunk. Replacing the application had unmounted the channel screen,
and that unmount gives the screen role up: a fifteen-second Wi-Fi drop took a
film off an iPad for good while the party played on. When the internet itself
is gone YouTube stalls too once its buffer runs out, so the strip promises the
film only *while it can*.

**Crossing the threshold is one event with two halves**: the queue of actions
taken during the gap is discarded, and the app declares itself offline. They
are deliberately the same moment, because the screen that goes up is the only
notice those actions ever get. Below the threshold the client retries every
second or so; above it, the old doubling backoff resumes.

`AppState.offline` in the code, reported by `Realtime` through `onOffline`,
rendered by `OfflineView`. Distinct from `ConnectionStatus`, which cycles
while retrying and is not sticky. See decision/2026-09-16-being-offline-is-one-state.md.

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
`decision/2026-09-15-the-funnel-is-instrumented-where-it-leaks.md`.

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
planning/decision/2026-09-08-present-is-the-media-connection.md.

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
planning/decision/2026-09-08-the-socket-is-what-holds-a-place.md.

**A dropped connection is still not an absence — and since 2026-09-08 the
roster stops calling it presence.** A connection that dies and returns changes
nothing, and only staying gone past the grace period ends presence; but for the
length of that grace the card reads ***Nearby*** rather than *Present ·
reconnecting…*, because a window in which somebody may come back is not a claim
that they can hear you. The ping was already offered there — presence is not
reachability — so the button was right before the word was. See
planning/decision/2026-09-08-the-grace-is-not-a-presence.md. What changed is which
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
one tap. **On screen it is a *podcast*** since 2026-10-04 — *This channel is
a podcast* — once a *community* made *public* ambiguous; the code still says
`public`, and a channel is never both.

**Making the page is not publishing anything**, and that separation is the
whole shape of the feature. The page exists; what is on it is every recording
whose participants have each *agreed to publish* it, which is a different
decision taken a different way. A public channel with nothing on its page is
the ordinary state on the day somebody turns it on, and is not a bug.

**No member is named on it, ever.** The name, the *description* and the
recordings, and nothing else — the task entry this was built from is explicit
that members stay private though they may be described in the description, so
the only words about who these people are are words they wrote. The episode
titles obey it too: a recording still carrying its participant-derived default
name is shown by its date instead.

**Only a named channel can be public**, from 2026-09-22, and both directions
are held: *On* is refused to a channel nobody has named, and a public
channel's name cannot be emptied — turning the page off is the way back to
being listed by who is here. It is a rule about what a stranger reads rather
than about who is deciding. An unnamed channel's only name is its roster, the
one thing a public page may never show, so the page and the directory row
answered with *A conversation* — which named nothing and was the same string
on every such row. See
`decision/2026-09-22-only-a-named-channel-can-be-public.md`; the fallback is
still in app.ts for the channels that went public before the rule.

**A public channel is findable, not merely reachable** — which is a change,
made on 2026-09-22, and the one thing here most likely to be remembered wrong.
Until the *directory page* existed, the address was unguessable and was shared
the way a *guest link* is, by being handed to somebody; the app said "anyone
with the address" in those words. It no longer does, because every public
channel is now on one list anybody can read. What is still true is that
nothing here is in Apple's directory or anybody else's — see *podcast
directory*.

See also *public notice*, *directory page*, *published*, *feed*, and
publication.ts.

## Public notice

The card that tells a member their channel has a *public page*. It sits above
the *channel tabs*, on whichever of the six they landed on, and goes when they
press *Got it*.

**It is a notice and not a veto, and the word *consent* is wrong for it** —
which is worth saying here because the neighbouring entries are all about
consent and the resemblance is close enough to mislead. Nobody is being asked
to agree. Pressing the button takes nothing down, lets nothing up, and changes
only whether the card is drawn again. Whether a channel is public stays any
member's decision, exactly as it was.

**What it fixes is that the decision used to be visible only to whoever made
it.** Any member may give a channel a page; everybody else found out from a
settings screen most people never open, and somebody added to a channel that
went public last month arrived into a settled fact with no moment at which
they were ever shown it. So the sentence is owed once, to every member, and
the absence of a row is the debt.

**Owed to everybody except the member who turned the switch on**, whose
confirmation carried the same words — and owed afresh to everybody after a
channel goes private and comes back, since that is a new fact about where
these conversations can be read, possibly months later and possibly to a
different roster.

**Stored on the account rather than on the install**, unlike the
*getting-started* card's dismissal, because it records that a person was told
rather than that a screen was read: it follows them onto their other devices,
and a new account rejoining is owed it again.

**Nobody is ever shown who else has read it.** The field is computed per
reader and no screen aggregates it, deliberately: a list of who had
acknowledged the page would be read as a list of who had agreed to it, and
nobody has been asked to agree to anything.

What does protect somebody's voice is *agree to publish*, per recording and
unanimous, and the card's second paragraph says so — that is the sentence
doing the real work. `public_notices` in db.ts,
`owesPublicNotice` in publication.ts, and
`decision/2026-09-22-a-page-nobody-was-told-about.md`.

## Directory page

`/podcasts`: every *public channel* on this server, in one list, with each
one's name, *description*, *cover art* and a count of what is listenable on it.

**It is what makes a *public channel* public in the ordinary sense of the
word**, and it arrived after the channels did. A page whose address nobody
publishes is unlisted; a page on a list is findable. That distinction was the
whole question the day this was built, and it was decided at the prompt rather
than assumed — see
`decision/2026-09-22-a-public-channel-is-findable-rather-than-unlisted.md`,
which also records that the app's and `/privacy`'s wording had to be corrected
in the same commit, and that anything widening this audience again owes the
same correction.

**Every row carries a name somebody chose**, which is the other half of why
only a named channel may be public: a list several of whose entries read alike
is a list nobody can use. See *public channel*.

**Every public channel, including one with nothing published**, where the row
says so in the line the others spend on a count. This is deliberately not the
rule an *episode* obeys: an episode whose transcode has not landed is hidden,
because a player that does not work is a broken promise, whereas an empty
channel is a true statement about a channel that exists.

No *member* is named, here as on a channel's own page, for the same reason.

**The app's *Podcasts* tab is this page, in a frame**, since 2026-09-22 — the
document the server serves to a stranger, not a native list built from the same
rows. There is one implementation, so the app and the web cannot come to
disagree about what is public, and a channel that goes private stops being
listed in both at the same moment. Following a row to a *public page* stays
inside the frame, that page being the same kind of thing; anything that is not
this server's — the takedown address at the foot — leaves for the app that
handles it. On the web it is an `<iframe>` and same-origin, the web app being
served by this same server under `/app`.

**Above the breakpoint it is the pane on the right**, since 2026-09-22 — not
Home's body, which is where the other three tabs' contents stay. The others
are columns of rows and a 360pt column is what they are for; this one is a
document, and a document in that column beside an empty pane spends the window
the wrong way round. The tab still lights and still switches in the tier; what
it switches is the pane next door, which on that tab has the page instead of
its *pick a conversation* placeholder. Home's body is then nothing at all
while that tab is selected, the title, the live bar and the switch all being
the tier's own. Nothing is kept in step for it: it is not a *detail*, it is
what the tab is, so Settings or Help opened over this tab covers the page and
closing returns to it.

Not a *podcast directory*, which is Apple's or Spotify's.

## Published

A *recording* anybody can listen to, through the *public page*, the
*directory page* or the *feed*.

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

What is left is a guest who spoke and has no account, and they are asked too —
see *speech consent* below. The alternative, dropping their audio, changes what
the conversation was; asking the members on their behalf is exactly what
unanimity denies.

## Feed

The *public page*'s machine-readable half: an RSS feed at the page's address
plus `/feed.xml`, carrying the same *episodes* the page lists.

It is what a podcast app subscribes to. It is reached from the *public page*
or the *directory page* and pasted into an app by hand; what it is not is in a
*podcast directory*, where a podcast app's own search would find it. Artwork,
an iTunes category and submission to Apple or Spotify are what that would
additionally need; none of them is needed to hear an
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

## Episode start

The unit the public podcast is counted in, since 2026-09-25: one read of an
*episode*'s audio that begins at the first byte and asks for more than a
probe's worth. `startsAnEpisode` is the whole of the definition and
`episode_listens` is the tally.

**It is a word for a request and not for a person, and the distinction is the
reason the term exists rather than being called a listen.** A media player asks
for one file a dozen times — a probe to learn whether ranges are honoured, the
moov atom at the end, then chunks forward — and only the first of those is a
start. What that collapsing cannot do is tell a second start from a second
person, because the tally holds no address and no session on purpose: a replay
counts twice, a podcast app that downloads an episode nobody ever hears counts
once, and two listeners counting one each look exactly like one listener
counting twice.

**So it compares episodes and never sizes an audience**, and anything written
from it says which episodes people reached for. A word that meant *listener*
here would be a word that licensed the other claim.

**Scoped to the public pages and feeds, and nothing in the app.** Listening as
a member is *listen* minutes against an account, which is a cost question; this
is the one thing this project measures about somebody who has no account at
all, which is why /privacy names the scope rather than only the measurement.

## Speech consent

What a *guest* with no account agrees to so that a conversation they spoke in
can be *published*: put to them on the guest page, at the moment they ask for
the microphone.

**The placement is the whole of why it is honest.** A notice on the *guest
link* would be a blanket agreement given before there was a conversation to
agree about — which is the same objection that makes a member's consent per
recording rather than per channel. Asking at the microphone does not have that
problem: it is the moment somebody chooses to become part of the audio.

**It is not a condition of being heard.** The box is off by default, asking to
speak works either way, and a guest who agrees to nothing simply leaves the
conversation unpublishable. Trading somebody's voice for their consent would
be a worse bargain than not asking.

**Withdrawable while the seat lasts, and gone with it.** Taking it back removes
the conversation from the page and the feed, exactly as a member's withdrawal
does, and reaches no copy already downloaded. Once the seat expires there is
nobody left to ask and nothing left to withdraw — the honest limit of consent
from somebody with no lasting identity here, and the reason the question is
worth asking at the one moment it means something.

A guest *with* an account never meets this: they are asked per recording, like
a member.

## Cover art

A *public channel*'s square image, drawn at the top of its page and carried in
its *feed* as the thing a podcast app shows in a grid of subscriptions.

Apple's rules, not ours: square, between 1400 and 3000 pixels a side, JPEG or
PNG, and no transparency. All four are refused at the upload, in the words of
the rule and naming what was actually measured — a directory refuses the same
things at submission, which is a review cycle spent being told a number.

**Optional, and only for being listed.** The page and the feed work without
one; what needs it is a directory. The same is true of the *category*, the
language and the explicit declaration, which sit with it under one sentence in
channel settings saying so.

## Record (the tab)

**What was kept of a channel, as a log, one room at a time.** The fourth of
the *channel tabs* since 2026-10-09, when *Recordings* and *Transcript* became
it and it took *Listen*'s place. The *live transcript* runs oldest at the top
and newest at the foot as plain text, the way a chat reads — no cards — each
speaker's run of lines under their name and the time it began. Each
*recording* is one muted line at the moment it began, the record dot and its
name, which opens in place to what a recording's card always offered, Share
among it. The *Audio* and *Text* switches are pinned over the log, and the
tab opens at its foot.

**Laid out in rooms.** Each *room* — a sitting, first step in to last step
out — that kept something starts with a line bearing its date and hours and
the share glyph, and the line scrolls with the log until it goes off the top,
where it is pinned until the next room's line pushes it off. The share asks
which: the room's recordings as one file, back to back, or its live
transcript as text — whichever the room did not keep shown and greyed. A
sitting that kept nothing is not drawn. **A recording that fell in
no sitting is a room of its own** — a *stand-in*, spanning exactly the run,
recorded and not transcribed — so every recording made before sittings were
first written, on 2026-10-09, opens the log under its own rule and shares
like any room. Live transcript from before then is not drawn: it has no
sitting to stand in and would be a guess.

**Named for what the two forms are together, not for either form.** A
channel may keep the conversation as audio, as text, both, or neither:
*Recordings* was wrong for a channel that only transcribes, *Transcript* for
one that only records. Spanish *Grabado*. *Recording* still means audio, and nothing else — that
audio exists at all is what people are told about, by the red pill.

**The noun, not the verb.** There was a Record button under the timeline
until 2026-10-09, and the two read alike in English only; Spanish keeps them
apart, *Grabado* and *Grabar*. The verb is gone now — recording is switching
*Audio* on — so the tab is the only *Record* left on the screen.

**It was *Conversation* for 2026-10-09 alone**, and that collided with the
*conversation* the rest of the interface means — the live talk in the room,
which you step in to and out of. The tab is that conversation written down,
which is what *Record* says without borrowing the word.

## Audio and Text (the switches)

**What a channel keeps of what is said, as two switches**, pinned under the
channel's header on the *Record* tab since 2026-10-09 (`KeepSwitches`).
*Audio* is a *recording*: on starts one, off ends it, on the recording's own
rules. *Text* is the *live transcript*: `ChannelState.liveTranscription`,
moved only by somebody on the house. They replaced the Record and Pause
buttons and the *Live transcript* setting on *Channel Settings*.

**Radio style: one, the other, or neither, and never both.** Turning one on
turns the other off in the same press — the backlog's *keep the transcript
and let the audio go*: a channel keeps the conversation as audio or as text.
**The app enforces it and the server does not**, so *Record automatically*
starting a recording under the text leaves both on, and both are drawn on.
Somebody who may not move *Text* cannot turn *Audio* on while it holds,
since that would be turning it off, and is told so under the pair.

**Pause holds whichever is running, and Resume restarts only what it held.**
Audio's is the recording's own pause, which keeps the run one recording.
Text's is `liveTranscriptionPaused` — `PAUSE_LIVE_TRANSCRIPTION` and
`RESUME_LIVE_TRANSCRIPTION`, on the recording's Pause rules rather than the
house's, since holding it costs nothing — which stops what goes to the
provider and turns the pill to *Paused*; the lines either side are one
stretch of the same room. A hold is let go when the choice changes and when
the room empties. A switch stays on while what it chose is held.

**Not *Record* and *Transcribe***: the words name what is kept rather than an
act, since a switch is a state somebody sets. Spanish *Audio* and *Texto*.

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

**It decides how a recording begins and nothing else.** Ending a run is what it
always was, and is final: the room gets one automatic recording, and the next
one comes when everybody has left the channel and come back. Since 2026-10-09
ending is what Pause does, there being no Stop. Without that the button would
appear not to work — the state returns
to idle, and a rule written as "record when you can" would start another at
once.

It belongs to the channel rather than to the person, like the name and the
*description*, and any *member* with the room may change it. The latch that
spends the room's turn belongs to the server and to this process: a restart
empties every room, so the setting survives one and the turn comes back with
it. `autoRecord` in `core/types.ts` and `autoRecordStarter` in
`core/channel.ts` are the whole of the rule.

## Recording

Audio kept from a channel, started by anybody present and ended by them too.
**Since 2026-10-09 there is no Stop: every end is final**, and the next start
begins a new recording, so a conversation recorded in stretches is several
recordings — segments of the *Record* tab, each where it began — rather than
one file with holes in it. Since the same day starting and ending are the
*Audio* switch, on and off: off sends `STOP_RECORDING`. **Pausing does not
end it**: the Pause beside the switches sends `PAUSE_RECORDING`, the server
stops capture and starts a new segment on resume, and the segments are one
recording, joined on export with the paused time left out — one file, no gap,
in the room it began in. *Audio* stays on while it is held. *Present* is
the operative word and is the whole of who may touch it: somebody
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
lasts, rather than a membership. It appears on Home as a smaller card, and it
expires on its own if unused.

**Where that card opens depends on whether there is an account behind it**,
since 2026-09-22. A seat with one opens in the app, on a screen of its own —
the app holds seats now, over the account's own socket, and a contact asked in
as a guest stays where they already were. A seat with nobody behind it opens
the guest page in a browser, which is what a *guest link* always produces and
is unchanged: the app boots into a sign-in, and an anonymous seat has nothing
to sign in as. Before that date every seat was the browser's, and a phone was
shown an alert naming a web address. See
`decision/2026-09-22-a-seat-rides-the-member-socket.md`.

**A seat may exist before anybody has sat in it**, since 2026-09-21: that is
what a *guest invitation* is, and it is the one kind whose holder has never been
in the room. Home draws those as invitations rather than as seats, because a
place to go *back* to is what a seat card means and there is no back yet.

Distinct from *membership* in almost every way that matters — a seat has no
roster, no recordings and no history of the channel, only when it was admitted.
Distinct also from being *present*: a seat outlives the visit, which is what
lets a guest come back. **And distinct from having an account**, which a seat
may or may not have behind it; the two are what *guest* used to run together.

**A seat takes the standing of the device that opens it**, exactly as opening
another channel does: walking into one is walking into a conversation, and two
at once is two conversations in one pair of ears.

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
*room* — its audio, or since 2026-10-09 its live transcript as text — a
*transcript*, or the track the channel is listening to. One verb, labelled
`Share` or drawn as the share glyph — and on a phone all of them end at the
system share sheet. A room's asks first which of the two, in iOS's action
sheet, with what the room did not keep greyed.

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
`decision/2026-09-09-presence-is-a-ladder.md`.

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
`decision/2026-09-21-a-tap-only-ever-looks.md`.

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

## Live transcript

**What is said in a channel, written down as it is said, with no recording.**
One line per finished turn of one speaker, named after whose microphone it came
from — a *stem* is one voice — with the name frozen as it was said, placed on
the wall clock, and kept in `live_lines` until the channel goes.

**Switched on per channel, by somebody on the house.** The setting is
`ChannelState.liveTranscription`; who may turn it is the `transcripts_unlimited`
mark, checked by the server's route. **The switch is *Text* on the *Record*
tab since 2026-10-09**, beside *Audio* and radio with it, and drawn for
everybody — it says what is being kept — but moved only by that account; it
was an On/Off pair in channel settings, drawn for that account alone. Everybody in the room sees that it is on — the
*Transcribing* pill — because everybody's speech goes to the provider while it
is. **Held by the *Record* tab's Pause** since 2026-10-09
(`liveTranscriptionPaused`): still on, and nothing sent while held. Read in
the *Record* tab — the *Transcript* tab for its first day —
which is the first piece of the channel as one long conversation, with the
channel's recordings standing in it as segments.

**Not a transcript of a recording**, which is the entry below: that is made
afterwards, on request, from stored audio. This one never had audio to store.

## Transcript

Behind *Labs* from 2026-09-06 to 2026-10-09, and behind nothing now: every
member of a channel is offered a recording's transcript and the way to ask for
one.

Text made from a recording, on request, by a third-party provider named on the
screen that asks. Everybody gets one free; asking sends everybody's audio out,
so who asked is always shown.

A transcript is never edited, and since 2026-10-09 nothing is said about it
either: each line is named after its *voice*, which is its *stem*, and there
is no renaming. Until then a rename or a removal was a *declaration* laid over
the text.

## Transcription model

**A channel setting, and drawn only for an account with `debug` set**, since
2026-10-09. *Standard* is the cheap grade and every channel's default; *Pro*
is the flagship. `transcriptionModel` on `ChannelState`, of type
`TranscriptionModel`, whose values are `'standard'` and `'pro'`.

Named by **grade rather than by model**, so the setting outlives a change of
provider: which model each grade means is `ASSEMBLYAI_MODELS` in
`server/src/transcription.ts` — Universal-2 for *Standard*, Universal-3.5 Pro
falling back to Universal-2 for *Pro*. Read when a transcript is asked for
and stored on its row, so changing the setting changes nothing already asked
for.

**Batch only.** The *live transcript* streams on
`universal-streaming-multilingual` whatever this says.

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

One speaker within a transcript, and **exactly one *stem***, since
2026-10-09 — see Part Two. A stem is one microphone, so whose stem a line came
from is who said it, and its label is that person's display name as frozen
with the run, or *Played audio* for the shared track. Nothing asks the provider
how many voices it heard, and nothing renames one: an interview played into
the room is one voice called *Played audio*, and a speakerphone's bleed is
credited to the microphone's owner. Until then the provider's letters split a
stem into several voices — *Played audio (B)* — that could be named or removed;
decision/2026-10-09-a-stem-is-one-voice.md is why that went.

## Waiting bar

**A pinned line on Home saying somebody has asked something of you**, since
2026-09-23: one for the *contact requests* you can answer, one for the
*invitations*, and nothing at all when there is neither. `WaitingBar` in
`ui/HomeView.tsx`, drawn in the tier under the presence bars and above the two
notices — which is the order of who each line is about, an open microphone
first and the application's own requests last.

**It exists for the first hour of an invited account**, which was a scavenger
hunt. Somebody invited by email arrives with a contact request already written
— the server does it at signup, resolving `pending_invites` — and Home opens on
*Channels*, which for that account is empty. The request is one tab over behind
a *dab*, which is deliberately a mark and never a sentence. They answer it, the
person who asked then asks them into a channel, and *that* card lands on the tab
they have just left, announced the same way. Two things waiting, each behind a
tab the reader is not standing on.

**The sentence, not the controls.** A tap goes to the list holding the row; the
*Accept* stays where it was. Hoisting the rows themselves would draw each
request and each invitation twice, which is the thing `liveChannelId` and
`nearbyChannelIds` exist to prevent for the channel rows. It is the *live bar*'s
bargain exactly — that line says which room you are standing in and the room
keeps the microphone.

**Two bars rather than one.** A single line counting unlike things — *2 things
waiting* — names neither and points at one tab while meaning two. Both at once
is the rarer state in any case: the ordinary arrival meets them one after the
other.

**One name or a count, never both.** *Ana and 2 others* reads as a group doing
one thing, and these are people who each asked separately; the list one tap
away is where they are enumerated.

**It does not move anybody's tab by itself**, which was the other way to fix
this. The first snapshot lands a moment after the app opens, so a rule that
switched lists on it would switch one under a thumb already travelling — and
would have to decide, every launch after the first, whether the arrival is
still what somebody came for. A bar says so and waits to be pressed.

Rose on the edge over `surface`, no fill: `waiting` is the token whose meaning
this already is, and the live bar stays the only tinted block on the screen.
See STYLE.md § *The pinned header*.

## Watch party

Behind *Labs* from 2026-09-06 to 2026-09-18, on the starting side only —
anybody in a channel could always stop, pause and seek a party already running,
whoever started it. It is behind nothing now: the tab is on every channel
screen and anybody in the room can begin one. See
planning/decision/2026-09-18-the-watch-party-comes-out-of-labs.md.

A YouTube video everybody watches on their own screens, in step. Nothing about
it is fetched, published, recorded or stored here: it is a link, and each
device plays it.

**It is a mode the channel is in rather than a thing it is carrying**, and
since 2026-09-18 an exclusive one. While a film is loaded — playing or paused
— no recording may be begun: a recording beside a party would be missing the
thing everybody was reacting to, which is true between scenes as much as
during one. Stopping the party lifts it.

**And the party ends with the *room*, since 2026-10-09** — `ROOM_ENDED`,
raised by the server once nobody has been back for `ROOM_DEPARTURE_MS`, which
unloads the film as *Stop* would and keeps it in the history. Before that a
film walked out of stayed loaded for ever, and the recording rule above
refused the next person in, alone or not, with nothing on the screen saying
why: seventeen channels were in that state when somebody noticed they could
not record by themselves. A quick step out still finds the film paused where
it was; a restart starts no clock, a deploy mid-film being nobody's choice to
leave.

**The *floor* asked the same question until 2026-09-24 and now asks a narrower
one**: no claim while a film is *playing*. The argument for the wider rule was
that a claim is a demand that everyone be quiet, and *mute everyone* already
makes that demand for a film with a control that belongs to the film. But that
mute holds only while the transport runs — pause, and everybody has their
voice back — so over a paused film the party was quieting nobody and the claim
was refused anyway. A film that reaches its end comes to rest paused and
loaded, so a channel that watched something through and never pressed *Stop*
could not claim the floor again at all. See
planning/decision/2026-09-24-the-floor-waits-on-the-film-not-the-party.md.

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

**Mute everyone** withholds every microphone *while the video is playing*, and
pausing gives them all back — you pause a film to talk about it. It writes
nobody's *self-mute*, and it is not the *floor*: it withholds everybody and
confers nothing.

**What the channel has watched is kept, since 2026-09-22**, and offered back
as rows on the watch card — *watched before*. A link arrives on a clipboard
and is gone by the next evening; the channel is the thing that knows which
video it was, so a party that ends joins a list of ten, newest first, and
pressing a row is the same act as pasting the link that made it. The entry
holds whatever the party learnt about itself while it was on — its name and
its length, from the first player that could say — so a film stopped in its
first seconds is remembered nameless, and a later run that learns nothing
never overwrites what an earlier one knew. It is the channel's and not any
person's, for the plain reason that what is being remembered is what
everybody in the room saw.

**Since 2026-09-17 the film plays inside the app**, on whichever device you
choose — a WebView on a phone, an iframe on the web. It is still YouTube's own
player, unmodified and unobscured, and The Floor still carries no video.

**And since 2026-09-19 it does not live on the *Watch* tab**, only on the
device that is showing it: the picture is pinned under the tabs there and is a
small draggable rectangle in the corner of the other five. It was a child of
that tab's card until then, so somebody stepping into a room with a film
running — landing on *Members*, as everybody does — saw nothing, heard
nothing, and was reported to the room as watching. See *the picture* below and
decision/2026-09-19-the-film-is-not-a-tab.md.

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
is left at the sides is the film's own letterbox. **Expanding and collapsing
cost nothing since 2026-09-23**: full screen is a third *place* for the
picture rather than a screen of its own, so the player is given the whole
window and never rebuilt. It used to be rebuilt both ways — the film reloading
and the follower driving it back — which was 1.0 to 1.5 seconds of black,
measured on build 276, for the one person who turned their phone.

## Screen

**The app instance showing a party's film.** Any instance of your own account,
on any device you are signed in on — a role an instance takes, never a place to
be. A screen does not *step in*, so it neither displaces the device holding
your voice nor claims an audio session of its own, which is why a film on a
second device sounds best.

**Moved by one offer, and it is only ever the one that applies.** A device
showing the film offers **Watch on another device**; a device whose account is
showing it somewhere else offers **Watch on this device**, over the line *The
film is on another device*. Never both, and neither when there is no film
loaded or you have stepped out — so there is no control that would do nothing
if it were pressed. Picking *another device* lists your own live instances, and
only when there is more than one to choose between.

**A film loaded on no device at all also offers *Watch on this device*, since
2026-09-24**, bare and without the line above it — there is no other device to
name. It is a state the default is supposed to make unreachable, so reaching it
is a bug somewhere else; the offer exists because *the card says what you can
do about where the film is* has to hold in every case or it is not a rule.
Until then the card drew nothing there, under a transport that was running, and
the party had to be stopped and started again to be watched. Stepping out is
the one case that still draws nothing, deliberately: a film must not start in
front of somebody who has left the room.

**It was a switch until 2026-09-23** — *This device* against *Other device*,
one of them always chosen, drawn on every device whatever the film was doing.
That shape answered *where is the film* and offered the move as a side effect
of reading the answer, which left half of it inert: the segment naming the
device in your hand did nothing when the film was already there. The offer
still says where the film is, by which one it makes and by whether the picture
is on the screen in front of you.

Before the switch there were two buttons, until 2026-09-17, and they read as
two unrelated acts whose meanings inverted as you walked between rooms — the
laptop's *Watch here* and the phone's *Watch here* being opposite instructions
in identical words. What fixed that was naming the *device* rather than the
place, which both offers still do.

**The same offer is on Home**, as a pinned bar — *The film is on another device
· tap to watch here* — since 2026-09-23, because only the sending half was ever
convenient. Fetching the film back meant opening the app on the device you had
walked to, finding the channel, opening it, going to *Watch* and throwing the
switch: five steps for the gesture people actually make, which is to sit down
in front of something and want the film there. It can only ever be about the
room you are standing in, a picture being refused to anybody who is not in one.

**It moves while the film is playing, since 2026-09-23.** It refused to for
six days, on the argument that a move mid-scene is confusing — the film leaves
what you are looking at and turns up on something across the room a second or
two later, in the middle of a sentence. Two of that argument's three parts were
retired by measurement: the second or two was the reload that arriving used to
cost, and an arriving screen is seeked to the room's own position, so it
resumes where everybody else is rather than where it left off. And pausing
first cost three taps rather than the one it claimed — pause, switch, play.
What survives is the audio crossing the room, which is what every device-switch
does and which the tap is the consent for.

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
decision/2026-09-21-a-declaration-displaces-every-instance.md.

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
`decision/2026-09-20-the-second-device-is-a-television.md`.

## The picture

**Where a party's film is drawn, on the device that is the *screen*.** Three
places and no fourth: **docked**, a pinned row under the tabs on the *Watch*
tab; **floating**, a 168pt rectangle resting in one of the four corners of the
application, dragged to any of them and tapped to go back to the controls; and
*full screen*, which is the entry above.

**It is one player throughout, which is why the word is worth having.** A
`WebView` that is reparented is rebuilt — the page reloads, the film starts
from black and the follower drives it back — so the three places are one
element in three styles rather than renders in three branches of a screen.
**Full screen was the exception until 2026-09-23** and is not one now: it
mounted a player of its own, which cost 1.0 to 1.5 seconds of black to
whoever turned their phone, measured on build 276. It is a place like the
other two, and `FullScreen` is the scrim over the picture rather than a screen
containing it.

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
paused, it is a still frame over whatever tab is showing, and the transport that would
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
reducer draws the line the same way — `WATCH_HERE` asks `isHere` — so the
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

**An *upright film* keeps the lock**, since 2026-09-29. The exception exists
because the film is better for the turn, and a Short is not: sideways, a tall
picture is fitted into a wide window and comes out smaller than it was
upright. So for one the phone stays locked on the card and in full screen
alike, and the button is the whole of the control, as it is for a phone lying
flat. Which films are upright is read off the link — `isUprightFilm` in
`core/watch.ts` has why, and what that misses.

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
request. See decision/2026-09-20-the-film-says-what-it-is-called.md.

**Null is ordinary**: the first seconds of every party, a party nobody is
showing anywhere, and an embed whose `getVideoData` is missing — the method is
undocumented, so it is read through a guard. The card then draws what it drew
before there were any titles.

**An advert cannot name a party, and since 2026-09-23 it cannot give one its
length either.** It could do both until then, on the reasoning that a pre-roll
is a different video in the same frame, both facts are learnt from the same
first report, and the cost is a wrong name for one evening. The cost was not a
wrong name. A party keeps the *first* length any player reports and keeps it
for ever, and on a newly started film the first thing any player can measure is
the pre-roll — so a thirty-second spot became the film's length on every screen
in the room, the scrubber ran out in half a minute, the transport came to rest
there, and every subsequent reading of the actual film failed the length
comparison that tells a film from an advert. The picture stopped and could not
be started, for the rest of the party.

**So the player says which video it is showing and that is the test.**
`getVideoData` carries a `video_id` beside the title, and during a pre-roll it
is the advert's — the fact the length comparison was standing in for, said
outright. Nothing is learnt from a reading that names another video, and
`showingTheFilm` answers on the id where there is one. The lengths remain the
fallback for an embed that will not give an id, with the circle still in them:
a length cannot detect the case that poisons it.

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

**And *not watching* is the other answer, said since 2026-09-26.** The suffix
was a word or a blank, and the blank was doing two jobs: *this person does not
have the film up* and *this roster is not reporting screens at all* drew
identically, so the question was answered for the people who said yes and left
silent for the people who said no. Three answers are now said as three —
*watching*, *not watching*, and nothing.

**Nothing is what the two cases that cannot be denied honestly get.** A *guest*
is never on the list because their socket carries no declaration, so a guest
absent from it may well be watching; and a server older than the field sends no
list at all, where a denial would tell a whole room it was not watching a film
it was sitting in front of. An **empty** list is not that case — it is a server
that looked and found nobody, and every card may say so.

**The denial is also only about somebody *in the room*.** A member who is
*nearby* or *stepped out* is not watching in any sense the room is asking
about, and their card already says where they are. *Watching* itself is not
gated that way and must not become so: a *second device* is a screen without a
voice, so a stepped-out member may hold the picture and is reported.

See decision/2026-09-20-the-roster-says-who-is-watching.md and
decision/2026-09-26-a-blank-suffix-was-two-answers.md.

## Watching here

**Your screen and your voice on one device**, which is the case that costs
something. The room's mute is **enforced** for such a run, so that nobody is
waiting on a voice that cannot arrive.

**It costs the microphone.** A device cannot both play a film in stereo and
hold a microphone open, so a screen that is also in the room stops capturing
while the film plays and the session falls to `LISTENING`. The category was
never what cost the stereo — the *mode* is, and the Bluetooth option is — and
closing the device costs about a second on every press of Play, all of it spent
tearing the microphone down before the session can move.

**That second was avoided for three days and the cure was worse.** `SCREENING`
held the device and changed only the configuration, and changing the
configuration stops the audio engine with nothing left to restart it — so a
pause put every microphone back onto a dead engine and the room could not talk
until somebody left the channel and returned. A category change tears the device
down *and brings the engine back up*; that is why the expensive version is the
one that works. See STATES.md § *Audio Session Configuration*, `isScreening` in
core/micNeeded.ts, and decision/2026-09-26-the-film-keeps-its-stereo.md.

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
`decision/2026-09-13-a-rung-says-what-ticks-it.md`.

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
decision/ § *Sessions are ended wholesale, and that is not a defect*.

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

## Excess flag

What `server/src/excess.ts` writes, since 2026-10-03, when one caller asked far
more of one route than everybody else did in the same hour. A *caller* is an
account when the request was signed in and the address Caddy saw when it was
not; a *route* is the pattern (`/i/:username`), never the address requested.
*Far more* is two tests at once — past a floor, and ten times the median of
everybody else on that route — and is measured separately for refusals (a
4xx) and for requests of any kind.

**`unbudgeted` is the third measure and is not *far more* at all**, since
2026-10-04: one `unknown` from the accept route to an account that has spent
its day's `link_accepts`, which is the shape that route's username leak takes.
No floor and no median, because a slow walk reaches neither.

**A flag is a question, not a verdict.** Nothing is refused because of one,
and *excess* is not a word for abuse: an address is shared by strangers, and a
busy hour is busy for a reason. It is read by `bin/usage excess`, the last
report of a bare `bin/usage`, and by nothing in the server — no email, nothing
on `/healthz`. The counts behind it live in memory and die with their hour;
only the flag is kept.

Not a budget. A budget — `invite_guesses`, `link_accepts` — refuses in advance
and is the right tool for a secret; this notices after the fact and is the
tool for everything no budget was written for. (Nor a *guard*, which here means
only a `can…` predicate in `core/`.)

## Expired (build)

An installed app below `MIN_SUPPORTED_BUILD` replaces itself with an update
screen and disconnects. The floor is enforced by the client, since 2026-08-17 —
raising the number ends sessions on phones rather than merely licensing a
deletion. See AGENTS.md, which carries the traps around builds 37 and 51.

## Follower

The code on each device that is showing the film and keeps that device's
YouTube player doing what the room is doing. `useFollow` in
`app/src/watch/drive.ts` owns the clock, the player and the press; `stepFollow`
in `core/watch.ts` decides, each tick, whether to rest and what to say.

**It follows, it does not correct.** Since 2026-10-03 it plays and pauses with
the room and seeks only to *place* a player — never to close drift, which the
`debug` readout reports and nothing acts on
(`decision/2026-10-03-nobody-corrects-drift.md`). Not the *transport*, which is
what it follows, and not the *screen*, which is which device it runs on.

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

## Present or empty

*Has the room*, `hasTheRoom`, until 2026-10-09, when *room* came to mean
one thing only.


`presentOrEmpty` — you are in the channel, or nobody is. The rule that nobody
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
decision/2026-09-20-playing-is-not-tidying.md.

## Hearing (a device's)

`Hearing` in `app/src/audio/unheard.ts`, on `SessionAudio.hearing`: who in the
media room is publishing audio, and which of them this device is subscribed to.
Read off the LiveKit room after every event that could change it, rather than
counted from the events, so it cannot drift from what the room holds.

**The only account anywhere of what the media plane actually did.** The server
withholds and restores by stating subscriptions and takes the answer on trust;
nothing it can query says who is subscribed to whom. *Reconcile / restate*
compares against what was stated, not against this. Not *reach*, which is
about contacts.

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

See planning/decision/2026-09-18-the-picture-is-not-a-control.md.

## Introduction

What a new account is shown above both of Home's lists, until every rung of it
is done or dismissed. `state/introduction.ts` decides it and
`ui/Introduction.tsx` draws it; planning/decision/2026-09-10-the-onboarding-checklist.md is the design.

**Home has not drawn it since 2026-10-08** — it confused the people it was
for — and *Show the checklist again* left Settings with it. Everything below
still runs underneath and still describes the ladder;
task/replace-the-getting-started-checklist.md is what comes next.

One shape, for everybody: a ladder — get somebody here, step in with somebody,
and then four things to try inside a channel — each rung carrying an
instruction naming where it is done and a button that goes there.

**One rung is drawn, and it is the next one.** Everything else sits behind
*See more*, since 2026-09-24 including the rungs already ticked. Those were
exempt for eleven days, one line apiece, on the argument that they are the
half of the card saying somebody is getting somewhere — but the exemption
grows with progress, so an account four rungs into seven was reading four
lines of congratulation above the single thing it was being asked to do, which
is the wall the one-rung rule exists to prevent. The progress is still there,
one tap away.

**And the card is not drawn at all while a *waiting bar* is up**, since the
same day. Its first rung is *get somebody here*, which is the wrong thing to
put to an account that arrived because somebody got *them* here and has not
answered them yet. Answering is the shorter job and ticks nothing on the
ladder, so the ladder loses nothing by coming a moment later. Decided in
`ui/HomeView.tsx` rather than in the policy module, which is the one thing
about this card the policy does not decide — what is waiting is the tier's
own question, computed there for the bar.

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
`decision/2026-09-13-the-web-app-can-be-installed.md`.

**It was four rungs until 2026-09-13**: *say who you are* and *choose a
username* went when both became derived at signup, and with them the profile
request the username rung needed. See
`decision/2026-09-13-the-checklist-is-two-rungs.md`.

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
`decision/2026-09-13-the-tried-rungs-belong-to-the-account.md`.

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
`decision/2026-09-13-the-checklist-outlives-the-first-conversation.md`.

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
`decision/2026-09-13-the-checklist-has-a-second-exit.md`.

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

## Ladder (the follower's)

What a *follower* climbs while its player does not agree with the room, since
2026-10-03 (`decision/2026-10-03-the-follower-rests-only-on-agreement.md`):
**0** told, **1** told again, **2** seek and play, **3** the page rebuilt,
**4** given up. Each rung is entered when the one below has run out of time,
and its action is taken once.

**The contrast is with a rest.** A follower may rest without limit only in
agreement; every other rest — an instruction outstanding, a refill, the audio
handover, an advert, a silent page — has a deadline that leads up the ladder,
and the top is the one rest that is not agreement. It is said on the picture
(*The film stopped responding on this device*) and on a `debug` account's
readout, never silently. Any change in what the room wants starts it again.

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
— which is why a *silenced* speaker's track stays unmuted, and why the floor
does not register in sense 4 at all. See *silenced*.

**This used to say that a watch party's tracks stay unmuted through a film,
flatly, and Rule A was built on it.** True of anybody whose microphone is open
— the film on a television, you in the room on your phone — and it says nothing
about watching on the device you are in the room on. That microphone was
**closed** for stereo, and a closed microphone is not a muted track but no
track at all, which is neither this sense nor sense 3 but the absence of
anything for either to describe. So a room watching a film the way the app
defaults to published nothing and read as defunct. Fixed 2026-09-23 by asking
`watch.status` in Rule A; see *Watch party* and
decision/2026-09-23-a-film-is-not-a-defunct-room.md.

**The device was held rather than closed for three days**, which made a
screening device hold a muted track where it had held none — and `publishing`
counts *transmitting* microphones rather than existing ones, so the room was
publishing nothing either way and Rule A was needed either way. That
arrangement is gone as of 2026-09-26 and a screening device has no track again,
so this rests on exactly what it originally did. Worth knowing only because the
reasoning was rewritten once for the muted-track version and is now back. See
`isScreening` in core/micNeeded.ts.

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

## Placed

A player seen where the room is since the room's position last jumped —
`inPlace` in `core/watch.ts`, observed rather than assumed from a seek having
been sent. A player that is not placed is owed one seek: a screen arriving at a
party, a rebuilt page, the film back from an advert, every player after a scrub
or a replay. **Not in step**, which would be a claim about drift: a placed
player may drift as it likes, since nothing corrects drift.

## Playout

Whether this device is actually rendering the audio it is subscribed to, read
from `inbound-rtp` sample counts. The only measurement of that which does not
itself stop the audio: reading the WebRTC audio device module killed the sound
for four days in August 2026, and the diagnostic panel was the fault.

## Promotion (of the audio session)

A device already stepped in moving from `LISTENING` — `playback`, hearing the
room with no microphone — up to `CALL`, which captures. **Not stepping in**,
which takes `CALL` directly from no session at all; a promotion is the
microphone coming back to somebody who was in the room without one. The film
leaving a device that was *watching here* is the common case; a *guest* being
granted speech is the other.

**A promotion is deferred while the app is in the background**, because iOS
lets a backgrounded app keep a microphone and refuses it a new one. The device
stays on `LISTENING`, so it still hears whoever is audible, logs
`capture deferred (backgrounded)`, and promotes at the next foreground.
`deferring` in `useSessionAudio.ts` is the whole rule. **Only the transition is
withheld**: a session already `CALL` going to the background is the ordinary
case of switching apps mid-conversation, and keeps what it has.

**What it separates is hearing from speaking.** Before it, one answer served
both, so on 2026-09-05 a locked phone asked for `CALL` for an arrival, was
silently refused, and rendered nothing for four minutes — denied the
microphone, it was denied the voice as well.

**What it does not do is keep the process alive.** `LISTENING` holds a
backgrounded app only while audio is actually flowing, and a deferral in a
room that is *party-muted* has none — so a phone handing the film to a second
device from a pocket can be suspended before it ever reaches the foreground.
`task/keep-alive.md`.

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

See `decision/` § *The phone holds a microphone in order to hear*, a whole
investigation into this participant's track failing to render on a device that
was subscribed to it.

## Reconcile / restate

`reconcileSilence` — comparing what was stated to the media plane against what
the room is actually carrying, once a tick, and restating the difference. A
phone whose connection flaps rejoins publishing a new track id, which the mute
already stated does not name. **The transition is for latency and the
reconciliation is for truth**; do not collapse one into the other.

## Reported call

`modules/reported-call` — a step-in, reported to iOS through CallKit as an
**outgoing** call, whoever arrived first: stepping in is always the person's
own act, and an incoming call would ring them. It begins when `mediaRoom`
appears and ends when it goes, so every exit from stepped-in ends it, and a
reconnect, which rebuilds the room and keeps `mediaRoom`, does not. Every
call is a line in Recents, so a call cycled by a reconnect would fill Recents
on a bad network.

It is shown under the *channel title*, and updated as an unnamed channel's
title changes. That title reaches Recents, CarPlay and the Watch, and through
iCloud every device on the Apple ID.

**What it buys**: Recents, the green pill, and other calls meeting this one
as a call. **What it does not buy is a call screen.** iOS gives a call an app
places none, the pill opens the app, and Channel View is the call screen. So
it gives no mute without a passcode either. See
`decision/2026-10-08-a-channel-is-an-outgoing-call-and-channel-view-is-its-screen.md`.

**Its muted flag is the card's mute.** CallKit keeps one, and CarPlay and the
Watch show and set it. It follows exactly what the lock screen card shows —
Self-Mute, or no microphone — and never Muted-by-Claim or Party-Muted. A mute
set from CarPlay or the Watch is the card's Mute by another road, held to the
card's guard: one the card would refuse is not acted on, and the flag is put
back.

**It is not `CALL`**, the audio session configuration, and not the session
want `call`. All three are about a phone holding a microphone, and none of
them is the other. A guest without speech and a device watching here hold a
reported call while their session is `LISTENING`, which is meant to work and,
as of 2026-10-08, has not been measured on a device.

## Restore

Reviving every unended channel from its state blob at startup. A restart costs
the volatile half of *channel state* — presence, the floor, a recording in
flight — and not the channel. A deploy costs presence, not channels.

## Room

**One LiveKit room, from creation to deletion — and, since 2026-10-09,
nothing else.** LiveKit creates a channel's room when the first person
connects and deletes it `ROOM_DEPARTURE_MS` after the last leaves (its
`departure_timeout`, 20 seconds, which `bin/provision-livekit` sets). Being
here — present, or a guest — is holding a connection to it, so its lifetime
is a channel's **sitting**: first person here to last one gone,
which is what the user means by a room and the meaning Rodrigo gave the word
on 2026-10-09. `ChannelState.mediaRoom` is the *name* a channel's rooms are
opened under — reused by every one of them, and not the same as the channel's
id for a channel that took in a moving conversation.

On the server a sitting is written as it happens, in `rooms`
(`server/src/rooms.ts`), on the two transitions of `peopleHere`; stepping
back in inside the departure window carries the same one on, as the LiveKit
room does. **A restart ends it**, because the boot deletes every channel's
LiveKit room, so the people reconnecting are in a new one however soon they
come. The guests go with the last member (`settleEmpty`), so a room ends for
everybody at once — *the seat ends when the room does*. `RoomView` is one on the wire; the *Record* tab
is laid out in them and shares one's audio whole, its recordings back to back
with the gaps dropped. A recording that fell in no sitting — every one made
before rooms were written — is listed as a room of its own, `standIn`.
"Sala" in Spanish.

**Three other senses were retired the same day**, and their words replaced:

- **The people in it now, guests included** — "in the room" — is **here**:
  *Everybody here hears it*, *anyone here can change it*, *Here as a guest*.
  `inRoom` is `isHere`, `roomOccupants` is `peopleHere`.
- **Their sound** — *Mute the room*, *hear the room* — is **everyone**:
  *Mute everyone*, *Everyone is muted*, `canUnmuteEveryone`.
- **Has the room** is **present or empty**, `presentOrEmpty`; see that entry.

**Older prose still says it**, in this file and in code comments: "the room"
for the people present, mostly. Read it as *here*; rewrite it when you are in
the paragraph anyway, and do not take it as licence to use the word that way
again.

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
count. That is deliberate and settled: decision/ § *Sessions are ended
wholesale, and that is not a defect* is the gap, and why it is not being
closed.

**Not the audio session**, which is the other thing this word means in this
codebase and is more often what a file named `session.ts` is about — see *session
want*. Nor a `guest_sessions` row, which is a *seat (developer sense)*.

## Session want — `call`, `listen`

The two answers to *what is this app asking iOS for*, named by `SessionWant`
in `app/src/audio/session.ts` and decided in one place, `wantFor` in
`useSessionAudio.ts`; `sessionFor` turns one into a configuration. **A request,
not an observation** — the audio debug panel shows `asked` against `actual`
precisely because they can differ, and most of this system's audio history is
that gap.

**`call`** is `CALL`: `playAndRecord` / `videoChat` with `allowBluetooth`,
`allowAirPlay` and `defaultToSpeaker`. The only one under which this device may
transmit, and on a Bluetooth headset the hands-free profile — mono, 24 kHz.
Asked for by anybody stepped in with a microphone to open: a member, or a
*guest* who may speak.

**`listen`** is `LISTENING`: `playback` / `spokenAudio`, hearing the room with
no microphone, in stereo. Asked for by three cases: a guest with no speech
grant, a device *watching here* while its film plays — see `isScreening` in
`core/micNeeded.ts` — and a *promotion* deferred while the app is backgrounded.

**Both are exclusive.** Neither carries `mixWithOthers`, so taking either stops
another app's audio; being in the room is the claim. Somebody who wants their
music left alone declares *nearby*, which asks for nothing.

**There is no third value, because the third state is not a configuration.**
Nearby, stepped out and not in a room are one audio state, *none*: the session
is deactivated, which is a thing that happens rather than a category that is
written. See `policyFor`.

**Four values have existed and gone**, and a reader who finds one in an older
document is reading about something that no longer exists. `idle` —
`playback` with `mixWithOthers`, handing the audio system back — was the second
value until 2026-09-08, when stepping in became a claim and the state it
served became a phone with no session at all. `WAITING` was `call` plus
`mixWithOthers` and lasted one day, 2026-09-06. `ducked` was
`idle` plus `duckOthers` and lasted about an hour. `SCREENING` held a
microphone under a film from 2026-09-23 to 2026-09-26, and the room could not
talk after a pause; see `planning/decision/2026-09-27-the-film-stops-the-engine.md`.

`policyFor` hands the SDK's native observer the same answer — a second writer
that re-applies a configuration on every engine transition with no JavaScript
in the path — and the two must agree or the last write wins. See STATES.md §
*Audio Session Configuration*.

## Silence notice

`SilenceNotice` in `server/src/channels.ts`, kept for a week in the
`silence_notices` table (server/src/diagnostics.ts) and laid on the phones'
timeline by `bin/diagnostics`; the journal gets only its kind and channel.
Three kinds:
`restoring` — after a release, a pair that was withheld found not yet heard and
asked for again, meaning the first attempt missed; `unrestored` — a room still
not seen restored ten seconds after the withholding ended, said once per
release; `unheard` — an *unheard report*. The first two are the server's view
of what it asked for; only the third is evidence of what happened.

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
box. See decision/ § *Three variants of deploy*.

## Transport

**Two things, and saying which is the whole of the entry.** The *row* —
play/pause, ±15s and the scrubber, `WatchTransport` in
`app/src/watch/Transport.tsx`, drawn in three places and the only way anybody
drives the film since YouTube's own bar went on 2026-09-18 — and the room's
*playback state* that the row drives: `WatchState`'s status, banked position
and start, from which `watchPositionMs` derives where the room is. The row sends
actions and holds no state; the state is the server's, and every *follower*
follows it. *The two transports are exclusive* means the film's state and the
shared track's.

## Unheard report

`ClientMessage.channel.unheard`, sent by `useUnheardReport` — a listener's
device saying it has gone five seconds without a subscription to somebody the
channel has in the room, who is publishing and is not *withheld*. Once per
episode, with a `heard again` line in the device's own log when it ends, and
never while the room is reconnecting. The server checks it against the room and
logs it as a *silence notice*; it repairs nothing, yet.

The other end of a *speaking report*: that is the withheld speaker's device
saying what no listener can see, this is a listener's device saying what the
server cannot.

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
- **decision/** and its closed volumes — why a thing is the way it
  is, including what was deliberately not built. Grep the whole set.
- **EXPIRATIONS.md** — every deadline measured in days.
- **AGENTS.md** — the traps that cost a day, and the five verbs (*land*,
  *deploy*, *upload*, *submit*, *release*), which are five different things and
  are not defined here because they are about shipping rather than about the
  product.

---

# Part Three — the same words in Spanish

Added 2026-09-23, when the app learned a second language. **This is the
vocabulary, not the copy.** Every sentence the app says is in
`app/src/i18n/es.ts`; what is settled here is the handful of *nouns* that have
to mean one thing throughout, because getting one of them wrong makes two
different states read as the same state — which is what Part One exists to
prevent in English and is easier to do, not harder, in a second language.

Only user-facing terms are here. Part Two is vocabulary that exists in the
code, which is written in English and stays so.

## The two rules the whole catalogue is written under

**Where Spanish agrees with a person, it takes the masculine.** *Visto por
última vez*, *· silenciado*, *Aquí eres invitado* — about everybody, whoever
they are. The app does not know anybody's gender, does not ask, and has no
field for one; the generic masculine is what Spanish does with a referent it
has not been told about, and that is the whole of the rule.

**It asks nothing of the copy**, which is what distinguishes it from the rule
it replaced on 2026-09-26. That one said *nothing agrees with a person's
gender*: the copy was to be built from constructions that take no agreement — a
noun rather than a participle, a state rather than a description of the person
in it — with the masculine generic allowed only where nothing else read
naturally. Two things were wrong with it. It held the copy hostage to a fact
the app had never asked for; and it was not being kept — *Visto por última vez*
agrees, and sits under a name on every contact row and every profile, which is
the most-drawn sentence in this catalogue that is about a person at all. A rule
broken in the commonest case it governs is not a rule.

**So `Visto` is correct, and is not a bug report waiting to be filed.** It has
been raised once and will be raised again by anybody who reads the old rule, or
who knows Spanish and not this decision. A gender setting was built on
2026-09-25 to feed it and was backed out the next day — see
`decision/2026-09-26-the-copy-uses-the-generic-masculine.md`, which is the
place to argue with any of this.

**The vocabulary the old rule produced is kept**, and this is the one thing not
to undo now that the dodging is over. Several terms below were chosen partly to
sidestep an inflection — *Invitaciones* for the group of pending seats, *Sin
entrar* for a member who has never come in — and every one of them also won on
the second rule below, against the other candidate words. They are better, and
they stay: nothing about being allowed to inflect makes a worse word better.

**A word is chosen against the other words, not on its own.** The same rule
Part One states for English, and the reason *Members* beat *Roster* on
2026-09-14 — see *Channel tabs*. The three *invitado* senses below are the case
that made it explicit.

## The three *invitado* senses, which are one Spanish word

English draws three distinctions here and Spanish has the one word. All three
are settled:

- **Guest** — *Invitado*. Somebody in the room through a link or an invitation.
  This is the sense that keeps the word, being the one where it is a noun for a
  person and not a description of a state.
- **Invitations** (the People tab's group of guest seats nobody has taken up) —
  *Invitaciones*. Settled 2026-09-22, ahead of the rest, in
  `decision/2026-09-22-the-members-tab-is-the-people-tab.md`: the noun rather
  than the participle, because *Invited as guests* renders as *invitados como
  invitados*.
- **Invited** (the status line on a member who has never entered) —
  ***Sin entrar***. Not *Invitado*, which would say that a member of the
  channel is a guest of it — the one distinction the roster cannot afford to
  blur. Naming the absence instead is true of exactly that state and collides
  with neither of the two above.

## The rest, one line each

    Channel               Canal
    Channel name          Nombre del canal — the name a member gave, never the
                          title; *title* is not a word on screen in either
    Channels (the tab)    Canales
    Contacts              Contactos
    People (the tab)      Gente
    Members               Miembros
    Community             Comunidad
    Owner                 Responsable
    Community link        Enlace de la comunidad
    Podcast               Podcast
    At the door           En la puerta
    Guests                Invitados
    Invitations           Invitaciones
    Clipboard (the tab)   Portapapeles
    Description           Descripción
    Invite (the tab)      Invitar
    Record (the tab)      Grabado
    Room                  Sala
    Here                  Aquí
    Mute everyone         Silenciar a todos
    Listen                Escuchar
    Watch                 Ver
    Podcasts              Podcasts
    Support (the tab)     Ayuda
    Help                  Ayuda
    Leaderboard           Invitaciones
    Chip in               Contribuir
    Floor Settings        Ajustes de The Floor
    Language              Idioma — the two languages are named in themselves in
                          both catalogues, *English* and *Español*; *Automatic*
                          is *Automático*
    Channel Settings      Ajustes del canal
    The floor             La palabra
    Claim / Release       Pedir / Soltar
    In / Nearby / Out     Dentro / Cerca / Fuera
    Step in / Step out    Entrar / Salir
    Present               Presente
    Stepped out           Ha salido
    In the app now        En la app ahora
    Last seen 3 hours ago Visto por última vez hace 3 horas — the one line in
                          the catalogue that breaks the gender rule above, since
                          *visto* agrees with the person; see
                          backlog/last-seen-agrees-with-a-gender-the-app-does-not-know.md
    Mute / Unmute         Silenciar / No silenciar — Apple's own pair, which
                          is what people already know from FaceTime, and short
                          enough for the footer's fifth of a phone
    Ping                  Aviso — *avisar* as the verb
    Nearby                Cerca
    Clipboard             Portapapeles
    Guest link            Enlace de invitado
    Knock (at the door)   Llamar — *En la puerta* as the state
    Seat                  Sitio
    Recording             Grabación
    Transcript            Transcripción
    Watch party           Ver algo juntos — a phrase, there being no noun
    Watching /            Viendo / Sin ver — the roster suffixes. The negative
    not watching          names the absence rather than negating the verb, on
                          *Sin entrar*'s reasoning above: *no está viendo* wants
                          a subject and a suffix has no room for one
    Motion to remove      Proponer expulsar — *expulsar* as the verb throughout;
                          *Retirar la propuesta* is standing down
    Removal notice        The card has no noun of its own in either catalogue:
                          it is a sentence, *Ya no estás en …*
    Refusal               No noun either: the heading is *Eso no se hizo*,
                          and the server's sentence under it stays English
    Public page           Página pública
    Username              Nombre de usuario
    Display name          Nombre visible
    Getting started       Primeros pasos

**Six of these are choices rather than translations**, and are the ones to
argue with rather than change quietly:

- **The floor → *la palabra***, and *Claim* → *Pedir*. The literal *el suelo*
  is a floor you stand on; *pedir la palabra* is the phrase Spanish already has
  for exactly this act, and it is what the application is named after. The app
  name itself is not translated — see *The Floor* in Part One, and `auth.brand`.
- **Ping → *aviso***. *Ping* survives untranslated in Spanish technical speech
  and means a network probe there as here; what this is, is one person asking
  for another by name, and a noun that says so beats a loanword that says
  *latency*.
- **Watch party → a phrase.** Spanish has no settled noun for it, and the
  invented ones read as marketing. Every place the English uses the noun, the
  Spanish says what happens: *ver algo juntos*.
- **Support → *Ayuda***. Settled 2026-09-24. The tab is two things in English
  under one word — questions answered, and money — and Spanish has no word
  that is both. It also holds four cards, each of which pushes a screen, so
  whatever single word it takes repeats one of its own destinations: *Ayuda*
  repeats the Help card, *Apoyo* repeats the heading on `SupportView` one tap
  inside. It was *Ayuda y apoyo* until then, which repeated neither and cost
  fourteen characters in a four-item bar. The collision is the cheaper price,
  and *Ayuda* is the sense somebody opens the tab looking for; *Apoyo* leads
  with the money, which is the one card there that nobody arrives needing.
- **Remove (a member) → *expulsar***. Settled 2026-09-26, against two words
  that are already spent. *Eliminar* is what this app says for deleting a thing
  — a recording, an account — and using it about a person would put removing
  somebody in the same family as deleting a file. *Quitar* is too light for an
  act two members have to agree to and a day is allowed for. *Expulsar* is what
  a group does to one of its members, which is exactly what this is, and it
  carries the weight the English *remove* carries here and nowhere else in the
  app. The proposal is *proponer expulsar* rather than a noun: Spanish has no
  short noun for a motion that is not parliamentary, and *moción* reads as a
  committee.
- **Leaderboard → *Invitaciones***. Settled the same day, and not the same
  problem: *Clasificación* named the button correctly — it is standings — and
  named nothing the user then saw, the screen it opens being headed
  *Invitaciones*. The button now says where it goes. *Puntaje* was tried and is
  the reading to avoid: it is a score, a number attached to you, and this
  screen ranks other people. The cost is that *Invitaciones* is now two things,
  this and the People tab's group of guest seats nobody has taken up —
  tolerable only because the two never appear on one screen, that group being
  inside a channel and this being Home. If either moves, this is the pair that
  breaks.

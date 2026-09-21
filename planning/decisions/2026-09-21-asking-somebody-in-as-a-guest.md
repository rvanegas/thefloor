# Asking somebody in as a guest

2026-09-21. Two ceilings that did not exist, and an offer that did not exist.

## What was wrong

**Nothing bounded guests.** `MAX_CHANNEL_PARTICIPANTS = 6` is read in five
places and every one counts `participants`. Nothing counted `state.guests`, and
nothing counted how many of them held a microphone — a member could grant one
to everybody who knocked. The *fewer than two guests hold microphones* line in
PROPOSITION.md had been read for months as a description of the system; it was
a proposal about *open channels*, which do not exist.

**And an account holder had no door into a channel but a browser.** Being
invited meant being made a member, which spends one of the six and is
permanent. Anybody else got the guest link, a server-rendered page, and — if
they tapped *Open the app* — a bare `thefloor://` that landed them on Home with
the conversation abandoned.

## The numbers

Six members, forty guests, two of whom may hold a microphone. A full room is
forty-six people and at most eight of them are audible.

**The two speakers are drawn from the forty rather than added to it.** A guest
granted the microphone occupies one of the forty, not a forty-first place.

Eight speakers sits under the box's recording ceiling of about ten simultaneous
participants (`track_cpu_cost: 0.15`, INFRASTRUCTURE.md) with two to spare, and
forty-six listeners is about a gigabyte an hour against a three-terabyte
allowance. Neither number was chosen from the hardware, but both were checked
against it.

## Where the checks went, which is most of the work

**The forty is on `GUEST_ENTERED`, not on the door.** Admission is two steps —
`ANSWER_KNOCK` removes the knock and the server then mints an identity and
raises `GUEST_ENTERED` — and a *reconnecting* guest re-enters through
`GUEST_ENTERED` with no knock at all. A cap at the door would let a full room
refill on the next blip, and a guest page reconnects on any blip and on every
deploy. `canAnswerKnock` carries the same term so the member's control
disappears rather than the refusal arriving after they tap.

**The two is on the guest's ask, not the member's grant.** A ceiling enforced
at the grant means a member tapping *grant* and being told no, which is
administration surfacing in the one place this design puts a boundary instead.
`canRequestSpeech` is new and holds the three clauses that were inline in the
`REQUEST_SPEECH` case, so the control the page draws and the action the reducer
accepts cannot disagree. `SET_GUEST_SPEECH` refuses a third grant out of the
blue as a second lock.

**It could not go in `canManageGuest`**, which is the trap worth recording.
That guard is shared by `SET_GUEST_SPEECH`, `EJECT_GUEST` and
`ASK_GUEST_CONTACT`. A capacity term there would leave a full room unable to
eject anybody — exactly the room that most needs to. A withdrawal and an
ejection must always be available at the ceiling.

**`GUEST_ENTERED` also clamps `maySpeak`.** It arrives from the seat's database
row, which remembers the grant across a disconnection, so a guest who dropped
holding the microphone and came back to a room whose two slots had filled would
otherwise have restored a third.

## The invitation is a seat, and the seat row is the whole of it

A pending guest invitation is a `guest_sessions` row and **nothing in any
`ChannelState`**. That is what keeps it out of `participants`, out of the
roster, and out of the room until its holder walks in.

Reusing that row rather than adding a table is why the lifetime needed almost
no new code. `channelEmptied` already pulls `expires_at` back to the moment the
last member leaves, so an invitation stops meaning anything when the room ends;
`eject` is already the manual revocation; the six-hour TTL bounds the rest.
`link_token` is null, which is the shape that column was made nullable for.

Two columns say which of three shapes a row has: no `invited_at` is an arrival,
`invited_at` without `accepted_at` is an offer nobody has answered, and both is
an offer taken up.

**Contacts only, and that is the no-strangers rule rather than caution.** A
guest *link* may reach anybody precisely because it cannot ring — it is inert
until somebody in the room opens the door. An invitation rings. So it is held
to the test `INVITE` is held to, and a non-contact stays reachable exactly as
they were.

**The push reuses `kind: 'invited'`.** `core/notifications.ts` records that a
previous kind was merged into `invited` "having ended the day differing from it
in nothing a rule could see — same collapse key, same thread, same lifetime,
same alert at every level." A guest invitation differs in none of those either.
A new kind would have meant a new arm in `alertFor` and a new row in every
preferences mapping to say what `invited` already says. The difference is one
sentence, which is the only place it is real.

## The seat a phone can take up

A seat's credential is a secret in the `sessionStorage` of the browser tab that
knocked. The app has no way to present one and never will.

`enterSeat` takes the account token as the whole credential, and that is sound
for exactly the seats it serves: the secret exists because an anonymous guest
has nothing else to prove they are the same visitor, and a seat with
`account_id` has a better answer. `liveForAccount` is already trusted to give
it — the Home card saying *you are a guest here* is drawn from that query. A
seat with no account on it is not found by the lookup at all, so signing in
afterwards is not a way to walk into one.

## What was deliberately not built, and why

**The app still cannot draw a seat**, and this is the half that is unfinished
rather than declined — but the reason it stopped where it did is a decision.

The obvious move is to admit a seat to `viewableBy` and render the member
channel screen in a guest mode. **That would be a data leak rather than a
feature.** `pushChannel` sends the app the whole `ChannelState`, every
participant resolved to a `PublicAccount`, and the channel's recordings.
`GuestView` deliberately carries names only — no ids that mean anything
elsewhere, no profiles, no recordings. Widening the first to reach a guest
undoes the reason the second exists.

So the in-app seat must be a `GuestView`-driven screen, and
`POST /channels/:id/seat/enter` answers with a `GuestView` for that reason. What
it needs beyond that is a LiveKit connection of its own and an iOS audio
session configured for it — and the audio session is the one thing in this
project that three components already disagree about (POSTMORTEM-echo.md), on a
rule that reads *whether **anybody** present is capturing* rather than whether
you are (STATES.md). That is not a thing to write untested on a device.

Two consequences, both recorded where somebody will meet them:

- **Seats stay hidden on iOS.** `ChannelsView`'s `Platform.OS === 'web'` filter
  stands. A card that opens nothing is worse than no card.
- **The guest page's button stays a bare `thefloor://`.**
  `thefloor://channel/<id>` is a URL the app already parses, and it is
  tempting — but what it opens is the member screen, which a non-participant
  cannot be shown. Landing on Home is honest; the other would look like it had
  worked.

## One bug found on the way

`ChannelsView`'s section ladder tested `kind === 'member'` for its third
section, so a seat whose room went quiet qualified for **no** section and was
drawn nowhere. It appeared only while `isLive` put it under *Live* and vanished
the moment the last person stepped out of a room the seat was still good for.
A place you can go back to is exactly what that list means.

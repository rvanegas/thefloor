# Three asks, not one

**Built on 2026-09-16, except for the app's guest client — see § *The app
holds seats too*, which is the one section describing work that does not
exist.** Everything else here is the account of what was written: the ladder,
the three acts, the credit rule, the routes, the controls, and the *Open the
app* button.

**Written the same day, as a design.** When it ships, what
survives moves to `decisions/` and this file goes — along with
`GUEST-CONTACT.md`, which this supersedes in one place and leaves standing
everywhere else. That file's floor reversal, its `Anon <n>` → `Guest <n>`
rename, its account-carrying seat and its rejoinable-seat argument are all
still the account of what is built. **What changes is the one sentence it was
built around**: "Acceptance is what also puts them in the channel … Not a
second decision and not a second tap."

## What was conflated

Two independent facts about a person in a room, which the code has been
treating as one:

- **Whether they have an account here.** `guest_sessions.account_id`, and
  `Guest.accountId` on the wire.
- **Whether they belong to this channel.** `ChannelState.participants`.

`Channels.acceptGuestAsk` does four things in one breath — claims the seat for
an account, writes the contacts row, dispatches `INVITE` on the asker's
behalf, and closes the seat. So answering *will you be my contact?* is also
answering *will you join this channel?*, and there is no way to be the first
without the second. `Guest.asks` has no `'accepted'` value for exactly that
reason: acceptance took the guest out of `guests`, so there was no state to
name.

**And a third act was missing entirely.** A member who wants somebody on The
Floor — not as a contact, not in this channel, just here — has nothing to tap.
The only door into an account from inside a room is the contact ask, which
asks for a relationship as the price of an account.

## The ladder

Four standings, three acts between them. **Each act is one tap and does one
thing**, and none of them implies the next.

| | Account | Contact of the asker | In the channel |
| --- | --- | --- | --- |
| Anonymous seat | no | no | no |
| Identified seat | yes | no | no |
| Contact, still a guest | yes | yes | no |
| Member | yes | — | yes |

**The common case is expected to stop at the second or third row.** A guest
without a membership is not a failure to convert; it is what a guest link is
for.

### 1. *Invite to The Floor* — an account, and nothing else

A member asks an anonymous guest to make an account. What they get out of it
is their own name in rooms, a seat they can come back to, and the rest of the
application; what the asker gets is nothing, which is the point of having this
separate from the ask below.

- **Offered only for an anonymous seat.** An identified one has an account,
  and a control that asked again would be asking a question already answered.
- **Answered where they are standing**, by the inline address-and-code
  exchange the guest page already carries for the contact ask. Through all of
  it they stay in the room, connected and audible. On acceptance the seat
  gains its `account_id` and **nothing else happens** — no contact, no
  invitation, no navigation, no hop. The room starts calling them by their
  account's name.
- **Refusable, and the refusal is kept**, on the argument
  `Guest.request` already makes about `'refused'` against `'none'`: one is a
  question nobody has answered and the other is a question that was answered
  no.

### 2. *Add contact* — a relationship, and not a membership

What exists today, with the second half removed. `acceptGuestAsk` claims the
seat, writes the contacts row, credits the inviter, calls `ensurePairChannel`,
and **stops**. No `INVITE`, no `Guests.close`, no `/open` hand-over.

- **The seat stands.** `asks[askerId]` becomes `'accepted'` — a value that
  could not exist before — and the guest is still in `guests`, still refused
  everything `isParticipant` guards, still holding the seat they arrived on.
- **It works on an anonymous seat too**, exactly as it does now: accepting
  identifies the seat first and then writes the contact, which is step 1 and
  step 2 answered in one breath because the person chose to answer both. The
  new ask above is the *weaker* offer, not a precondition.
- **The pair channel is still made.** That is what `ensurePairChannel` has
  always done on an accept, and it is a channel of their own rather than this
  one — the whole distinction this design is about.

### 3. *Add to channel* — a membership

The ordinary `INVITE`, naming `guest.accountId`, dispatched by the member who
taps it. Everything about it already exists: `dispatch` re-checks
`areContacts`, the roster's size and the asker's presence, so no new rule is
written.

- **Offered only for a seat whose account is already a contact of the tapper.**
  The control and the guard must not disagree, which is this codebase's rule
  everywhere, and `areContacts` is the guard.
- **This is where the seat closes.** `Guests.close` and `guestGone` move here
  from `acceptGuestAsk`: you stop being a guest at the moment you become a
  member, which is the only moment at which holding both would make one person
  two to everything that counts.
- **And this is the only act with a hand-over**, because it is the only one
  that changes which client should be showing the room.

## Who gets the credit

`invited_by` is set at sign-up out of a `pending_invites` row keyed on an
address somebody wrote to, and nobody writes to a guest. `acceptGuestAsk`
compensates today by crediting the contact-asker when the account was created
after the seat was admitted.

**With three acts the rule gets simpler and truer: the credit goes to whoever
asked the question that was being answered when the account was made.** A
*Floor invite* accepted credits the member who sent it; a contact ask accepted
from an anonymous seat credits the member who sent that. Both keep the clock
test — `created_at` later than `admitted_at` — which is what stops a member of
two years opening a guest link and being counted as somebody's arrival, and
both go through `Accounts.creditInviter`, which refuses an account that
already has an inviter and refuses an edge that would close a loop.

## Where each piece goes

**`core/`.** `Guest.asks` gains `'accepted'`. A second map beside it,
`Guest.invites?: Record<UserId, 'asking' | 'refused'>`, for the Floor invite —
a second map rather than a second field on one entry, because the two asks are
answered separately and a member may make either, both or neither. Three new
actions: `ASK_GUEST_JOIN` and `REFUSE_JOIN` mirroring `ASK_GUEST_CONTACT` and
`REFUSE_CONTACT` exactly, guarded by `canManageGuest` and `GUEST_ACTIONS`
respectively; and nothing for acceptance, which needs an account and is
therefore not a reducer action — the same reasoning `GUEST-CONTACT.md` gives.

**`GuestView`** gains `invites: Array<{ askerId: string; from: string }>`
beside `asks`, on the same terms: names, plus the one id an answer has to
address, and refused asks absent because they have been answered.

**`server/`.** `acceptGuestAsk` loses its last two acts. One new route beside
it — `POST /contacts/guest-invite/accept` — authenticating the same three
cheap ways: `requireAccount`, the seat's secret checked as `Guests.reconnect`
checks it, and `account_id` on that seat matching the caller or being claimed
by them. It claims the seat, credits the inviter, and answers `{ ok: true }`.
No channel id, because nothing about the channel changed.

**The web guest page** grows the second ask, and its *Accept* runs the same
inline sign-in the contact ask does before posting to the new route. It loses
the hand-over on contact acceptance, which is the code that moves to step 3.

**The app** gains a second control in `GuestCard`'s action row and a third,
and all three are disabled by the same `manageable` their siblings are:
*Invite to The Floor* when `guest.accountId` is absent, *Add contact* when
`asks[me]` is unset or `'refused'`, *Add to channel* when the account is a
contact and not already in the channel. **Three buttons is the honest count**
— they are three different things to ask somebody — and STYLE.md is the
authority on what a row of three looks like before any of them is drawn.

## The app holds seats too

**Built on 2026-09-22, with one of the bullets below reversed.** This section
was the last unbuilt part of this file; what is here now is the account of what
was decided, and `decisions/2026-09-22-a-seat-rides-the-member-socket.md` is the
account of what was written and why it differs. **Read that one first if the
two disagree** — it is the later document and it argues the difference.

**The reversal, in one line: there is no second protocol client.** A seat is
watched and acted on over the account's own socket — a new `seat` server
message carrying the same `GuestView`, and a `seat.action` client message
carrying the same `GuestAction`. The guest protocol's credential is a guest id
and a secret, which exists because an anonymous browser has nothing better; an
app holding a seat always has a session, this section's own first line being
why. So the bullet below that begins *A second protocol client* is what was
decided and not what was done. Its **second sentence still holds**: the app
needs its own room screen, `ChannelView` being member-shaped and `GuestView`
withholding ids deliberately. That screen is `app/src/ui/SeatView.tsx`.

**The bullet about versioning the wire is void.** Nothing installed speaks
`/gws`, so that protocol keeps its lockstep-with-the-server policy; the two new
messages are the member protocol's, which is already versioned and already has
a register.

**The decision: the app can be a guest, and only for an account.**
Anonymous seats stay in the browser, which is what the guest page is for and
what every anonymous path in this design already assumes. The app boots into
`AuthView` and there is no pre-auth surface worth inventing for a case the web
already serves.

- **A second protocol client.** `server/web/guest.ts` is the only thing that
  speaks `GuestClientMessage`/`GuestServerMessage`; the app's realtime client
  speaks the member protocol. The app needs its own, and its own room screen:
  `ChannelView` is member-shaped and `GuestView` withholds ids and profiles
  deliberately, so this is not a matter of relaxing a prop.
- **The wire becomes versioned, which is a rule change.** The guest protocol
  has had no compatibility policy because the guest page is rebuilt by
  `bin/deploy` and is lockstep with the server. An installed app speaking
  `/gws` ends that: AGENTS.md § *Never ship a wire change to a server before
  the client can speak it* applies to these messages from that moment, and
  `SHIMS.md` gets entries for them like anything else.
- **A seat is a room, so it takes the standing.** Opening one steps this
  device out of whatever channel it was in, exactly as opening another channel
  does. See STATES.md § *Present-in-Channel*, whose *standing* paragraph is
  where the seat has to be named.
- **The rejoinable seat stops being web-only.** `GUEST-CONTACT.md` says a seat
  row on Home is "web only, on the client … a phone rendering this row would
  offer a place it cannot open." **That sentence is now false**, and the
  filter it described is gone from `ChannelsView`: every seat row is drawn on
  every platform, and a tap takes the seat and opens it.

## Getting into the app, which is a button and not a link

**Guest links open the web app, always.** Universal links were considered and
deferred on the same day; `UNIVERSAL-LINKS.md` is the account of what that
would cost and when to revisit.

What the page gets instead is an *Open in the app* button, and three things
about it are worth knowing before it is built:

- **It is a custom scheme, necessarily.** A universal link does not fire from
  a tap on a page already on that domain, so this would be `thefloor://…` even
  if the AASA existed.
- **`app.json` now has `expo.scheme: "thefloor"`**, added with this work — it
  had none, so no build before this one registers any scheme at all. Applying
  it is a `prebuild` and a new build, and **no installed copy can be reached by
  this button until a build carrying the scheme is in somebody's hands** —
  which is an upload, a submission, an approval, a release and then each
  person's own update. The page-side half ships with the next server deploy and
  will do nothing on every phone until then.
- **And it opens the app, not a place in it.** Nothing in `app/src` reads
  `Linking.getInitialURL` or listens for a `url` event, so the scheme launches
  The Floor and the app lands wherever it would have. Carrying a destination
  needs that ingestion, and the cold-start half has to be held across the boot
  the way `handover.ts` holds the web one.
- **The page cannot tell what is installed.** iOS gives no answer, so a phone
  with no app, or with a build older than the scheme, meets Safari's *the
  address is invalid*. **So the button is shown only for an identified seat**
  — somebody with an account is overwhelmingly somebody with the app — and is
  worded as an offer rather than a promise. Making that graceful is precisely
  what universal links buy, and is the argument for revisiting them.

## What else has to change

- **`GLOSSARY.md` § *Guest* is wrong today** and gets wronger here. It reads
  "somebody in a channel with no account here", which stopped being true on
  2026-08-30 when a seat could carry an account. A guest is somebody holding a
  *seat* in a channel they are not a member of, with or without an account.
  § *Member*, § *Seat* and § *Guest link* all want a read in the same commit,
  and the one-line list at the top with them.
- **`STATES.md`** gains the seat in the standing paragraph, per above.
- **`SHIMS.md`** gains whatever the additive fields need, and the guest
  protocol's new compatibility policy is the thing to write down there first.

## The ordering

The core fields are additive and optional, like `asks` and `guests` before
them, so a client that knows about them meets a server that does not and
shrugs. The server and the guest page ship together. The app's three controls
need the server deployed first and nothing else. **The app's guest client is
the only piece with a real dependency**, and it is on the scheme being in a
released build rather than on any wire change.

## What was left out, and is the outstanding half

1. **The app's guest client**, per the section above — the protocol client,
   the room screen, the standing, and the rejoinable seat on Home.
2. **Deep-link ingestion in the app**, without which *Open the app* launches
   The Floor rather than taking anybody anywhere.
3. **A browser walk.** Nothing in this repository reaches `server/web/guest.ts`
   — no test in any package loads it — so both asks, the inline sign-in, the
   two accept routes and the `joined` hand-over have been exercised at the
   server and not through the page that calls them.

## What to test

The reducer's guards in `core/__tests__/guests.test.ts`: both asks, both
refusals, `'accepted'` surviving a `GUEST_ENTERED` replacement the way
`GUEST-CONTACT.md` had to make `asks` survive one, and a snapshot with neither
key. The round trip in `server/__tests__/guest-flow.test.ts`, and **one case
that is the whole point of this design**: accept a contact ask, assert the
guest is still in `guests`, still absent from `participants`, and still
holding a live seat. Then *Add to channel* as a second act, and the seat
closing only then. Plus a Floor invite accepted by an anonymous seat with no
contact written anywhere, and the inviter credited to the right member when
each of the two asks is the one that produced the account.

**And then a browser**, which is the half nothing here reaches.

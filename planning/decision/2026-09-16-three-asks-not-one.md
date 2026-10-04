# Three asks, not one

Built 2026-09-16. This is what survives of `planning/GUEST-LADDER.md`, the
design, deleted on 2026-10-03: the conflation it pulled apart, the ladder that
replaced it, and who gets the credit. It superseded one sentence of
`2026-08-30-asking-a-guest-to-be-a-contact.md` and left the rest standing.

**The app's half was built on 2026-09-22 with one reversal** — there is no
second protocol client; a seat rides the member socket — and
`2026-09-22-a-seat-rides-the-member-socket.md` is the account of it. Read that
first if the two disagree. Deep-link ingestion is `app/src/state/useChannelLink.ts`
and `useInviteLink.ts`. The browser walk it called for, which nothing in the
repository reaches, is in `backlog/untested-behaviour.md`.

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

# Somebody took up your invitation

2026-09-13.

A fourth notification, `accepted`. Whoever asked somebody to be a contact is
told when that person says yes — followed the *invite link*, or accepted the
*contact request*. It is the first notification this server sends that is about
a person rather than about a room.

The task was *Acceptance Notification*: **"If I send by email or guest link, I
want to be notified when that person joins so that if I'm free, I can meet them
right away. Consider it an arrival notification. Arrival to the app."**

## What *joins* was read as, which is the one judgement worth arguing with

**The moment the two of you become reachable to each other, not the moment they
create an account.** For the invite-link path those are the same instant, so
there is nothing to choose. For the email path they are not, and the difference
decides what the notification is worth:

1. Alice invites `bob@example.com`. The row sits in `pending_invites`.
2. Bob signs up. `resolveInvitesFor` turns the row into a **pending** contact
   request with Alice as the requester.
3. Bob taps accept. Now they are contacts, and `ensurePairChannel` gives them
   somewhere to talk.

Notifying at step 2 would say *Bob is here* at a moment when Alice cannot reach
him, cannot open a channel with him, and has nothing to tap. The brief's own
justification — *so that if I'm free, I can meet them right away* — is the
argument against it: step 2 is not a moment anybody can be met. Step 3 is, and
in practice it follows step 2 by seconds, because the request is sitting on
Bob's Home when he arrives.

The cost is stated rather than hidden: **somebody who signs up and never
accepts produces no notification at all.** That is correct rather than
regrettable — they have not agreed to be reachable, and an application that
announced them anyway would be reporting a relationship that does not exist.

In the ordinary case the whole question is moot, because the invitation email
carries the sender's invite link. Bob follows it, and the link redeems straight
to `accepted`, skipping the pending step entirely.

## Four call sites, and the fourth is the one that hides

A pair becomes contacts in four places, not the two anybody names:

- `/contacts/invite/accept` — an invite link redeemed. Body: *Followed your
  invite link.*
- `/contacts/:id/accept` — a request accepted. Body: *Accepted your contact
  request.*
- `/contacts/:id/request` and `/contacts/request`, **when the requests
  crossed** — B asks A back rather than tapping accept, which accepts A's
  request through the route for *sending* one.

The crossed pair is the case that goes missing, and it goes missing precisely
because the route is named for the opposite act. Both of them already carried a
comment about being the crossed case and already called `ensurePairChannel`;
the notification was added beside each.

Everything goes through one helper, `tellTheInviter` in `app.ts`, rather than
into `Accounts`. The rule about *who* becomes a contact lives there and has
never heard of a notification, and keeping it that way is the same separation
`ChannelRegistry` gets from the other direction.

## Two bodies, on the precedent `invited` and `arrived` both set

Following an invite link and accepting a contact request are not the same act,
and one sentence covering both would be false about one of them: there is no
link in the second case and no request in the first. The consequence is
identical — you are contacts now — and is deliberately left unsaid, because it
is on Home by the time anybody reads the notification and a lock screen has
room for the half that is news.

**The word *invitation* is avoided in both bodies**, though it is the brief's
own word and the word `invitedCount` and the leaderboard use. GLOSSARY.md
spends *Invitation* on an ask to join a **channel**, and a notification saying
"accepted your invitation" would collide with the one thing that phrase already
means on a lock screen. *Invite link* and *contact request* are the glossary's
own names for the two things actually accepted here.

## It names a channel, which is not a fudge

`PushMessage` keys three things on a channel id — the recipient's notification
level, the collapse key, and the thread — and this notification is about a
person. The pair channel resolves it: becoming contacts creates one in the same
breath, so there is a real id to hand over, every one of those three gets a
genuine answer rather than a sentinel nothing else would recognise, and it is
the channel the recipient wants anyway, since meeting this person right away
means stepping into exactly that room.

It sits on the **membership** side of both seams `push.ts` is organised around:
the `${channelId}:you` collapse key, so nothing about the room's comings and
goings can overwrite it, and `PARTICIPATION_LIFETIME_MS`, because that person
is a contact now and will still be one when a phone that has been off all week
comes back. The brief was about being timely, and this is the one place the
implementation does not follow it: being late with this costs the chance to
meet them that evening, and dropping it costs the only notice anybody ever
gets.

## It is quiet at the default level, deliberately

`alertFor`'s table gains a column and no new logic: `accepted` lands `passive` /
`silent` / `audible` across the three levels, which is `arrived`'s row.

The tempting alternative was `pinged`'s row — audible at the default — on the
grounds that a person decided to do this and aimed it at you, and that it
happens at most once per invitation ever. What rules it out is that **this is
the only notification that arrives before its recipient could have set a level
for the channel it names.** The channel is created in the same request. So
whatever that column says is what everybody gets, permanently, and making the
one unsettable notification the loudest is a decision nobody can undo. The
brief's own word for it was *arrival*, and the rung that governs arrivals is
`arrived`'s. Somebody who wants to hear about it can still say so afterwards,
in the row rather than the column, by turning that pair's channel up.

## No shim, and nothing for the client to learn

Purely additive on the wire. An older build reads `kind` in two places — the
sweep in `app/src/push.ts`, which filters for `arrived`, and the foreground
handler, which reads `reachesInApp` — and an unrecognised kind falls through
both to the behaviour that was already correct: not swept, no banner over a
foregrounded app. The Android channel is chosen from the *alert* rather than
the kind, so `silent` already exists on every install. Nothing in SHIMS.md, and
nothing the floor has to pass.

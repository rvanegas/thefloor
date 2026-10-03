# A ping comes from the room or from beside it

2026-09-14. `canPing` now asks the sender's own standing as well as the
target's reachability: you may call somebody back only while you are *present*
in that channel or *nearby* in it.

## The ask

*Ping should be an available action only to those nearby or stepped in.*

Read as a rule about the **sender**, which is the only reading that holds
together — a target who has stepped in cannot be pinged at all, that being the
whole of what the old `canPing` refused, so *nearby or stepped in* can only be
describing who the action is offered **to**.

## What it was

```ts
senderId !== targetId &&
isParticipant(state, senderId) &&
isParticipant(state, targetId) &&
(!isPresent(state, targetId) || targetId in state.disconnectedAt)
```

Membership on both sides, and reachability on the target's. Nothing about
where the sender was. A member could open a channel they had walked out of an
hour before, scroll the roster, and put a notification on somebody's lock
screen calling them to a room that would still be empty when they got there.

## What it is

One clause more, and it is the ladder GLOSSARY.md § *Nearby / Stepped out*
already draws — **in, nearby, out**:

```ts
(isPresent(state, senderId) || isWaiting(state, senderId)) &&
```

The two upper rungs are both *at this channel*. Present is obvious. Nearby is
the state the ping-rather-than-give-up rule was written for: somebody who has
declared themselves one notification away is exactly the person who should be
calling, and a promotion is one tap for them if the call is answered.
**Stepped out is away**, and a summons from away is to a conversation the
sender is not at either.

It lives in `core/` with the rest of the guard, which is what takes the button
off both surfaces at once — the roster card's wordless *Ping* and the profile
composer, which share `mayPing` in `ChannelView`.

## The refusal has its own rung on the server

`Channels.ping` checks the sender's standing above `canPing` rather than
letting `canPing` speak for it, because the sentence below is *They are already
here.* — nonsense as an answer to the one person who is not. It answers
**Step in or be nearby to ping.** instead, naming the two taps that fix it,
both of which are on the screen that asked.

## What this costs older builds

Nothing that needs a shim. A build shipped before today computes the old
`canPing` and will still draw the button; the server refuses it with a 409, and
`ChannelView` already swallows ping refusals on the reasoning that every one of
them is either self-correcting or unreachable. This one is self-correcting in
the plainest way: the reader stepped out, and that is a tap they just made.
The comment there now counts four refusals rather than three.

## What was not done

**No sentence in place of the button.** A ping button that is absent because
you are not in the room reads the same as every other control this screen
withholds, and the two taps that restore it are already the most prominent
things on it. A card explaining the absence would be the only such explanation
in the app.

**Nearby was not narrowed to declared-nearby.** `isWaiting` is the roster's own
*Nearby*, and it covers the implied kinds — a phone whose connection dropped,
somebody who stepped into another channel — as well as the declared ones. A
sender in any of them is still at this channel in the sense the rule cares
about, and a second definition of nearby is the bug
`core/channel.ts` § `isWaiting` already has an account of.

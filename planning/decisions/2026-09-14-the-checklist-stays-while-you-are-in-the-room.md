# The checklist stays up while you are in the room

2026-09-14. `conversing` no longer blanks the introduction card. It stamps
`conversedAt` and nothing else.

## The report

*Something is wrong with "Show checklist again". I press it. On restarting the
app, I see the various rungs. Then I step into a channel, and when I return to
the Home View, the checklist is completely gone.*

## What it was

`introduction()` opened with two suppressions and one retirement:

```ts
if (!loaded || !home || contactsBase === null) return { show: 'none' };
if (conversing) return { show: 'none' };
if (conversedAt !== null && allTried(tried)) return { show: 'none' };
```

The middle one was kept deliberately the day before —
`2026-09-13-the-checklist-outlives-the-first-conversation.md` § lists it as
*unchanged*, on the argument that **a checklist on screen during the
conversation it was asking for is the one moment it is actively silly.**

That argument is about a *screen*, and it names one this card is not on.
`HomeView` is its only reader; `ChannelView` draws none of it. So the rule
never fired for anybody looking at a conversation. What it actually hid was
**Home reached from the live bar** — the reader who stepped in, pressed back,
and is still standing in the room. Home is a tap away from a channel by design;
the tier keeps the live bar precisely so that leaving the screen is not leaving
the channel, and `AppProvider` keeps the snapshot for the same reason
(`channelViews` "deliberately outlives the screen").

That reader is the only one the four *try* rungs have anything to say to. They
are done inside a channel, and `224c912` — *A rung points at the room you are
in*, landed the same night — gave the card a `live` channel id so those rungs
could open the room on the tab the rung is about. **That pointer was inert for
anybody it was written for**: `live` is non-null exactly when you are standing
in a channel, and if anybody else is in there with you the card drawing it was
already `show: 'none'`.

So the rule was a day older than the rungs it hid, and survived the reversal
that should have taken it.

## What it is

The suppression is gone. `introduction()` no longer takes `conversing` at all;
`useIntroduction` still reads it, still stamps `conversedAt` off it, and that
is now its whole job.

Nothing else moves. Retirement is still `conversedAt !== null &&
allTried(tried)`, the dismissals still work as they did, and the card is still
drawn only on Home — which remains the answer to the original objection. You
cannot see this card during a conversation, because during one you are looking
at the channel.

**`stepIn` ticks under you while you stand there**, which is the visible
change: step in with somebody, go back to Home, and the rung you have just
climbed is filled in with the four below it still hollow and now pointing at
the room you are in. That is the Zeigarnik mechanism the design invoked doing
the thing it was invoked for.

## The alert loses half a sentence

*Show the checklist again* warned: **step out of any channel first: nothing is
drawn while a conversation is happening, and being in one with somebody marks
that rung done again straight away.** The first clause is no longer true. The
second still is — `conversedAt` is written off `conversing`, so resetting from
inside a channel with somebody hands back a ladder with its third rung already
ticked — so the warning stays and says only that.

## What this was not

Worth recording, because the first two things checked both looked like the
culprit and both were sound:

- **The server half of the reset.** `forget()` clears the local keys and asks
  `DELETE /me/tried` for the four account stamps, swallowing any failure. A
  failed or refused DELETE leaves `home.tried` all true, and then the *next*
  conversation retires the ladder within a frame of `conversedAt` being
  stamped — the same symptom, by a different road. It was not this road: the
  live row for the reporting account has all four `tried_*` NULL, so the
  delete landed. The hazard is real and is still there; it wants a separate
  look.
- **`conversing` being stuck true** on a channel view that outlived the
  screen. It is not stuck. It is correct, and correctly reports that you are
  still in the room — which is what the card was wrong to do anything with.

## Where it is

- `app/src/state/introduction.ts` — the suppression, removed, with the reason
  in place of it.
- `app/src/state/useIntroduction.ts` — `conversing` stops being passed on.
- `app/src/ui/HomeSettingsView.tsx` — the alert.
- `app/src/state/__tests__/introForget.test.tsx` — § *standing in a channel
  afterwards*, which is the reported walk: reset, take the cleared snapshot,
  step in with somebody, come back.
- `app/src/state/__tests__/introduction.test.ts` — the two cases that asserted
  the old rule, reversed.

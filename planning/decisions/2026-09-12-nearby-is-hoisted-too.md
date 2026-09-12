# Nearby is hoisted too

2026-09-12, the same day a declaration became an arrival.

Home's tier pins the channel you are standing in. It now pins the channels you
are merely within reach of as well — one bar each, in a hue of their own — and
the two hoists are the same gesture applied to two rungs of the same ladder.

## Why it needed anything at all

*Nearby* is the rung that says a notification will find you, and it is the one
state with no sign of itself anywhere you are likely to be looking. Presence
has the live bar, the audio session and a microphone. A declaration claims
nothing — no room, no media subscription, no audio — so once you leave the
channel's own screen the only evidence it happened is in a roster you are not
reading, on a screen you are not on. The arrival it exists for is offered by
`ChannelView`, which is precisely the screen you walked away from.

So the tier says it, for the live bar's reason rather than by analogy with it:
the pinned top of Home is where the states that outlive both lists are stated,
and *nearby* is now the second of them.

## Several, because nearby is not exclusive

Presence is one channel: entering steps you out of everywhere else. A
declaration is one tap in one channel and says nothing about any other, so an
account can be nearby in three rooms at once — and **the two states cannot both
hold**, since entering clears the wait where you arrive and a chosen exit
clears the one you leave. Either you are present in one, or you are nearby in
nought, one, or more.

The interface follows that exactly. The bars are a mapped run, one per channel,
ordered by `byIdleness` like the list below them; and they are suppressed
entirely while there is a live channel, because a snapshot claiming both is one
that has not caught up and presence is the half that is true.

Nothing is lost when they are suppressed. A channel with no bar is a channel
with a row: `HomeView` decides which channels got bars and hands exactly those
ids to `ChannelsView`, which drops them the way it already drops the live one.
One decision, made in one place — the alternative, letting the list drop any
card whose own `nearby` bit is set, loses the channel from the screen entirely
in the case where the bar was suppressed.

## A hue, not a dimmer accent

`nearby` and `nearbyDim` are new tokens in both palettes: blue, and paler than
the floor's violet. The obvious cheaper move — the live bar's block with
`floorDim` turned down — was rejected because it says *less of the same state*
about a different state. Two rungs differ in kind, so they differ in hue first
and in weight second: 15pt regular against the live bar's 17pt semibold, a
hollow dot against a filled one, and the quieter colour.

It is also the last unclaimed hue on the palette. `silenced` is orange,
`recording` and `danger` red, `success` green, `floor` violet — so blue means
this and nothing else, and a second *saturated* colour beside the accent would
have read as a second alarm.

`nearbyBar` is a copy of `liveBar` rather than a variant of it. Four
declarations are stated twice; sharing the block and overriding two colours
reads tidier and hides that these are two states, and the next difference
between them would land as a third override instead of in a block that says
what it is.

## The tap does not step in

The bar navigates and nothing else. Stepping in is what *ends* being nearby, so
a bar that dispatched `ENTER` could be pressed exactly once, and it would be
answering a question nobody asked — the arrival offer, *Step in* or *Stay
nearby*, belongs on the channel's own screen where the roster is already drawn.
So the press goes through `onEnterChannel`, which in `App.tsx` is a navigation,
and the list's own `ENTER` on tap is not copied here.

## The bit comes from the server, unlike the live bar's

`RejoinableView.nearby` and `InviteView.nearby`, both optional, both set from
`isWaiting`. The live bar is handed down from `App.tsx` because presence is the
device's question as well as the account's: the server can hold you present in
a channel this process has never heard of, and only the app knows what it is
actually connected to.

Nearby has no such seam. It claims no audio and no room, so there is nothing
for a device to disagree with — the account is within reach of these channels,
which is the same bit everybody else's roster is reading, and the snapshot is
the whole answer. `nearbyIn` in `AppProvider` stays what it was: the *device's*
declaration, which decides whose screen an arrival is offered on, and that is a
narrower question than which rooms you are within reach of.

The field is a bit per channel rather than an id on the snapshot, for the
reason above: several is an ordinary state.

An invitation carries it too. A declaration is not an entry, so `everPresent`
still excludes you and the channel is still an invitation while you stand
outside it — which means a nearby channel can be one you have never been in.

## Deliberately not done

- **No count of who else is nearby.** The bar says how many are *present*,
  which is what makes going back worth it. Who else is within reach is the
  roster's, and it is on the channel screen.
- **No automatic anything.** Promotion was built and removed on 2026-09-08; a
  bar is a sign, and the offer that follows an arrival is still an offer.
- **No sort of its own between the bars and the live bar.** They never coexist.

Wire, hue and interface: `core/protocol.ts`, `server/src/channels.ts`,
`app/src/ui/theme.ts`, `app/src/ui/ChannelsView.tsx` (`nearbyChannels`, which
is exported so the bar and the row cannot disagree about what a channel is
called), `app/src/ui/HomeView.tsx`. Tests in
`app/src/ui/__tests__/home.test.tsx` § *Home while nearby* and
`server/__tests__/presence.test.ts` § *Home is told which channels you are
nearby in*. The optionality is registered in SHIMS.md at gate 188.

# 2026-09-20 — The second device is a television

A watch party can be spread across two instances of one account: the film on
one, the presence on the other. They were never interchangeable — one holds the
microphone, the floor and the rungs, and the other holds nothing but a picture
— and until today the application drew them as though they were. The second
device got the whole channel screen: six tabs, the roster, the floor, *Watch
on*, *Stop watching*, the field for swapping the video, the share links, with
the film docked on the sixth tab under all of it.

**So every control of the party existed twice, on two devices, and the one
thing a television is for was one tap in.** Somebody who had just sent the film
to the laptop had to find *Watch* on the laptop to see it, and then had two
copies of every control — including a *Watch on* switch pointing at the device
it was drawn on, which is the remote control being in two places at once.

## What is drawn now

The second device is an early return in `ChannelView`, the same shape as full
screen and as the settings, the profile and the transcript above it. On it:

- **The picture**, in a `DockSlot` — the hole, not a player. The one `WebView`
  hangs above the route table and lays itself over the hole, which is what
  keeps a party to one page, one buffer and one set of audio.
- **The transport** — the scrubber, ±15s, play/pause — which is the same
  element the watch card draws and not a copy of it.
- **Full screen**, ungated by the floor as it is on the card: how big the film
  is on one device is nobody else's business.
- **The three rungs**, in a footer of their own.
- **The header**, which is a caption — *Watching* and the channel's name — and
  holds no control at all.

What is deliberately absent is every other control of the party and of the
channel: *Watch on*, *Stop watching*, the swap field, the room mute, the share
links, the settings gear, the recording pill, the five tabs that are not the
film, *Home*, and — above `SPLIT_AT` — the channel list beside all of it.

## Why the rungs are the exception, which is mechanical

The rule this came in under is *only controls immediately relevant to the video
are on both devices*, and the rungs plainly are not. They are there because
**without them this state has no exit at all.** *In* takes the presence, which
makes this the first device and hands back the ordinary channel screen a render
later. *Nearby* and *Out* both leave, which gives up the screen role and stops
the film. The switch that sent the film here is on the other device, so nothing
else on this screen reaches any of it — take the rungs away and the second
device is a picture that cannot be put down.

They are also what *decides* which device is which, which is the other half of
it: first and second are not stored anywhere. `secondDevice` is
`screenIsHere && !steppedIn`, read at render.

## Home and the list beside it, which went the same afternoon

The first version of this kept *Home* in the header, on the argument that a way
off a screen is navigation rather than a control: without one the second device
is an application that cannot be used for anything else until somebody stops
watching, and there was no reason to buy the tidier statement at that price.
Both halves of that are true and the conclusion was wrong. **That price is what
a television costs, and it is the thing being bought.** The way off this screen
is to stop watching, which is a rung; and the account is holding the other
device, where every way into the rest of the application already is. A second
device is not a phone somebody is also reading on.

The list went with it, and it was the larger half. Above `SPLIT_AT` — a laptop,
which is where a watch party is actually watched — `Panes` drew every other
channel in a column down the left of this screen, two thirds of the window, on
the one device that exists *because* the rest of the channel is somewhere else.
It is the remote control drawn a second time, which is the whole of what this
entry is about; it simply survived the first pass because the split is decided
above `ChannelView` and nothing about the television reached it.

**The mechanism was already there, and this is its second caller.**
`WholeWindowContext` was written for the expanded picture, with a comment
saying it had exactly one caller and must not become a general override. It
still must not: what earns a claim is being the only thing somebody is looking
at, which is a fact about why a screen exists rather than about how much room
it would like, and the television is the second screen in this application of
which that is true.

**But it wanted a smaller claim than the film's**, so the claim now says which:
`glass` takes the hardware's bottom inset as well and stays `FullScreen`'s
alone, `list` takes the list and nothing else. The television keeps its gutter
because it keeps a footer, and three rungs lying across the home indicator is
exactly the trade `Glass` says nobody pays for here. One claim is in force at a
time, which is a fact about the two callers rather than a rule the context
enforces — both are early returns from `ChannelView` and full screen comes
first — and React running every cleanup in a commit before every mount is what
makes the handover land the right way round in both directions.

The settings gear never survived any of this: it is a channel control, and this
screen has none.

## What had to move with it

**`atTheFilm` was gated on `tab === 'watch'`.** A screen with no tab strip has
whatever `tab` happens to hold, which is *Members* — so the one surface whose
entire purpose is the picture was the only one that could not expand it, and on
a phone could not be turned either. It is `(tab === 'watch' || secondDevice)`
now.

**The three rungs came out of the footer into a `rungs` element**, for the
reason the transport is one row drawn in two places: two sets kept in step by
hand are two sets that drift. Only one of the two footers is ever mounted.

**The claim is gated on `fullScreen`, not on `wantsFullScreen`.** The two are a
render apart while the effect that syncs them settles, and the early return
above reads the first — so claiming on the second puts the list back for one
render on the way into full screen.

**Three slots in that footer rather than four does not bend STYLE.md's rule 6.**
That rule is that a control never moves under a thumb already on its way to it,
across every state *one screen* can be in — and this bar is three rungs in all
of them. A screen with its own footer is not the channel's footer changing
shape; Home has no footer at all.

## What is not covered

**Nobody has watched a party on two devices since this landed.** The tests are
nine cases in `app/src/ui/__tests__/channelSharing.test.tsx` § *the second
device*, and they are assertions about what a second device draws and what it
does not. What they cannot settle is what the state feels like with a real film
on a real laptop; that is the walk in
`backlog/the-watch-party-has-been-walked-once-and-the-rest-of-the-walk-is-outstanding.md`,
and this has made that walk more worth doing rather than less.

**And it is not the follower page.**
`backlog/the-follower-page-s-control-logic-has-no-test-and-has-now-produced-four-defects.md`
is about `follow()` in `server/src/watch-page.ts` — the page a *guest browser*
runs — which is untouched here and still has no test. Two different things are
called the second screen in conversation and only one of them is this.

**A guest is a second device like anybody else.** `screenIsHere` is `inRoom`
rather than `present`, so a guest who opened a link in a browser and handed the
film somewhere gets this screen too. Nothing about it was designed for that
case and nothing about it obviously fails there.

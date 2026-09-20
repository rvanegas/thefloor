# Declining to be the second device

The television — `decisions/2026-09-20-the-second-device-is-a-television.md` —
had three ways out and all three of them were rungs. *In* takes the presence,
*Nearby* and *Out* leave the room. Somebody who simply did not want the film on
this particular screen had to change their standing in the channel to say so,
and the switch that had sent it there was on the other device.

So there is a fourth now: **Not on this device**, a full-width `ghost` under
*Full screen*. It calls `app.showScreenFor(null)` and nothing else.

## What it does and what it deliberately does not

It hands the *screen* role back. The film stops being on this glass, the
player unmounts, and the server is told — so the *Watch on* switch on the
device holding the room stops saying the picture is over here, which is where
the person actually is and the only place the withdrawal needs to be visible.

**It says nothing to the channel.** No `STOP_WATCH`, no rung, no pause. The
account stays present on the other instance, the party's clock runs on for
anybody else watching, and nobody's microphone changes. It is the same act the
*Watch on* switch performs, said from the other end — which is why it passes the
rule that kept every other control off this screen: *only controls about the
film are on both devices*. *Watch on* fails that rule because it points at the
device it is drawn on; declining does not.

## Two things it is not, both of which were tried in conversation

**Not *Home*.** That was the first answer and it lasted an afternoon. Home is
navigation, and binding "stop being the screen" to it gives one glyph a second
meaning it carries nowhere else in the application. The tell is that it was
being proposed as *Home, but also pause, and also unmount* — three effects
under a word that means one.

**Not a pause.** `WatchState.status` is channel state: one film, one clock, for
the whole party. A pause on the television pauses it for every member, and
`isPartyMuted` is `roomMuted && status === 'playing'`, so it also hands the
entire room its microphones back. That is a room act triggered by one person's
navigation — and the pause button is already on that screen, two inches below.

## A television never has a corner

The picture floats when no screen leaves it a hole — `Picture`'s
`place = slot ? 'docked' : 'floating'` — which is right for the device somebody
is standing in the room on: going Home there leaves the film in the corner and a
tap on it comes back. It is wrong here. A television shrunk into a corner with
the channel list back beside it is precisely the state that screen was made to
stop being.

Nothing on the screen reached it, but **the web did**: the browser's back button
and address bar leave any screen in this application, `useRoute.web.ts` being
the half that listens. So leaving the television by any route gives the role up
— a cleanup beside the two that already clear it for a party ending and for
leaving the room.

**It is a `useLayoutEffect` rather than a `useEffect`**, which is the one
subtlety worth keeping: a passive cleanup runs after the frame is painted, so
the corner this exists to forbid would be drawn once on the way out.

**The rule is kept there rather than in `Picture`**, which is where somebody
will look for it — there is a comment there saying so. `Picture` cannot tell
the two meanings of a null `slot` apart: a screen that has gone away, and one
whose `onLayout` has not landed yet. The second is every arrival, and a rule
written there would stop the film on the frame it started.

## Words

*Not on this device* is the *Watch on* switch's own answers in the negative,
which is the vocabulary somebody chose this device with. The sublabel — *The
film leaves this screen; the party plays on* — says the consequence before the
tap, per STYLE.md § *Words on controls*, and says **leaves** rather than
**stops** because what a reader needs to know is that this is not the film
ending.

Full width rather than a `flexButton` beside *Full screen*: half a phone's card
is about 140 points and the label does not survive it.

## What is not covered

Still nobody has watched a party on two real devices. Four cases were added to
`app/src/ui/__tests__/channelSharing.test.tsx` § *the second device* — the
button's act, its absence from the ordinary channel screen, the release on
unmount, and that the first device keeps its corner — and what they cannot
settle is whether *Not on this device* is the thing somebody reaches for when
the film is on the wrong screen. That is still the walk in
`backlog/the-watch-party-has-been-walked-once-and-the-rest-of-the-walk-is-outstanding.md`.

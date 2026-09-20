# Sideways, the only controls are the film's

2026-09-20

Full screen on the *Watch* tab now carries the transport and nothing else:
pause and play, the progress bar, and the two fifteen-second seeks. Two
controls went to make that true, and they were added on consecutive days by
arguments that were each right about something narrower than they claimed.

**The channel's own pinned bar.** It was made a sibling below the picture when
full screen was a flag, and overlaid on the scrim with the transport on
2026-09-19 when the chrome started fading. The argument for keeping it was that
this is a talking application before it is a video one, and that an evening
where nobody can reach their own microphone without first leaving the film is
the wrong trade. That argument is still true and is not what was wrong with it.
What was wrong is that the bar was buying reachability that was never more than
a turn of the wrist away — and since 2026-09-19 that turn is *the* gesture for
getting back to the room, the same one whatever it is you want the room for.
Five controls about the room, standing over a film, to save a gesture somebody
is going to make anyway.

**And *Back to portrait*.** It was the way out for somebody the accelerometer
cannot help — lying down, or holding the phone flat on a table — and it is the
one whose removal costs something real.

## What this costs, which is not nothing

The person holding the phone flat now has no way out of full screen. Neither
does anybody on the web, where there is no device to turn and
`returnToPortrait` is a deliberate no-op. That is a genuine dead end and it is
recorded here as one.

It is not answered with a button, because a button is the wrong end of it.
**A window that is landscape has not necessarily been turned landscape by
anybody.** A phone flat on a table, an iPad held the way iPads are held, and
every desktop browser window are all `width > height`, and `useIsLandscape`
cannot tell any of them from a person deliberately turning a phone to watch
something. Full screen is entered for all four. The three that did not ask for
it are the bug, and giving them an exit would be dressing it.

So the exit is not restored and the derivation is the open question — see
`ChannelView`'s `wantsFullScreen`, which is where it will be answered. `returnToPortrait` and
`PORTRAIT_HOLD_MS` are left in `watch/orientation.ts`, uncalled and still
under test, because whatever answers that question is likely to want a way to
turn the interface that does not involve turning the device.

## What the tests hold

The absence, named control by control rather than counted. Both suites assert
it, and they fail differently on purpose: `watch/__tests__/fullScreen.test.tsx`
can only prove the component draws nothing it was not given, and
`ui/__tests__/channelSharing.test.tsx` proves the footer is not given. The
regression this guards against is a control creeping back one at a time, which
a count would not catch.

`channelSharing`'s probe for *am I expanded* had been the presence of *Back to
portrait*, and is now the scrim's `testID`. With the last control gone there is
no longer any word that is over the film and not also on the card — the
transport being deliberately the same row in both places — so the only thing
left to recognise the state by is structural.

# Audio output is not a channel setting

Moved 2026-09-17. The *Audio output* card — the button that raises iOS's own
`AVRoutePickerView` — was on Channel Settings from the day it was added and is
on Floor Settings now. Nothing about the control changed: same sheet, same
label, same sublabel, same `Platform.OS === 'ios'` guard, same
`audio/routePicker.ts` underneath.

## Why it was there, and why that reasoning does not reach it

Channel Settings holds what is about the channel rather than about the
conversation going on inside it — the name, whether it records itself, how
loudly it may ring this phone, the doors onto it, and the ways a membership
ends. The picker was placed by that test, and the comment above it said so:
*here rather than on the channel screen because it is not part of holding a
conversation*. Which is true, and answers the wrong question. The test decides
between the channel screen and the channel's settings; it never asks whether
the thing is about a channel at all.

It is not. Where sound comes out is a property of the phone and of what is
paired with it. The sheet is the same sheet for every channel; the route
survives leaving the channel it was set from and is still in force in the next
one and after the app is closed; and somebody who wants their car stereo does
not want it for one conversation. Nothing on the card is per channel, and the
screen it sat on could not offer it without a channel to be in — so reaching a
setting that has nothing to do with channels required first being in one.

## Where it went, and the scope paragraph it brushes against

Floor Settings, above *Labs* — an ordinary setting, and Labs is an invitation
to unfinished ones.

`HomeSettingsView` carries a paragraph headed *One scope, since 2026-09-05*:
everything on that screen belongs to the person and follows them onto the next
phone, a phone-scoped setting having been removed, and the rule is that if one
is ever added back the card must say so. The picker looks like exactly that —
it acts on this phone and on no other. It is not, and the doc comment now says
why: it stores nothing. There is no value to sync and none to fail to sync, so
there is nothing for a card to admit. A door onto a system sheet is not a
setting in the sense that paragraph is about.

## What else moved

The test moved with it, from `channel.test.tsx` to `settings.test.tsx` as
`describe("the output picker")`; both files carry a line saying where it went.
Two comments on Channel Settings explained their own placement by pointing at
the picker's and now state their reason directly. `backlog/the-output-picker-is-on-probation.md`
and `ANDROID.md` named `ChannelSettingsView` and now name `HomeSettingsView`.

The probation itself is untouched: what is on trial is the control, not where
it is drawn. If anything this makes the open half of that entry — does anybody
want the audio somewhere else — easier to answer, since the control is now
findable without being in a channel.

# A waiting bar that names one thing goes to it

Both waiting bars named a destination the reader was usually already standing
at, so in the commonest case each had the tap did nothing and the bar read as
not pressable.

## What was wrong

`WaitingBar` was built on 2026-09-23 as a sentence rather than as the card —
see *What is waiting for you is said in words*, which argues at length that
*Accept* stays in the list and that the bar only has to say there is one to go
and find. Both press handlers were a single `onList` call and nothing else.

A tab is no journey for somebody already standing on it, and each bar had such
a tab. Home opens on **Channels**, so the ordinary arrangement is the
invitation bar pinned in the tier directly above the list it was pointing at,
with the invitation's own card a few hundred pixels below it. Accepting a
contact request leaves somebody on **Contacts**, which is the second half of
the arrival this bar exists for — and there the request bar was the same
no-op.

Under a second line reading *tap to answer*, in both cases. Nothing threw; the
control simply had no effect, which is indistinguishable from a bar that is not
a `Pressable` at all, and that is how it was reported.

## What was built

A bar that names one thing opens it. Neither destination is the control, which
is the whole of the earlier decision:

- **One invitation opens its room** — `onEnterChannel(channelId)`, which is
  `openChannel`'s journey in `ChannelsView` exactly: it opens the channel
  screen and steps in to nothing, since 2026-09-21. The list keeps every
  control it had.
- **One contact request opens the person** — `HomeView`'s own `openProfile`,
  the handler the contact rows are given, and *Accept their request* is already
  on the screen it opens, beside everything there is to read about somebody an
  acquaintance is asking you to know.

**The profile is a destination `RequestRow` deliberately does not offer**, and
that is not being overturned. Its reason is about the *outgoing* half: a
request you sent is an address rather than a person, and whether anybody is
behind it is exactly what the server withholds. An incoming request shares none
of that — `answerableRequests` is the incoming half alone, and they told you who
they are.

Three cases keep the tab switch, having nothing singular to open:

- **A count**, either kind. *2 invitations waiting* and *2 people want to be
  contacts* name nothing, and opening the first of several would be opening
  something the bar did not say.
- **A seat.** A guest invitation's only action is taking the seat up —
  `takeUpSeat`, a round trip that spends the offer — and that is precisely the
  control the bar must not carry. There is no channel screen for somebody who
  is not a member.

Those three behave as they always did, which on the named tab is still nothing.
That half was never the complaint: what they point at is on screen below them,
enumerated, with its buttons.

# Contact requests are in the contacts, not the channels — 2026-09-05

They had been drawn at the foot of the channel list since that list was the
whole app, and stayed there through the 2026-09-01 split into two tabs on no
argument at all — `ChannelsView` said so in its own header, that they were
there "because that is where they have always been drawn, not because it was
answered". This answers it.

**A request is not a channel, and being not-yet-a-contact is not a reason to
file it under the thing it is further from.** The case for leaving it was that
an unanswered request has nobody to talk to, so it cannot be a row in a list of
rooms — which is an argument for it not being a *channel*, not an argument for
it living among them. Everything else points the other way: what accepting one
produces is a row in the contact list, what withdrawing one removes is a row
that would have been, and the form that *sends* one is already at the top of
that list. Asking and being asked were on two different tabs.

So the section moved to `ContactsView`, under *Requests*, above *You* and above
the contacts. Above, because it is the only thing on either tab with something
outstanding to do about it, and because sorting a request in among people you
know would say it was one. `RequestRow` moved with it unchanged: it is still
the one row on that list that opens nobody — an outgoing request is an address
rather than a person, the server withholding the id and the name deliberately —
so it carries Accept, Decline or Withdraw on itself where a contact's row is a
single target.

The channel list now holds channels and nothing else, which is what it was
called after.

**A test that presses an async handler must await its `act`.** Not part of the
decision, but the thing that cost the time: `act(() => onPress())` on the
Withdraw button returns a promise into a synchronous `act`, and React leaves
the renderer mid-scope — every subsequent test in the file rendered empty
text, 63 failures from one press. The console warning says so plainly and
scrolls past above the first failure.

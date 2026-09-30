# A contact request sent from a profile does not show as sent

Reported by Todd on a call, 2026-09-30, with a screenshot. On Erta's profile,
reached from a channel roster, *Add contact* was tapped and appeared to do
nothing: the button went back to *Add contact*. A second tap answered **Request
already sent.** in red. So the first tap had worked, and the screen never said
so. What was asked for: the button should change for good, to something like
*Contact requested*, so that the sender knows it went.

**The cause is on the client's side of a deliberate server rule.**
`ProfileView.tsx` finds this person's standing by matching
`app.home.contacts` on `entry.account.id === accountId`. But
`Accounts.contactsFor` sends every outgoing request with `id: ''` and the
*address* in place of the name, so that a request to a real account and one to
an address with no account look the same. So the match never succeeds for an
outgoing request. The `contact?.status === 'outgoing'` branch that would show
*Request sent* never runs for anybody, and neither does the `contactRequested`
heading. The header said *Channel member* throughout.

That masking protects a request made **by address**. A request made **by id**,
from a shared channel through `requestContactById`, reveals nothing: the
sender already has the id and the name. Two ways to fix it: have the server
say which account ids you have asked, in a list separate from the masked rows;
or have the client note the id when `connectWith` succeeds. The first survives
a restart and a second device, and the second does not. Either way, a tap that
worked should say so on its first press, not only when it is refused.

Rodrigo thinks **the ping has the same flaw** (*"I think the same thing happens
with the ping"*). Nobody has checked that. `pingSent` is local state, so
look at what the card shows after it is dismissed and the profile is opened
again.

# An invite link carries a pin again

2026-10-15. Asked for at the prompt as four things: *Add a contact* only
shares an invite link; the link carries a short token again, as it did
before; the page has two calls to action, install and accept; and the name
in the address goes, the page looking it up from the username instead,
which cannot be used to probe because the token has to match.

Reverses `2026-09-25-an-invite-link-is-a-standing-door.md` in its central
particular and restores `2026-09-06-an-invitation-is-a-link-with-one-seat.md`'s
pin as it was: six digits, minted per press, spent by the first taker,
thirty days, ten live per account, wrong guesses counted against the owner.
Most of the code that reads a pin had never left — SHIMS.md's Gate 290 had
not come due — so what came back was the mint and the page's lookup.

## What the standing door cost

**The name on the page was anybody's to write.** With no credential in the
address, the page could not look a name up without becoming a directory, so
it drew `?name=` from the URL. The 2026-09-25 decision said so plainly — *not
evidence* — and that was the problem: the one page a stranger reads about a
user said whatever the link's author chose.

**And the accept route named an owner and nothing else**, so any signed-in
account could walk usernames and become their contact, bounded only by
twenty a day. The budget was a mitigation for a door that did not need to be
open.

The pin answers both at once. The page looks the display name up only for a
request holding a live pin for that username, so it says the real name to the
one person who was handed the link and nothing to anybody guessing.

## What was decided

***Add a contact* is one action.** The row is the button: it mints, then the
share sheet, falling back to a copy that says so. The email field, *Send
request* and the *or* are gone from the app. `POST /contacts/request` stays
on the server for builds that still offer the field, and its email now
carries a pin minted for that message, forgotten if the send fails.

**The page has two buttons**: *Get The Floor for iPhone* and *Accept invite*,
the second outlined so the store still leads. *Accept invite* writes the
username and pin into the tab — on the click, not on arrival, since a tab
that only looked has not taken a seat — and opens the web app, which accepts
once there is a session: the contact, the pair's channel, and the channel
opened. A spent, expired or wrong pin draws a refusal naming nobody, with the
store and no accept button.

**The person who spent a pin may spend it again.** `redeemInvitePin` answers
them `ok` with the channel, and answers a pair who are already contacts
without spending the seat. That is what lets the web app keep a pinned
invitation in the tab until it is spent rather than taking it on read, which
used to lose it to a reload during the sign-in's trip to the mail app.

**The banner hands the app `thefloor://i/<username>/<pin>`**, which every
build since 288 reads.

## What was deliberately kept

**Links without a pin are honoured, as a shim.** Three weeks of
`/i/<username>?name=` are in other people's threads, and TestFlight builds 354
to 361 drop the pin from an `https` link before accepting it. So
`acceptInviteLink` and its daily budget stay, the page for a pin-less link
names nobody whatever its `?name=` says, and SHIMS.md § *Gate 362* says what
goes once the floor passes 361.

## The order this ships in

**Deploy first.** Every installed build asks the server for the link it
shares, so from the deploy on every build shares a pinned one; the shim keeps
354–361 accepting them. **Then a build**, which carries the one-action card
and keeps the pin from an `https` link. Nothing on the wire was renamed.

# An invitation is a link with one seat in it — 2026-09-06

"Add a contact" took an email address, wrote a `pending_invites` row and sent a
message whose only link was the App Store. That predates the web app, and it
left the relationship in the address rather than in the invitation: the
recipient installed something, signed in, and *found* a request waiting, which
is a different experience from being let in. What was asked for is a link built
from the sender's username that accepts the request on their behalf.

**The username alone cannot be the invitation, so it carries a pin.**
`/i/<username>/<pin>`, six digits. A bare `/i/<username>` would be a standing
open door — anybody who learned a username could become that person's contact,
for ever, and a username is quotable by design. The pin makes an invitation a
thing with one seat in it: minted per press of *Copy Invite Link*, spent by the
first person who redeems it, thirty days like the addressed invitation it sits
beside.

**Six digits, and the argument is `otp_codes` rather than arithmetic.** Twenty
bits is nothing on its own. It is enough here for the reasons a sign-in code is
enough: the pin is only ever checked against the account named beside it, so a
guesser is searching one account's live pins rather than every invitation in
the database; the wrong guesses are counted and stop being answered; and the
pins are capped at ten per account, so the search space cannot be widened by an
enthusiastic inviter. Take any one of the three away and the digits are too
few.

**The attempt counter is per owner, not per pin**, which is the part that is
easy to get wrong: a wrong guess matches no row, so there is nothing on a row
to increment. What is under attack is the account in the path. That makes the
lockout grief-able — anybody at all may spend it, unlike a code offered by the
one address it went to — so it stops *attempts* rather than destroying pins,
lapses on its own after an hour, and never blocks minting a fresh link.

**The pin is a path segment and not a fragment**, which reverses the watch
link's decision on purpose. `/watch/<id>#<token>` keeps a long bearer token out
of access logs and `Referer`, and that is worth a page which fetches before it
can speak. Here it would cost more than it buys: the page would be a shell with
nothing to say without JavaScript, and link rewriters drop fragments. On the
path the server holds both halves before it renders, which buys something
better than concealment — **the inviter's display name is disclosed only to a
request carrying a live pin for that username.** A fragment cannot do that,
because the server never sees it. The page carries `no-referrer` and the pin is
single-use, so a log line is a spent one.

**Redemption makes an accepted contact rather than another pending request.**
Publishing a link is the owner's half of the ask and following it is the other
half; a pending row would be this application asking somebody to confirm what
they had just done. That only holds because the pin is single use — an open
door would have to ask.

**`(owner_id, pin)` is the key, and a collision is not an event.** A global
`pin TEXT PRIMARY KEY` would throw out of the mint route on a duplicate, which
at six digits is an expectation rather than a rarity: some collision is around
40% likely once a thousand live pins exist. Since every lookup already names
the owner, two accounts holding the same digits means nothing — exactly as two
people may be sent the same one-time code. What remains is a clash inside one
owner's ten, and `insertWithUniqueKey` already retries that. **Unlike the
username's `UNIQUE`, it is never surfaced**: somebody typed the username and
being told it is taken is the answer they need, where nobody typed a pin and
any six digits will do.

**Every invitation email now carries a link, and which link is a fact about the
sender.** Theirs when they have a username, and the door into the web app when
they do not — in which case the request resolves the old way, from the address
it went to. The difference is how much is left for the recipient to do, never
whether the email can be acted on. The line apologising for the App Store being
unset went with it: there is always something to open now, so an unset setting
is simply a line that is not there.

**The invitation page inverts the landing page's call to action.** There the
App Store is primary, because the phone is the referential install and a
stranger should be sent to it. Here the browser is primary, because the link
*is* the invitation and a trip through the App Store loses it — somebody who
installs first arrives with no relationship and nothing to show for having been
asked. The app is offered underneath, and again from inside the browser by the
install notice below.

**The notice, and why the browser gets one at all.** Everything else the web
app gives up is the user's own business; notifications are not, because what
they cost is *other people's* ability to reach you, and somebody who does not
know that has not chosen it. So it is said once, in a card above both lists,
and dismissed for good — a standing banner about a declined install is an
advertisement. It is drawn only where `APP_STORE_URL` is set, the same graceful
absence the landing page and the email make about the same setting.

**What is deliberately not built**: no route takes a bare pin, so there is no
oracle to search; no username lookup that is not an invitation, so this is not
the directory `core/username.ts` says there is not — a username that exists and
one that does not get identical answers from the accept route; and no native
deep link, so an invitation opened on a phone that installs the app is lost
rather than deferred. The last is a real limit and the page says what to do
instead. See `DECISIONS-2026-09-04-to-2026-09-06.md` § *A username is a second
name, not a better one*, whose closing line — that a username does nothing yet
— stops being true here.

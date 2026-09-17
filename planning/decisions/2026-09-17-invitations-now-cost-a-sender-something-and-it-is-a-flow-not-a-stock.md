# Invitations now cost a sender something, and it is a flow not a stock

`POST /contacts/request` to an address with no account has sent real email
since 2026-08-15, and until today nothing bounded how much. The only thing
standing between one authenticated account and an arbitrary number of mailed
strangers was the duplicate check in `pending_invites`, which is per address —
and which expires with the row at `INVITE_TTL_MS`, so after thirty days it does
not even bound the repeats. Every message is billed to this SES identity and
attributable to this domain's sending reputation.

This closes the backlog entry *Inviting a stranger now sends mail, and nothing
bounds how much*, whose other half — `INSTALL_URL` hardcoded null — had already
been fixed on 2026-08-21 by reading `APP_STORE_URL` instead. The entry said the
rate limit became urgent "the moment sign-up is open to anybody, which is
before the first release rather than after it." That moment had passed: there
is no signup gate anywhere in the server, and `released` has pointed at a
public build since 1.0.0.

**Twenty per account per twenty-four hours**, `INVITE_MAX_SENDS` and
`INVITE_SEND_WINDOW_MS` in `server/src/accounts.ts`, enforced by
`spendInviteSend` against a new `invite_sends` table. Production said what
legitimate use looks like before the number was chosen: 32 accounts, and the
heaviest requester had two outstanding invitations. The one burst the app has a
reason to produce is somebody who has just arrived typing in their friends, and
twenty clears that with room while leaving a rate no onboarding reaches. An
account costs a round trip through an emailed code to create, so scaling past
it means minting accounts, which is throttled already.

**A day rather than the guess counter's hour.** `INVITE_GUESS_WINDOW_MS` is an
hour because a six-digit pin search is a burst that wants killing in minutes.
This is a sustained flow billed per message, and an hourly cap permitting
twenty-four bursts a day bounds the wrong thing.

## What was deliberately not built

**A cap on outstanding invitations**, which was the first thing proposed and is
the wrong instrument. It limits a *stock* where the cost is a *flow*:
`/contacts/withdraw` is behind an ordinary session, so a sender frees a slot
whenever they like and send-withdraw-send holds the stock at one while the mail
is unbounded. The loop is two calls. What such a cap would bound — the table,
and the sender's own pending list — is already bounded by the thirty-day sweep,
and neither was the risk. `INVITE_PINS_PER_ACCOUNT` is not a bound here either,
for a related reason: it evicts the oldest unspent pin before inserting rather
than refusing to mint, so an eleventh invitation still sends and merely orphans
a link.

**A sliding window.** Fixed, as `invite_guesses` is, opened by the first send
and lapsing that long after it. It permits forty across a midnight boundary,
which is still a rate nobody legitimate approaches, and it means a refusal does
not extend the window — otherwise somebody could hold themselves locked out
indefinitely by retrying.

**A refund.** The count is charged at the attempt and nothing gives it back.
The route already withdraws the `pending_invites` row when a send fails, so
that the sender can correct a mistake; refunding the count alongside it would
make a provoked failure the way around the table. Only a request that never
reaches the mailer goes uncounted — a duplicate, which `requestContact` refuses
first, and a server with no mailer configured, which is a misconfiguration
rather than the sender's doing.

**The vagueness the rest of that route is built on.** `/contacts/request`
deliberately refuses to say whether an address has an account, and the refusal
here says plainly that the sender is out of invitations for today. What it
discloses is the sender's own rate back to them; there is no
address-existence question in it, and the vagueness elsewhere protects the
recipient rather than the sender. The client needed no change — it already
surfaces the server's message and keeps the typed address on any failure.

No wire shim. A 429 with a message is something every installed build already
renders through its generic error path.

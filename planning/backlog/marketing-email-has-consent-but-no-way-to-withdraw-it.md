# Marketing email has consent but no way to withdraw it

**Status:** outstanding, and it is the half that is legally load-bearing. A
checkbox on the sign-in screen writes `accounts.marketing_email_at` when
somebody ticks it; nothing anywhere clears it except deleting the account.

The grant is deliberately one-way — `Accounts.establish` says why, and it is
not a shortcut: that screen is read before anybody is identified, so it cannot
show an existing answer, and a clear box on a second device would otherwise
revoke what the first one granted. The consequence is that the only way out of
a list somebody opted into is to delete their account, which is not an answer.

What is missing, roughly in the order it will be wanted:

- **An unsubscribe link on every message sent under this permission**, which is
  what CAN-SPAM and the equivalents actually require, and the only route that
  works for somebody who no longer has the app. It needs a token that
  identifies an account without signing anybody in — `watch_tokens` is the
  nearest existing shape.
- **A switch on Home settings**, reading and clearing the same column. It is
  the ordinary place a preference lives, and unlike the sign-in screen it is
  behind a session, so it *can* be shown in force and can therefore be a real
  two-way setting rather than a grant.
- **Nothing sends this mail yet.** No campaign, no list export, no template —
  the column records a permission that is so far unspent. Whatever sends it is
  where the unsubscribe link has to be attached, so the first of these is a
  precondition of the mail existing rather than a follow-up to it.

Until then the honest position is that consent has been collected and not yet
acted on, which is a safe state to sit in and not one to send from.

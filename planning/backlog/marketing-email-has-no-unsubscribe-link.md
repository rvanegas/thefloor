# Marketing email has no unsubscribe link

**Status:** outstanding, and narrower than it was. Floor Settings § Email now
turns the permission off as well as on, so somebody with the app can leave.
What is missing is the exit for somebody without it.

- **An unsubscribe link on every message sent under this permission**, which is
  what CAN-SPAM and the equivalents actually require, and the only route that
  works for somebody who has deleted the app or never reads the screen it is
  on. It needs a token that identifies an account without signing anybody in —
  `watch_tokens` is the nearest existing shape — and the link has to clear
  `accounts.marketing_email_at` without a session.
- **Nothing sends this mail yet.** No campaign, no list export, no template —
  the column records a permission that is so far unspent. Whatever sends it is
  where the unsubscribe link has to be attached, so the two ship together or
  the first mail goes out with no way out of the list.

Until then the honest position is that consent has been collected and not yet
acted on, which is a safe state to sit in and not one to send from.

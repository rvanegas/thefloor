# Notifications are asked for at sign-in, and a refusal turns on email

**The system dialog is raised straight after authentication**, once the
account's settings have arrived, with no screen in front of it. From
2026-09-08 it waited — for a second launch or a first conversation with
somebody here — and was preceded by a full page arguing for the permission:
why it matters, what would be sent, the three per-channel levels, and an offer
of a getting-started channel. Rodrigo asked for the page to go and for the ask
to come at once.

**A declined dialog switches on email notifications** (`emailNotifications`,
a new account setting), so the refusal does not leave the account silently
unreachable — which was the whole reason the old page existed. The email
carries the push's own title and body, a link to the web app, and how to turn
it off. **It carries all four kinds, arrivals included.** The first cut left
arrivals out — true for five minutes, and by the dozen — and Rodrigo asked for
them in. What keeps that from flooding an inbox is the existing pause: a week
of arrivals without the app being opened stops arrival email exactly as it
stops arrival push, and an emailed arrival counts towards that week, or an
account reached by email alone would never pause.
Somebody with both switches on gets both; two switches saying *on* mean that.

**Push became a switch too**, `pushNotificationsOff` — stored as the
negation, on the rule that every boolean setting defaults to false. Off, the
server sends no push to any of the account's devices and Home's daily banner
stops. On while iOS refuses, Floor Settings says what to do: the dialog while
unspent, Settings once it is not, the phone from a browser.

**What is left of the prompt** is a title, one sentence and a button, reached
from Home's banner by somebody who has already refused, where the button is
the Settings app. The banner's daily cadence is unchanged; its three sibling
keys (launches, conversed, pitched) are deleted on launch.

**No shim.** Both fields are additive: an old build ignores them, and the new
client reads an absent field as false, which is an old server's behaviour.

# Make the notification permission survivable

It was item 1 of planning/ROADMAP.md, *the roadmap the proposition obliges*, until 2026-10-03; the ordering argument is now PROPOSITION.md § *What the proposition obliges, in order*.

**Piece a is built**: `app/src/state/notificationAsk.ts` argues the ask before
spending iOS's one dialog. **Pieces b and c are not** — nothing at the point of
pinging and nothing on a profile says that somebody is not receiving
notifications, as of 2026-10-03. Those two are the task.

**Why it is first.** Because there is no ring and no call interface, every
synchrony this app establishes travels as an ordinary notification. An
invitation, a knock, a ping: all banners. **The app without the permission is
not a degraded version of itself — its central loop does not close**, and it
fails silently, which is worse. Somebody pings a contact, sees the ping
accepted, and waits for a person who will never learn they were wanted. That
gets attributed to the app.

And the permission is asked for in the worst climate imaginable. **Habitually
declining notifications from a newly installed, unfamiliar app is a rational
habit**, because that permission is routinely spent on manufactured engagement
— and the user who learned that lesson best is exactly the user this app is
for. So the ask has to be argued rather than raised.

**Three pieces, none of them large.**

**a. The request carries the argument, not the platform's bare prompt.** A
pre-prompt ahead of the system dialog, saying what the permission will *not* be
used for, in the three claims the rest of the app already honours:
notifications here are sent by people rather than by the app; they never sound
unless the recipient asked that they sound; and there is no re-engagement
traffic of any kind. MANUAL.md § *Notifications, and why we are asking for the
permission* is the long form of this and is where the wording should be drawn
from.

**b. Pinging somebody whose notifications are off says so at the point of
pinging** — before the ping, not after it. This is the piece that converts a
silent failure into a visible one, and it is the highest-value third of the
three. It needs the server to know the state, which is a fact about
`device_tokens` rather than about the app; decision/ § *Sessions are ended
wholesale, and that is not a defect* is adjacent, noting that a session and a
notification permission are separately recorded and can disagree. **Establish
what the server can actually tell** — a device with no token, a token that has
gone stale, and a permission explicitly refused are not the same state, and
saying "their notifications are off" about the wrong one is a new silent
failure rather than a fix for the old one.

**c. A profile shows the standing state.** On somebody else's: this person is
not receiving notifications. On your own: that you are not, with the
consequence spelled out rather than named — not a settings row that says *off*,
but a sentence saying what will happen to you because of it.

**Done looks like:** a person who declines can find out that they declined
without being told by a friend, and a person who pings somebody unreachable
learns it before waiting rather than after.

**Adjacent, and not this:** TASKS.md § *Genuine ringing, added last, for
emergencies only* catalogues the larger delivery machinery — PushKit, CallKit,
Time Sensitive. **Most of that list is off-thesis and stays unbuilt until the
end.** Time Sensitive in particular is precisely the escalation the proposition
forbids a sender to claim, and it was listed in the backlog entry that task
replaced as one of the "smaller things left on the table" — the pressure this
document exists to resist. The task now rules it out by name; it is a ring
granted by a recipient to one person or it is nothing. See PROPOSITION.md § *What the proposition obliges, in order*, first constraint.

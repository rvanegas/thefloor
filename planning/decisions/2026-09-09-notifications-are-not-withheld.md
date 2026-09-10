# 2026-09-09 — Notifications are not withheld, and one account's are logged

Two changes to the same path, asked for together.

## The suppression is gone

`pushNotifier.notify` dropped any device with a live session socket, on the
premise that such a device is one somebody is looking at — so the notification
would be a second copy of what is already on screen. Per address since
2026-08-24, with a person-level fallback for rows written before the session
column existed.

**The premise stopped being true when stepping in became an open microphone.**
Capturing keeps a backgrounded process alive — deliberately, it is the whole
design of presence — so a phone in a pocket holds a socket for hours. The rule
read that socket as somebody watching a screen and silenced exactly the device
that most needed telling. Rodrigo had stopped receiving notifications he
expected; this is why.

**Rejected: making the condition attention instead.** With a real attention
clock the condition could have become *this device reported attention to this
channel in the last minute*, which is what the old rule was reaching for.
Chosen against, in favour of no condition at all, and the reason is that the
judgement does not belong on the server: what is in front of somebody is
knowable on the device and nowhere else.

**The duplicate is still prevented, on the device.** `app/src/push.ts` shows a
banner only for a notification whose `reachesInApp` is set — a ping — and never
plays a sound in the foreground. An arrival that lands on the app it is about
is silent and goes to Notification Centre. `reachesInApp` survives for that and
is now read by the client alone; the server sends it and no longer acts on it.

**What is left unswept.** Sitting in a channel, arrivals to *that* channel now
accumulate in Notification Centre rather than being dropped before they were
sent. Opening a channel already sweeps its outstanding notifications
(`watchChannel` → `sweepChannel`); doing it on arrival while the screen is
open is the obvious follow-on and is not built.

`reachability.liveSessions` loses its only caller. `devices.sessionHash` is
still written and no longer read: the column is left where it is, being the
only per-device identity a later rule could use, and dropping it would cost a
migration for nothing.

## One account's notifications are logged

The existing line is per group — platform, alert, counts, failures — and names
nobody, so it cannot answer *did that reach me*. Two lines now do, for an
account with `debug` set:

- **`push intended`**, before anything can refuse it: the account, channel,
  kind, alert, the level it was decided against, and every address it was
  going to. Logged even when there are no addresses, because *nothing was
  attempted* is the commonest answer to "why did that not arrive" and it left
  no trace anywhere.
- **`push delivered`**, per address, with what the service said: status,
  reason, whether the token was pruned as dead.

Keyed by token, because a delivery result carries nothing else back — the send
is grouped by platform and alert across people, so the answer arrives with no
idea whose device it was about.

**Only the debug account, deliberately.** A line per notification per device
for everybody is a log nobody reads and a standing record of who is being told
what about whom. The flag that already gates the audio diagnostics panel gates
this, and it is set by hand in the database.

# 2026-09-18 — Handing the picture over, and the seek that started it

Three reported from testing the device switch. Two had one cause each and are
fixed; the third is very likely downstream of them and is recorded here as
unconfirmed rather than claimed.

## A device switch turned a paused party into a playing one

**`seekTo` starts a cued player, and the API says so.** *"If the player is
paused when the function is called, it will remain paused. If the function is
called from another state (`playing`, `video cued`, etc.), the player will
play the video."* A player that has just been built is **cued**, not paused —
so the single seek that puts a new screen where the party has got to is also
the thing that starts it.

What followed is the follower doing its job correctly. The new screen reported
`playing` against a channel saying `paused`, in a phase where nothing had been
said to it that could explain that, which is a person pressing play. It told
the room, and the room played.

**The repair is that the instruction was incomplete, not that the reading was
wrong.** A paused party now pauses after the corrective seek — but only for
the two states a seek actually starts. A player that was `playing` or
`buffering` was stopped by the pause already issued before the seek; one that
was `paused` stays paused by the documented rule; what is left is `cued` and
`ended`. Always pausing last would issue a command for nothing on every
correction.

This is the second time the fix has been *finish the instruction* rather than
*doubt the reading*, and it is worth stating as a rule: **a follower that is
allowed to believe its player must be given instructions that leave the player
where it was told to be.** Every place that is not true becomes a press.

## A switch could land on neither device

`screens.use` only **asks**. The server passes the request to the target
instance, and the film moves when that instance declares itself the screen —
at which point the server takes it off every other instance of the account,
the asking one included.

The app was clearing its own screen role in the same breath as asking, so that
a switch could not read *other device* while this device was plainly still
playing one. That was the app second-guessing the one thing that can see all
of somebody's devices at once, and it opened a window with the film on
**nothing** — cleared here, and never picked up there if the target was slow,
backgrounded, or no longer had the channel open.

Letting the eviction do it makes *exactly one* true **by construction** rather
than by agreement. The cost is that the asking device goes on showing the film
for a round trip after the press, which is honest: it *is* still the screen
until the other one takes over, and the switch is a reading of where the film
is rather than of what was asked for.

## Play and pause on all four surfaces

Reported as violated; not reproduced, and not fixed here because nothing was
found to fix.

The four are the film's own bar and the app's row, on the device showing the
film and on the device that is not. Both authorisations check out and now have
tests: `canControlWatch` asks about the **account** rather than about the
instance, so a phone that handed the picture to the laptop is still in the
room and still drives it, and the laptop — signed in, stepped out, showing the
film — is the same account and drives it too. The server has no
standing-in-this-channel guard on actions either.

**The likeliest explanation is that this was the other two being seen from the
outside.** A switch that lands on neither device leaves a transport with
nothing following it; a switch that lands on both leaves two followers of one
account driving each other; and a handover that silently starts the film makes
a pause look as though it did not take. All three read as *the controls do not
respond*.

So it wants re-testing on top of these two fixes rather than a third repair
invented for it. If it survives them, the thing to find out first is **which**
of the four surfaces fails and whether the account is stepped in anywhere at
the time — because the one state that does grey all four is being stepped out
while somebody else is present, which is `hasTheRoom` doing what it is meant
to do.

## A harness gap found on the way

`resetHarness` cleared `screens` and `screenFor` and not `screensElsewhere`,
so a test that set it left every later test in the file believing another of
this account's devices was showing a film — which is exactly the state that
stops a party taking the screen it is looking at. It is reset with its two
neighbours now.

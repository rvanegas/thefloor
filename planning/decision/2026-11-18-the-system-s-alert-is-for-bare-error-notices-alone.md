# The system's alert is for bare error notices alone

Rodrigo said on 2026-11-18 that `Alert.alert` is not for ordinary UI. It
draws nothing of STYLE.md and holds no control but buttons, which became a
problem when *Delete* on a segment had to ask *what* goes. It reversed
STYLE.md's rule that confirmations use it. **Every confirmation and choice now
asks in `ConfirmModal`, through `useConfirm`**: 20 calls across Channel
Settings, Floor Settings, a profile, Home, a recording's row and the *Record*,
including the two-step deletion of a channel, which asks twice. Two notices
that report a success moved too ("the other devices are signed out", "the
text is copied"), with an *OK* button.

**A bare error notice stays the system's**: a failure's title, the server's
message, one button. Rodrigo chose that over moving everything. 25 of these
remain, and the rule for a new one is the same: if somebody has to choose,
or the notice isn't an error, it is a `useConfirm`.

Tests read the question off the screen (`confirmationIn` in the harness), in
the shape `Alert.alert` was called with, rather than spying on the system.
On the web the remaining errors still go through `alerts.web.ts`.

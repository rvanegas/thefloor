# An empty clipboard gets the refused button, not the system control

`UIPasteControl` does not grey itself for an empty clipboard, which is what
the 2026-09-29 decision (`pasting-goes-through-the-system-s-own-control`)
assumed and could not check before an upload. **On a device it draws nothing
at all**: the watch card showed its caption, *Watch something together*, under
an empty 48-point slot, and the button read as gone. The simulator draws the
control whatever the clipboard holds, which is how it got through.

`PasteButton` now asks first — `hasStrings` and `hasURLs`, which iOS answers
without the *Allow Paste?* sheet, being questions about the clipboard rather
than reads of it — and asks again when the clipboard changes and when the app
comes back to the front, which is when a link copied in YouTube arrives. An
empty clipboard is drawn as the ordinary disabled `Button`, the same one a
refused paste gets (STYLE.md rule 9), with a sublabel that says what to go and
do: *Copy a YouTube link first* on both watch buttons, *Copy something first*
on the two clipboard ones.

**Not tried:** drawing the control anyway with a hint beside it. A hint next
to a blank slot is still a blank slot.

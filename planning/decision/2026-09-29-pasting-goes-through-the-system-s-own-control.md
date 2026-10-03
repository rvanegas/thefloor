# Pasting goes through the system's own control

Task `allow-paste`: pasting a YouTube link into the watch player set off iOS's
*Allow Paste?* sheet, every time. It is not a bug in the read. Since iOS 16
any clipboard read an app makes on its own behalf is prompted, including one
the person has just asked for by pressing a button that says *paste*, because
the system cannot tell that button from any other. The 2026-09-20 decision
that replaced the field with a button (`the-watch-link-arrives-by-paste-rather-than-by-typing`)
made every watch paste one of those reads.

**What the system can tell is its own control.** `UIPasteControl` is a button
Apple draws, and a tap on it is the permission, so no sheet. `expo-clipboard`
already shipped it as `ClipboardPasteButton`, so this cost no dependency and
no prebuild. `PasteButton` (`app/src/ui/PasteButton.tsx`) draws it where
`isPasteButtonAvailable` says it exists and falls back to the old `Button`
and `pasteText` everywhere else: iOS 15, which the app still supports,
Android and the web.

**All four paste buttons, not only the watch player's.** *Paste my clipboard*
and a guest's *Paste mine* set off the same sheet, and one way of pasting is
cheaper to explain than two.

**The price is Apple's word on the button.** The control says *Paste*, with
Apple's glyph, and cannot be relabelled. *Watch something together* and its
sublabel became a caption beneath it. That was the one real choice here, made
by default rather than argued: the alternative was keeping our words and the
sheet. STYLE.md § *PasteButton* has the rest of the departure, including that
a refused paste is drawn as the ordinary disabled `Button`, since the control
has no refused state of its own.

**Considered and not done:** the field back, whose edit-menu *Paste* never
prompts, which is the long-press routine the 2026-09-20 decision removed;
and `detectPatterns`, which can say whether the clipboard *probably* holds a
link without a prompt. That answers a question nobody is asking now that the
control greys itself for an empty clipboard.

The zero-code answer, for anybody on a build without this: iOS 16 and later
have **Settings › The Floor › Paste from Other Apps › Allow**.

**Unverified on a device** at the time of writing. The corner style is a
guess at the nearest to `radius.md`, the explicit 48pt height is what the
library says the control needs to draw at all, and none of it can reach a
phone before an upload.

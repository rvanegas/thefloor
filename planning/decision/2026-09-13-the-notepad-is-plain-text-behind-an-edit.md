# The notepad is plain text, behind an Edit

2026-09-13. Amends `2026-09-12-the-notepad-is-written-on-in-place.md`, which
stands in every other respect: the field is still on the tab, still gated by
`canEditChannel`, still saved on blur and on the field going away.

## What changed

Three things, all subtractions bar the last:

- **No Markdown.** The notepad is the characters somebody typed. The five
  marks it accepted — bold, italic, code, strikethrough, links — are five
  characters now.
- **No preview.** There is nothing left to preview, the field and the sheet
  showing the same string.
- **An *Edit*.** The card shows the words, with a small ghost *Edit* under
  them for whoever has the room. Pressing it puts the field where the words
  were; *Done* writes and puts the sheet back, as does leaving the field, the
  tab or the screen.

And, asked for in the same breath: **the clipboard is now the first section on
the tab and the notepad the second.**

## Why

**The apparatus outgrew the thing.** A card for one sheet of text held a
`TextInput`, a live preview in a rule-bordered block, two sentences naming
which five marks worked and where links open, and a character count — five
elements of explanation around one of content. What the notepad is *for* is a
reading list and a couple of links, and the marks were being explained more
often than they were being used.

**A parser is a surface.** `markdown.tsx` was a hand-rolled scanner with nested
emphasis, balanced parentheses in link targets, an escape rule and a scheme
allowlist, all so that one field could render text one member of a channel
writes for the others to tap. Deleting it removes the only place in the app
that renders prose from a user as markup — which is the position
`2026-09-10-help-is-a-question-box.md` already took for the help answer, on the
same reasoning, three days earlier. The app is now consistent about it.

**A sheet is read more often than it is written on.** The field *was* the
notepad for anybody with the room: they saw a box of text where everybody else
saw the words, permanently, including the great majority of visits where they
came to read what was on it. Now everybody sees the same sheet and the box is
one tap away, which is also what makes the two views agree — the reader's view
was the only one nobody with the room ever checked.

**The clipboard goes on top** because it is the half with a clock on it. Both
sections are text the channel holds, but the paste is minutes old and is
usually the reason somebody opened the tab, while the notepad changes about as
often as the channel's name. The tab is still named after the slower half;
what a tab is called is not an argument about which half is looked at first.

## What was kept, and what it cost

**The cap and the counter.** `MAX_CHANNEL_DESCRIPTION_LENGTH` is the server's
rule rather than a flourish, so the count stayed — under the field, where it is
only shown while somebody is typing into it.

**The draft machinery, whole.** `notepad`, `notepadSaved` and the adopt-unless-
unsaved effect are exactly as the 2026-09-12 decision left them, and the two
tests that pin them still pass with one line added apiece: press *Edit* first.
`notepadShown` is new and is the one wrinkle — the draft when it is yours to
write on, `channel.description` when it is not, so somebody who steps out
mid-sentence is not shown their own unsent text as the channel's notepad.

**`isSafeUrl` and `openUrl` survived** the file they lived in, in `links.ts`.
The clipboard offers to open what is on it, and that allowlist was never about
markup — it is what stands between a member's paste and `Linking.openURL`.
`markdown.test.ts` went the same way: what is left of it is `links.test.ts`,
the scheme assertions with the parsing gone.

## What this gives up

**Links are not tappable.** A URL on the notepad reads as a URL and is copied
by hand or long-pressed. That is the real loss, and it is small: the clipboard
is where a link somebody wants tapped belongs — it is one tap to open, it says
who put it there and when, and it is the section directly above.

**The wire is unchanged.** Still `SET_DESCRIPTION`, still `description` in
`ChannelState`. Old builds render what they receive as Markdown and will keep
doing so; a notepad written today with a stray asterisk in it shows the
asterisk on a new build and swallows it on an old one, which is a cosmetic
difference in text the older client was already rendering its own way. Nothing
needs a shim.

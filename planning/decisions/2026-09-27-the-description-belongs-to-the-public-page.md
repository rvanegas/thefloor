# The description belongs to the public page

2026-09-27. Reverses `2026-09-12-the-notepad-is-written-on-in-place.md` and
retires most of `2026-09-13-the-notepad-is-plain-text-behind-an-edit.md`, which
stands only as the record of why there is no markdown in this app.

## What changed

- **The field is back on Channel Settings**, under *Public page* rather than
  under the name where it sat until 2026-09-12.
- **It is called the *description* again**, in the interface as it always was
  on the wire. The word *notepad* now appears nowhere a user can see.
- **Only a public channel is offered it.** No page, no field.
- **Nothing of it is left on the channel screen.** No card, no rendering, no
  *Edit*. The tab that held it is called *Clipboard*, holds the one card it
  ever shared the tab with, and has no section label over it — the rule
  *Listen* and *Recordings* already follow, a tab with one card being its own
  heading.

## Why

**Who the words are for.** The 2026-09-12 argument was about the word: a
notepad you must leave the page to write on is not one, so the field followed
the rendering onto the tab. Both moves took for granted that the people in the
channel are the readers. They are not — they are *in* it, and nothing on that
sheet tells them anything they do not have. The one reader who needs it is the
stranger on the *public page* or in the *feed*, which is where this string has
been interpolated since 2026-09-21. So it belongs beside the switch that makes
that page exist, and a private channel writing a blurb nobody can read was the
whole of what the tab amounted to.

**The gate is the same question the page's other settings answer.** Cover art,
category and language are already offered only while the page is on, under one
sentence saying they are for a directory. The description is the one of the
four that the page itself uses, so it goes above them and outside `Publishing`,
which owns a pair of buttons and an HTTP call and has no business owning a
third piece of channel state.

**A channel that goes private keeps what it wrote.** `SET_DESCRIPTION` is
untouched, the reducer gates nothing on the page, and the row is not cleared —
turning the page back on brings the same words with it, which is the bargain
`unpublishBody` already strikes with the recordings' agreements. The gate is
the field's, not the wire's, so there is nothing here to shim and no build
number to remember.

## What came back, and what did not

Back: the field on the settings screen, the character count under it, the
`saved` ref covering two values instead of one, and the sentence that says to
step in when `canEditChannel` is false.

Not back: the markdown parser and its live preview, dropped on 2026-09-13 and
argued against there on grounds this change does not touch. The description is
the characters somebody typed.

Gone: the draft machinery on `ChannelView` — `notepad`, `notepadSaved`,
`notepadShown`, the adopt-unless-unsaved effect, the persist-on-tab-change and
persist-on-unmount effects, and `notepadEditing`. All of it existed because a
tab is somewhere a person sits while snapshots land. A settings screen is
opened, edited and closed, so local state seeded once is enough, which is what
the name field beside it has always done.

## Two things it cost

**`Field` gained an `onFocus`.** The description is the fifth card down a
scrolling screen and the keyboard covers it, so it wants the `Reveal` the
notepad had. But `useRevealOnKeyboard` listens while its `when` is true, and
the honest `when` on a settings screen is *this field has focus* — the name
field at the top wants nothing moved. `Reveal` from inside `<Screen>`, as
`RevealContext` insists; `channelSettings.test.tsx` pins the listener count
and the absence of the warning.

**The tab had to be renamed.** *Notepad* named the sheet, so a tab keeping that
name over a clipboard would be a heading for something that is not there. The
glyph did not change: it was `lucide/clipboard-list` all along, chosen because
the tab's larger half was always the clipboard, and only the exported name
moved — `NotepadIcon` to `ClipboardIcon`. Spanish is *Portapapeles*.

## What is left saying "notepad"

The three decision files that argued it, this one, and the submission texts for
1.5.0 through 1.7.0, all of which are dated records of a version that shipped.
Everything a session reads as current — GLOSSARY.md, STYLE.md, the code's own
comments — says *description*, and GLOSSARY.md's entry moved from `## Notepad`
to `## Description (a channel's)` with the fortnight in it, because a reader who
meets the word in an old decision needs somewhere to land.

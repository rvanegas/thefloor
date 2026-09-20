# 2026-09-20-the-watch-link-arrives-by-paste-rather-than-by-typing

The *Watch* card had a text field with the placeholder *Paste a YouTube link*,
and the placeholder was the whole of the truth: nobody has ever typed
`https://www.youtube.com/watch?v=dQw4w9WgXcQ` into a phone. The link arrives
from somewhere else — the YouTube app's share sheet, a browser, a message — and
the only thing anybody did with that field was long-press it, wait for the
magnifier, aim at *Paste* in a popover, and then look at a box of machine text
they had no way of proofreading. Task `use-paste-instead-of-field`.

So the field is gone and the button reads the clipboard itself, at both places
a link could be given: *Watch something together* on an idle card, and *Watch
this instead* behind *Change video*. Each carries the sublabel *Plays the
YouTube link on your clipboard*, which is what the placeholder used to say and
is now said where somebody will read it.

**The button is lit whenever the floor allows a film to be put on, and the
clipboard is not consulted until it is pressed.** The tempting version enables
the button only when the clipboard holds a link — the field's behaviour, which
greyed *Watch something together* until `parseYouTubeUrl` accepted what was
typed. That needs the clipboard read on every render, and on iOS every read an
app makes that a person did not ask for is a system paste notification saying
this app went through your clipboard. One tap is a cheaper price than that, so
the refusal moved after the press and into words: *There is nothing on your
clipboard to paste* for an empty one, and *That is not a YouTube link. Copy one
from YouTube, then press this again* for the other. Beside the control, as
STYLE.md § *Words on controls* has it.

**The two-step swap survived, and is the reason `changing` is still there.**
With no field to fill in, *Change video* could have read the clipboard on the
first press — and then a stale YouTube link sitting on somebody's clipboard
from an hour ago would empty four other people's picture and start it again
from black, on one tap of a button whose old meaning was *open a box*. So the
first press asks and the second answers. Starting a party from an idle card is
one press, there being nothing to interrupt.

`parseYouTubeUrl` stays in `core` for exactly the reason it went there: the
press and the server now disagree about nothing, and what was pasted is
trimmed before either sees it.

What is lost is typing a link out by hand, and dictating one. Neither was
happening.

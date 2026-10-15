# The invite page asks for one thing

2026-10-15. Asked for at the prompt, from a screenshot of the page in Chrome
on an iPhone, as three things:
- the language belonged to the previous method, so it should stop referring
  back to the link;
- the only call to action should be *Accept invite*, with *Get the app* less
  prominent and presented as a prerequisite;
- the page should look at `~/Desktop/tg` again, Telegram's `t.me` page.

Two choices were put at the prompt and answered: what *Accept* does, and
where the install goes.

## What changed on the page

**One button, *Accept invite*.** The install moved into a bar across the top
— the mark, *The Floor*, and a small outlined *Get the app* — as Telegram's
page carries *Download*. The heading is the invitation itself, *Rodrigo
invited you*, as Telegram's card leads with the person.

**On iOS, one line above the button names the prerequisite**: install first,
come back here, accept. Elsewhere there is no app to need, so it is not drawn.

**Nothing tells anybody to find the link again.** It was there because an
install loses the link; but the tab is still open with the pin in its address,
so coming back to it is the way back.

## What *Accept* does

**On iOS it opens the app** with `thefloor://i/<username>/<pin>`, the Smart
App Banner's argument, which build 351 and every build since 288 read with the
pin. Until now *Accept* opened the web app everywhere, which made it a dead
end for somebody who had just installed: they came back, accepted, and landed
in the browser.

**Everywhere else it is unchanged**: it writes the invitation into the tab on
the click and opens `/open`.

**Platform is decided in the page, not from `User-Agent`.** iPadOS Safari
calls itself a Mac to the server, and a touch screen is the tell. A
`<head>` script marks `<html>` before first paint, so neither copy flashes.
Without script, the page is the browser flow.

**If the app is not there**, the browser complains first — Safari's invalid
address, or Chrome's *Allow* followed by an error — and a moment later the
page says the app is not on this iPhone yet and fills *Get the app*. A page
that went hidden in that moment had its app open, and the verdict is
withdrawn, since Chrome's prompt can outlast the wait.

## What this reverses

`2026-10-13-an-invitation-is-one-link-and-a-page.md` said *nothing here fires
`thefloor://`*. That stands for load — the half of Telegram's page that was
not taken — and no longer for a tap made after the page has said to install
first. Its *continue in the browser* line, and the 2026-10-15 pin decision's
two buttons, are both replaced by the one.

## The community page too

Asked for at the prompt straight after, as "do the same for the community
page". `/j/<code>` now has the same bar and one button, *Join community* —
*join* being the glossary's verb for a community — which on iOS hands the app
`thefloor://j/<code>`, the banner's argument and the only form build 351
reads, and elsewhere opens the web app. The heading is the community's name.
The *continue in the browser* line and the aside to tap the link again are
gone.

**The code is still left in the tab on arrival**, unlike the invite page's
pin, which waits for the click: a community code is not a seat.

What the two pages share — the bar, the platform marker, the button block and
its click — is `server/src/accept.ts`, so they cannot drift apart.

## Not done

**The refusal bodies**, and the community pages for a code that opens nothing
or a full community on a box with no web app, keep their shape: there is
nothing to accept on them.

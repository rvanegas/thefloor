# An invitation is one link and a page

2026-10-13. Both invitations — *Share Invite Link* and a community's *Share
link* — go back to sending one link, and what that link shows in a browser
goes from an immediate hand-over to the web app to a page: who invited you or
which community, *Get The Floor for iPhone*, *continue in the browser* beneath
it, and Safari's Smart App Banner above. Asked for at the prompt as "follow
Telegram's example", from notes and screenshots of `t.me/<username>` opened
without Telegram installed, on an iPhone in Chrome and an iPad in Safari.

## What it replaces

`2026-10-11-a-community-invitation-is-two-links.md` and
`2026-10-12-a-contact-invitation-is-two-links.md`: a message of two links,
the App Store then the link, and a browser handed straight into the web app
with nothing to read. Their universal links, the AASA and the tab hand-over
(`peekInvite`, `peekJoin`) all stay; only the message and the page change.

## What was taken from Telegram

**One link.** A `t.me` link is the whole message, and its page carries the
install. Choosing between that and keeping two links was put at the prompt,
and one link was chosen.

**The page leads with the app.** The store is the button; the web app is a
quieter line under it. That is Erta's point from 2026-10-02 —
`task/collapse-the-three-invitations-into-one.md` — that on an iPhone a
web-first flow feels retro, and handing every browser straight into the web
app was exactly that.

**The Smart App Banner** (`smartAppBanner` in `server/src/html.ts`), with
`app-argument` set to the page's own address without name or pin. Somebody
with the app reaches the page only after telling iOS to keep the domain in
Safari, which iOS remembers; the banner's *Open* is their way back. Safari
only: Chrome on iOS ignores the tag, which is why the page keeps its own
store button.

**Corrected 2026-10-14: the argument is `thefloor://i/<username>` and
`thefloor://j/<code>`, not the page's address.** "The app reads the `https`
form already" was true of master and false of the released build 351, which
claims no domain and reads only the scheme. On 351 every invited arrival
reaches this page, and *Open* launched the app holding an address it ignored —
seen in production as an invitee who had to add the inviter by hand. Every
build reads the scheme form, so it is the one argument that works for all of
them.

## What was deliberately not taken

**Telegram's scheme link.** Its page fires `tg://` on load and from *Send
Message*; without the app that is Chrome's *Allow* prompt followed by an
error, or Safari calling the address invalid. Nothing here fires
`thefloor://`: a reader of this page almost certainly has no app, since the
universal link would have taken them past it.

**Telegram's dead end.** It offers nothing but the install; this page offers
the web app, and leaves the username or code in the tab on arrival, so
*continue in the browser* is a plain link to `/open`. Leaving it costs
somebody who goes to the store nothing — the tab is the only place it is.

**The return trip is not solved**, by Telegram or here: an install loses the
link, so the page says to tap it again once installed.

## What remains of the hand-over

A box with a web app and no `APP_STORE_URL` still hands straight over, since
there is nothing to lead with. A full community is drawn like any other where
there is a web app, for `2026-10-12-a-community-link-opens-the-community-for-a-member-too.md`'s
reason.

## No shim and no ordering

No wire field moved and no path was claimed or released. The server half is a
deploy; the message half needs a build, and until one is installed older
builds keep sending two links, the second now landing on the page.

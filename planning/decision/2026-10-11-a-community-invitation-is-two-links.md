# A community invitation is two links

2026-10-11. *Share link* on a community stops sending somebody to a page and
sends two links instead: the App Store, then the community link, which joins
in one click — in the app where it is installed, in the web app where it is
not, and after a sign-in if one comes first. Asked for at the prompt that day,
scoped there to the community link rather than the contact invite.

## What it replaces

`/j/<code>` opened the *community page*: the community described, the App
Store, then `thefloor://j/<code>` to tap *once the app was installed* — which
meant coming back to the page after the store — and the web app as the
alternative. Three choices and a return trip, for somebody who had been asked
to do one thing.

## What was decided

**The message carries the order and the page goes.** `communityInvite` in the
catalogue writes *Get the app: <store>* then *Then tap to join: <link>*, the
order somebody without the app takes them in; with no App Store to name, the
link alone. The owner's *Open page* went with the page — there is nothing
left for the owner to see from here, and opening the link would only have
joined them to their own community.

**The link is a universal link, which ends a deferral.** `/j/*` is claimed:
`ios.associatedDomains` in `app.json`, and the AASA served from a route,
`APPLE_APP_SITE_ASSOCIATION` in `server/src/app.ts`, claiming that path and
no other. `task/universal-links.md` had held all universal links back for a
domain move; asked directly, Rodrigo chose to build them now, and that file
now says what is left (`/i/*`, `/g/*`). Nothing else gives *opens in the app
if it is installed* from one address: a custom scheme fails ugly without the
app, and no page can detect an install — `2026-09-25-the-invitation-asks-for-one-thing.md`.

**In a browser, the server hands over rather than describes.** For a live
community with a web app on the box, `/j/<code>` is a page that writes the
code into `sessionStorage` and `location.replace`s to `/open`. A page and not
a 302 so a link preview still gets the card, and because only a script can
write the tab's storage. The community page survives only where there is
nothing to join into: a dead code, a full community, or a box with no web app
— where it offers the App Store and says to tap the link again, which by then
opens the app.

**The code stays in the tab until it is spent** (`peekJoin`, `forgetJoin`),
where it used to be taken on read. That is the *save state across the
sign-in* half of the ask: the sign-in is a mailed code, and the trip to the
mail app is when iOS reloads a backgrounded tab, which used to lose the join
silently. `takeInvite` takes on read because an invitation was single use; a
join is not — a second spend opens the channel again — so nothing can be
spent twice.

## What was deliberately not built

**The contact invite** (`/i/<username>`) keeps its page and its return tap.
Same shape of problem, not what was asked; `collapse-the-three-invitations-into-one.md`
is where it is open.

**No shim.** Old builds keep reading `thefloor://j/`, the server change is a
page becoming a different page, and no wire field moved. An old build's
*Share link* sends the bare URL, which now lands a phone without the app in
the web app rather than on a page offering the store; the web app's own
install notice covers that.

## The order this ships in

1. **Deploy the server first** — the AASA has to be live before any build
   claiming the domain is installed, since the association is read at
   install and Apple's CDN caches a miss. `curl` it from off the box after.
2. **Then a build**, with the Associated Domains capability on the App ID; an
   entitlement the profile does not permit is dropped without a word.

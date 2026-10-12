# A contact invitation is two links

2026-10-12. *Share Invite Link* stops sending somebody to the invite page and
sends two links instead: the App Store, then the invite link, which makes the
reader the sender's contact in one click — in the app where it is installed,
in the web app where it is not, and after a sign-in if one comes first. Asked
for at the prompt the day after
`2026-10-11-a-community-invitation-is-two-links.md` did the same to the
community link, and built the same way; that file carries the reasoning, and
this one says what differs.

## What it replaces

The page of `2026-09-25-the-invitation-asks-for-one-thing.md`: one call to
action, the install, then *come back to this link and press Open in the app*,
which handed over `thefloor://i/<username>`. That decision called it two taps
and said a universal link would collapse it to one. This is that.

## What was decided

**The message carries the order.** `contactInvite` writes *Join me on The
Floor*, *Get the app: <store>*, *Then tap to add me: <link>*; with no App
Store to name, the link alone. *Link copied* lost "It works once, for the
first person who opens it", untrue since pins went on 2026-09-25.

**`/i/*` is claimed beside `/j/*`.** The AASA lists both; `inviteOfUrl` reads
`https://<host>/i/<username>` and still reads `thefloor://i/…`.

**In a browser, the server hands over** — a page writing the username into
`sessionStorage` and replacing itself with `/open`, as `/j/` does. The page
checks nothing, so unlike the community link it cannot tell a dead username
from a live one, and does not try: a refusal is said by the app after the
sign-in, as it already was. A page is drawn only by a box with no web app.

**The invitation stays in the tab until it is spent** (`peekInvite`,
`forgetInvite`), on the community link's reasoning — the sign-in's trip to the
mail app is when iOS reloads a tab. It was taken on read because a pin was
single use. **A pin-less acceptance is not** (`acceptInviteLink` finds the
pair already contacts and changes nothing), so leaving it is safe. A pin is
the one exception and is still taken on read.

**No pin is passed on any more, from either road.** A link minted before
2026-09-25 is `/i/<username>/<pin>`; the hand-over writes the username alone,
and `inviteOfUrl` drops a pin from the `https` form. Accepting by username
works for any account and is never refused as used, which a spent pin would
be, so the pin could only make the link worse. The `thefloor://` form still
passes one on, for a page already open in somebody's browser; Gate 290 in
planning/SHIMS.md still retires all of it.

## What was deliberately not built

**The invitation email** keeps its wording. *Open it here: <link>* then *It is
on the App Store too* was already the two-link shape, and the link now opens
the app where it can, which makes the email truer rather than wrong.

**Guest links** (`/g/*`) stay unclaimed. `task/universal-links.md` says why
and what it would cost.

**No shim.** Older builds read `thefloor://i/` and ignore the `https` form,
and do not claim the domain, so the link opens in a browser for them and the
hand-over takes it from there. Nothing on the wire moved.

## The order this ships in

The same as the community link's: **deploy first**, so the AASA lists `/i/*`
before any build relying on it is installed, and `curl` it from off the box;
**then a build**. Associated Domains is already on the App ID, since
2026-10-11, so nothing changes there.

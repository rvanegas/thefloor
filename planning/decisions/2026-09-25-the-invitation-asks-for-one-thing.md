# The invitation asks for one thing

2026-09-25. The invite page loses three hundred words, four of its five
headings and one of its two calls to action; the install becomes the ask; and
an invited arrival now opens the channel it just made.

Reverses two things: `2026-09-06-an-invitation-is-a-link-with-one-seat.md`
§ *The invitation page inverts the landing page's call to action*, and
`2026-09-22-an-invitation-holds-a-seat.md`'s sibling of the same week — the
paragraph in `server/src/invite.ts` that added a heading and a cost to each
route. Both were argued well and neither was wrong about what a browser
cannot do.

## What was wrong, and it was not the word count

The page ran to some three hundred and fifty words under five headings: an
introduction, a consent paragraph, *Accept in this browser*, *Then put it on
your phone* with a two-item list about notifications and staying signed in,
and the store link. planning/MARKETING.md calls this the top of the funnel,
somebody opening one having been asked by name, so it was also the
most-converting page in the product.

**The defect underneath was a second sign-in.** The page's advice was to
accept here and install afterwards. Anybody who took it and then ended up
where this application wants them — on a phone, where they can be reached —
typed their email address and a mailed code *twice*. The five headings were
what dressed that up as a choice, and the choice was never even: a browser
cannot be notified, so somebody who stops at one is barely in the application
at all.

That is why this is a reversal rather than an edit. Cutting the prose and
leaving the browser first would have left the stutter exactly where it was.

## What was decided

**One call to action, and it is the install.** Sixty-odd words: the mark, the
inviter's name in the standfirst, one sentence, one button, a line under it,
and *Privacy*. The sentence is planning/LISTING.md's promotional text
verbatim, that being the field written to be repeatable and the one under
review; it is not rewritten here, and if it changes it changes there first.

**The refusal page gets the same shape**, and loses § *In the meantime*
entirely. A refusal and a pitch are two openings, and the refusal is what that
reader came for.

**`refusalText` gained a third field, `aside`**, holding the next step. Three
of the four refusals are answered by asking the sender again and the fourth
*is* the sender, so one shared line under the button could not be written —
`self` would have told somebody to ask themselves. It also stopped `body`
saying it twice: *used* already read "ask whoever sent it for another one".

**The install keeps the invitation, by way of the return tap.** A trip through
the App Store does not carry the address — the warning at the foot of the old
page, now the thing that had to be fixed rather than warned about. So the page
says to come back to the link and press *Open in the app*, which hands the pin
over as `thefloor://i/<username>/<pin>`; `useInviteLink.ts` holds it across the
one sign-in and spends it after. One address, one code.

**It is two taps and the copy says so.** A universal link would collapse it to
one and is deferred — see below.

**The browser is demoted, not removed.** One quiet line, and it is
load-bearing for four populations the page cannot tell apart: a desktop
visitor, an Android phone (never built), a box with no `APP_STORE_URL`, and
anybody who has told iOS to keep this domain in Safari, which it remembers.
That last one is why the browser path cannot be treated as the unhappy case.

**Nothing detects the install, and the copy stands in for it.** `thefloor://`
fails ugly without the app — Safari says the address is invalid — and no script
on the page can find out in advance. So *Open in the app* is never offered as
an alternative to installing; it is written as the second step of the one ask,
so somebody reading in order has either just installed or already had it. A
`localStorage` marker set by a click on the store button was the alternative
and was rejected: it is absent in a private window and on a return through
another browser, so the copy has to stand alone regardless, at which point the
marker buys emphasis rather than correctness.

**The button is never dead.** A box with no `APP_STORE_URL` promotes the
browser accept into the button instead, so *one* call to action is true in
every configuration rather than only the deployed one; a box with neither
draws no button at all. Four rows, all four tested — an `href=""` is worse
than an absence, and that is the rule `landing.ts` and `supportPage` already
follow about the same setting.

**And the arrival opens the channel it made.**
`POST /contacts/invite/accept` now returns `channelId`, on the reasoning
`2026-09-24-accepting-a-request-opens-the-channel-it-makes.md` set out for the
sibling route the day before. **It matters more here.** There the accepter was
already a user with a Home; here they may have signed up seconds ago because
of this link, so it is their *first* contact and their first channel — and it
used to appear in *Your channels* with no mark and no line, on a list they had
no reason to be reading. The redemption itself was already complete: the pin
spent, the contact written as `accepted` outright, the pair channel created,
the inviter pushed. Only the telling was missing.

**It opens and does not step in**, which is the load-bearing half and is
sharper here than on the row that inspired it: this is a person's first second
in the application, before they have tapped anything inside it, and an arrival
that silently opened a stranger's microphone would be the worst possible
version of this.

## Why `useInviteLink` is a hook and not a line in `handover.ts`

The tidy option was a module-level hold there, so that one `takeInvite`
answered both roads — one function, one shape, which is what
planning/UNIVERSAL-LINKS.md § *What it would cost here* item 5 asks for.

**It does not work, because a module variable cannot tell React that something
arrived.** The effect that spends an invitation is keyed on the token, so it
would find the held value only if it happened to re-run, and two ordinary
arrivals never do: somebody already signed in at launch, where the token
resolves before `getInitialURL` does; and somebody signed in who backgrounds
the app, taps the link and comes back, where the token never changes at all.
The second of those *is* the designed walk. `useState` fixes both by
construction, and `inviteHold.test.tsx` is eight tests about exactly that.

What the two roads share is the consumption end, which is where the sameness
was actually wanted: one `Invite` type, one rule that an invitation is taken
before it is known to be redeemable, and one effect spending both.

## What was deliberately not built

**Universal links**, again. They would make the return tap land in the app
with no second press, and a domain change is intended: the entitlement bakes
the domain into the build, the association is evaluated at install, and Apple's
CDN caches it for hours or days, so building it now means paying the riskiest
third of that work twice and shipping an intermediate state that gets
discarded. planning/UNIVERSAL-LINKS.md stays, corrected, and now carries the
domain move as the governing reason. Its paragraph excluding `/i/*` from the
AASA was rewritten rather than kept: its stated reason was that the browser is
the way to accept, which this decision makes false, so `/i/*` is now the first
thing to claim when somebody revisits it.

**Deferred deep linking** — carrying the invitation across the App Store for
somebody who did not have the app. Only a clipboard read, with iOS's paste
prompt, or a third-party attribution SDK can do it. Neither is worth it while
the link is sitting in the thread it was pasted into and re-tapping it is free.
`inferInviterFromFirstContact` already recovers the *credit* edge within thirty
days, so what is lost is the contact and the channel, which is what the return
tap is for.

**No `SHIMS.md` entry, and this was checked rather than assumed.** Its gate is
a wire change needing the server to keep answering an older install.
Everything here is additive in the safe direction: `channelId` is a new
optional field an older build ignores, `landedChannel` is client-only, and an
old build meeting `thefloor://i/…` falls through `channelOfUrl` to null, which
is a no-op. Nothing renamed, nothing removed, so there is no shim and no build
number to record.

## The order this ships in

Three pieces, because they reach people on different days.

1. **The server** — the page, the shared `MARK` and `CTA_STYLE` in `html.ts`,
   and `channelId`. Additive and server-rendered, so it is safe for every
   build in anybody's hands, and it is asks one and two in full.
2. **A build** — `useInviteLink`, the navigating effect, the widened client
   type.
3. **The scheme line on the page**, which is *not* in step 1 and is
   `tasks/the-invite-page-can-offer-open-in-the-app.md`.

**Step 3 is separate because the scheme is already registered.** `app.json`
has carried `"scheme": "thefloor"` since 2026-09-16 and `released` is later,
so installed builds already open on `thefloor://` and already ignore an `/i/`
path — they open, and drop the pin on the floor, silently. An *Open in the
app* button shipped before step 2 reaches phones would therefore break
precisely the arrival this decision is about, and leave no trace. So the page
ships without it and gains it once a build carrying the handler is *released*,
which is the population rather than TestFlight.

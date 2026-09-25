# An invite link is a standing door

2026-09-25, later the same day as
`2026-09-25-the-invitation-asks-for-one-thing.md`, which cut the page to one
call to action and is the reason this was looked at at all.

The pin goes. A link is `/i/<username>`, it is the same address every time, it
never expires and it is never spent. An invitation sent to an address accepts
when that address signs up, so both halves of *Add a contact* now mean the same
thing. And the page greets its reader with a name carried in the address rather
than one looked up.

Supersedes `2026-09-06-an-invitation-is-a-link-with-one-seat.md` in almost
every particular. Read that one first: it is right about everything except its
premise.

## What was incoherent

**One card, two halves, opposite rules.** *Add a contact* takes an email
address or hands over a link. The address wrote a **pending** request somebody
had to answer. The link wrote an **accepted** contact and the channel that goes
with it, on the spot.

**And the email carries the link**, which is where it stopped being a
difference of mechanism and became a defect: the same invitation, from the same
person, to the same recipient, resolved one way if they clicked the link in the
message and the other way if they ignored it and signed up. Nobody chose that.
Nobody could have explained it.

The 2026-09-06 argument for the link's half was sound and is worth restating,
because it is the thing that had to be dismantled rather than contradicted:
publishing a link is the owner's half of the ask and following it is the other
half, **and that only holds because the pin makes it one seat** — "an open door
would have to ask."

## What was decided, and the premise that changed

**Publishing a link is consent, and the pin was never what carried it.** The
owner consents by putting the link where somebody can follow it; the follower
consents by following it. That is true of a standing door and of a seat alike.
What the pin actually bought was a *limit* — one taker — and a limit is not a
consent.

So the door stands open and still does not ask. Both halves of the card agree
now: **an invitation is taken up, never answered.** By link, by following it;
by address, by signing up with the address it was sent to, which is the same
shape of consent — the sender named you, and you turned up.

**An address change is the exception and stays pending.** Attaching a mailbox
to an account that already exists is not an arrival, and a mailbox can have
been written to before this person owned it.

## What the pin cost and what it bought

It had three jobs. Only one of them survived scrutiny.

**Attribution did not need it.** `creditInviter` names an owner; a username
names an owner. The pin was never in it.

**The disclosure needed it, and the fix is better than the pin was.** The page
could say *Anna Kowalski invited you* only to somebody holding a live pin —
otherwise this server would answer "who is @annak" for anybody who asked, which
is the directory `core/username.ts` says there is not. The link now carries the
name: `/i/annak?name=Anna%20Kowalski`. **The page looks up nothing at all**, so
`/i/annak` and `/i/nobody_at_all` render identically and walking usernames
teaches a reader exactly what they typed. It is a better answer than the pin's,
which leaked the name to anybody a link was forwarded to.

**The one seat is simply gone**, and most of what went with it was clutter: no
expiry, no spending, no cap of ten per account, no eviction, no *already used*
page, no *expired* page. Two whole refusals and a page branch left with it.

**`?name` is not evidence and the page does not dress it as any.** Anybody may
write any name into any link. What that buys is one line of prose: the contact
is the account named by the **username**, and the app draws that account's real
display name from the moment it exists. It is escaped, and capped at forty —
the length a display name is stored under — because a link is a place somebody
else's text arrives from. Falls back to `@username` when absent.

## What a standing door costs, and the one thing added for it

**Enumeration, which is not the consent question.** The accept route names an
owner and nothing else, so an account that never saw a link can walk usernames
and accept against each one. A username is quotable by design. That is not
somebody following a published link, so nothing above covers it — and since
credit follows the first contact, unlimited accepting is unlimited standings.

So `link_accepts`: **twenty a day, counted against the taker.** Deliberately
far above any honest use and far below a harvest. Counted against the taker,
unlike `invite_guesses`, which counts against the owner being guessed at —
there is nothing to guess now. Following a link you already followed spends
nothing, and neither does following your own, or a day could be exhausted by a
double tap.

## What was deliberately not built

**Blocking.** A standing door means somebody you would rather not hear from can
become a contact by finding your link. `removeContact` exists and is the
answer today. A real block — an edge that refuses to be remade — is a feature
in its own right and belongs to whoever asks for it, not to this change.

**An existence oracle worth closing.** The accept route still refuses an
unknown username differently from a budget refusal, so a signed-in account can
learn whether a username exists, twenty times a day. The page leaks nothing,
which is where it mattered; this is a thin channel behind a session and a
budget, and closing it would mean answering a real link and a typo identically,
which is worse for the person who mistyped.

## What this leaves outstanding

`inviteRefusalText` is still server-side English that the app shows verbatim —
`backlog/a-refusal-is-the-one-thing-in-the-app-that-cannot-be-spanish.md` — and
this change adds a refusal to it. The backlog entry is unchanged in substance
and now has one more sentence behind it.

## The shim, and the one thing in it that is permanent

`planning/SHIMS.md` § *Gate 290* has the list. The half worth repeating here:
**`GET /i/:username/:pin` has no gate and is not a shim.** Invite links live in
other people's threads for as long as those threads do, so that address keeps
resolving indefinitely; it ignores the pin and renders the same page. What is
gated is the code that still *reads* a pin, and its real gate is a date rather
than a build — every pin ever minted has expired by 2026-10-25.

# The accept route says whether a username exists

`POST /contacts/invite/accept` refuses an unknown username differently from a
refusal about the day's budget, so a signed-in account can learn whether a
username is held — twenty times a day, which is what `link_accepts` allows.

Recorded 2026-09-25 with
`decisions/2026-09-25-an-invite-link-is-a-standing-door.md`, which made the
page stop leaking and left this.

## Why it is small

**The page is where it mattered and the page is clean.** `GET /i/:username`
reads nothing at all: a real username and an invented one render identically,
so the address is not an oracle and never was walked for free. This one is
behind a session and a daily budget, so what it offers is twenty guesses a day
from an account somebody had to create.

**And what it yields is thin.** That a username is held, not who holds it — the
display name is not disclosed by any of this, which was the part worth
protecting. `core/username.ts` is the standing rule and it is about names being
*looked up*; a refusal is a weaker thing than a lookup.

## Why it was not closed

**The obvious fix is worse for the person who mistyped.** Answering an unknown
username identically to a successful acceptance means somebody who fat-fingered
a link is told it worked, and then finds no contact and nothing to explain it.
Answering it identically to the budget refusal tells them to come back
tomorrow, which is a lie that costs them a day.

`redeemInvitePin`'s own coyness was affordable because the *pin* carried the
secret and an unknown username could be answered exactly like a wrong pin. With
no pin there is no second thing to hide behind.

## What would change the arithmetic

- **A username becoming worth enumerating**, which is the same trigger as
  `a-standing-door-has-no-lock.md` and probably the same conversation. A list
  of held usernames is only useful if holding one exposes you to something.
- **Rate limiting getting cheaper to tighten.** The budget exists and is twenty;
  a lower number costs honest users nothing and shrinks this proportionally,
  which is a smaller change than making the refusals agree.

# The App Review demo accounts

**Standing, for as long as the app is on the store.** These accounts exist so
App Review can sign in, and **every update is reviewed** — so the credentials in
the notes have to work at each submission, not just the first. Written
2026-08-14 as a temporary file to be deleted on approval; corrected 2026-08-19,
when the app was approved and it became clear that deleting them would leave the
next submission with a sign-in that fails. RELEASING.md is the wider release
checklist and points here.

Two real accounts and one real channel live on production. They are demo data
and hold nothing that matters, which is deliberate: **the sign-in code is
published in the review notes, so anyone who reads them can sign in.**

The identifiers, the code and the bearer tokens are **not in this file**. They
are in `~/.config/thefloor/demo-account.txt`, mode 600, on the development
machine — the same reasoning that keeps the `.p8` keys out of the tree, since
`bin/deploy` rsyncs with `--delete` and a credential inside it is one a later
deploy removes.

---

## What exists, and why the second account is not a mistake

| | |
| --- | --- |
| `App Review` | the demo account; the address and code go in the review notes |
| `Sam Rivera` | its contact, and the reason is structural |
| one channel | between the two of them |

The second account looks redundant and is not. `ChannelRegistry.create` refuses
an invitee who is not already an accepted contact — `channels.ts`, the
`areContacts` guard — so **an account with no contacts cannot create a channel
at all.** The review notes promise a reviewer can create one, and with a single
demo account that promise is false and the app looks broken. Sam is what makes
it true.

Accepted contacts cannot be undone: the only mutators are request, withdraw,
accept and decline, and none of them removes an accepted pair. So the link and
the channel survive anything a reviewer does *except* deleting the account —
**and, since 2026-08-31, changing its address.** The profile screen can move an
account to a different sign-in address once a code sent there comes back, and
nothing exempts this one. A reviewer who did that would leave the submission
notes naming a mailbox that no longer signs in, and the failure would look like
a broken demo account rather than a changed one. Unlikely, since it needs a
mailbox they control and there is no reason to try it — but if sign-in with
`REVIEW_IDENTIFIER` ever fails while the row is plainly still there, this is
the first thing to check: `select identifier from accounts where id = '…'`.
decisions/DECISIONS.md § *Changing your address is a sign-in, not a save*.

**Both addresses are named in `server/.env`, and the second one only so that
neither counts as a user.** `REVIEW_IDENTIFIER` gets the fixed code;
`REVIEW_CONTACT_IDENTIFIER` gets nothing but exclusion from `oldestBuild` and
`silentBuilds` on `/healthz`, which measure the installed population that a
raised `MIN_SUPPORTED_BUILD` would strand. A phone at Apple running whatever
was last under review is not that, and Sam — which has never reported a build
number at all — would otherwise hold `silentBuilds` at 1 for the life of the
app, which is the condition under which that whole reading is not to be
trusted. decisions/DECISIONS.md § *The build census counts users*.

---

## The one way a reviewer can break this

`DELETE /me` exists for Guideline 5.1.1(v), and verifying it is a reviewer's
job. Deleting the demo account takes its contacts with it in both directions.
Signing back in with the same address and code then yields a **fresh account
with no contacts**, which cannot create a channel — so the rest of the review
happens against an app that appears to do nothing.

The cheap guard is a line in the review notes asking them to test deletion
last. If it happens anyway, the repair is the bypass flip described below:
create a new pairing, or re-pair the new account with Sam.

---

## Teardown, when the app is withdrawn

**Not on approval.** These accounts outlive every review, because there is
always another one — see the header. What ends them is the app leaving the
store, or the review sign-in being replaced by something better.

Do these in this order. The order is the whole point of writing this down.

**1. Deploy first if `DELETE /me` is not live.** Both paths below go through
that route.

**2. Delete both accounts.** With the tokens from
`~/.config/thefloor/demo-account.txt` — **but check they still work first.**
Both stored tokens were found dead on 2026-08-16, two days after issue and 88
days before they expire, so something revoked them rather than time doing it;
a sign-out is the likeliest cause and `POST /auth/sign-out` revoking the token
it is called with is documented below. `curl -H "authorization: Bearer $TOKEN"
https://thefloor.rvanegas.co/home` answers 200 or 401 and settles it. A dead
token is recoverable **only while the bypass is still configured** — sign in
again with `REVIEW_IDENTIFIER`/`REVIEW_CODE`, or with the flip below for Sam,
and write the new tokens into the file. That is why this step comes before
step 3 and not after.

    curl -X DELETE https://thefloor.rvanegas.co/me \
      -H "authorization: Bearer $DEMO_TOKEN"
    curl -X DELETE https://thefloor.rvanegas.co/me \
      -H "authorization: Bearer $CONTACT_TOKEN"

**Delete both, not one.** The channel has two members: removing the first is an
ordinary leave and the second survives as the last member, keeping the channel
alive. Removing the second takes the last member out, which ends the channel and
marks it for the week-long sweep that already exists. Stopping halfway leaves a
live channel with one occupant in it forever.

**3. Only then unset `REVIEW_IDENTIFIER`, `REVIEW_CODE` and
`REVIEW_CONTACT_IDENTIFIER`** in `server/.env` on the box, and restart.

    ssh -i ~/.ssh/lightsail-ubuntu ubuntu@44.241.121.49
    sudo systemctl restart thefloor
    journalctl -u thefloor | grep review    # expect "review":"none"

**Unsetting before deleting is the mistake this ordering exists to prevent.**
The tokens expire 90 days after issue (`TOKEN_TTL_MS`, `server/src/accounts.ts`)
— around 13 November 2026 for the current pair. If they have lapsed *and* the
bypass is gone, there is no way into either account and the rows can only be
cleared by editing the database by hand.

**4. Delete this file and `~/.config/thefloor/demo-account.txt`.**

---

## If a token has lapsed, or you need to be Sam

Sam has no working code. `REVIEW_CODE` applies only to whichever address
`REVIEW_IDENTIFIER` names, and that is the demo account's. To get a session as
the other account, borrow the bypass and give it back:

1. Point `REVIEW_IDENTIFIER` at the other address in `server/.env`; restart.
2. `POST /auth/request-code`, then `POST /auth/verify` with the same
   `REVIEW_CODE`. The code is issued before the mail is attempted, so this works
   even if delivery to that address bounces.
3. Point `REVIEW_IDENTIFIER` back; restart. Confirm the startup log names the
   demo account again.

Each restart costs presence but not channels — see AGENTS.md. That is how both
accounts were created in the first place.

Note also that `POST /auth/sign-out` revokes the token it is called with. Signing
the demo account out of the app is recoverable, since it still has a code.
Signing Sam out is not, short of the flip above.

---

## Before submitting, not after

Two things about the demo data itself, recorded here because they are easy to
lose track of:

- **A recording is the one thing that cannot be seeded over HTTP.** It needs
  real audio through LiveKit from a device. If the demo account should show one,
  somebody has to sign in on a phone and record it.
- **`GET /donations` must answer for the demo account** — the reviewer will open
  the Support card. That route was `GET /support` until it was renamed to free
  the path for the human-facing support page; check it under whichever name is
  deployed.

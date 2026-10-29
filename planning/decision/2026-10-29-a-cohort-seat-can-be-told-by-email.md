# A cohort seat can be told by email

2026-10-29. Amends `2026-09-15-a-cohort-seat-goes-to-somebody-who-can-be-told.md`,
whose test this keeps and whose answer it widens.

## What it was

A *getting-started channel* went only to an account that could be told the
room went live, and *told* meant push: `notifications = 'granted'` and a device
token. Placement hung off `POST /devices`, on the registration that brought an
account its first address. Somebody who declined the system dialog had no
token, no grant and no first address coming, so was never placed.

## What changed underneath it

`2026-10-17-notifications-are-asked-for-at-sign-in.md` made a declined dialog
switch on `emailNotifications`, and from then on everything that would have
been pushed — an arrival included, under the same pause — is emailed to the
sign-in address. So the 2026-09-15 test, *can this person be told*, started
answering yes for people the gate still refused. It came to light with `@jdc1`:
signed up 2026-10-26, declined push, email on, nobody here at all — exactly the
arrival a cohort is for, and held back only by a refusal that no longer meant
what the gate took it to mean.

## What it is

Reachable is **push or email**. Push is the old half, plus `push_off`: a phone
switched off in Floor Settings is sent nothing whatever iOS allows, so it is
not somewhere to reach anybody. Email is `emailReachable` — the switch on, and
an identifier that is an email address — which is **the sender's own
predicate**, extracted so the gate and the sender cannot disagree. A phone
number with the switch on is skipped by both.

The moments of placement grow to match. `POST /devices` still places on a first
address; `POST /me/settings` now places when `emailNotifications` turns on —
which is what declining the dialog does, and for such an arrival the only
moment there will ever be — or when `pushNotificationsOff` turns off, since the
first address may already have come and gone while push was off. Placement is
idempotent and the gate is the whole decision, so saving a switch that changed
nothing costs a lookup.

The boot backfill needs nothing: it already runs every candidate through the
same gate, so it places whoever turned email on before this shipped.

## What it places on the first boot

Measured against production on 2026-10-29: eight accounts had email on and no
cohort, and seven of them are in the main contact network (reach 36), which the
reach gate refuses as before. One is placed — `@jdc1`, reach 1.

## What was considered and not done

**Email for anybody, whatever the switch.** Every sign-in address that is an
email *could* be written to. Dropped: the switch is the person's answer, and a
seat spent on somebody the sender will not write to is the seat that can never
answer, which is the whole of what the 2026-09-15 gate exists to prevent.

**Waiting for the first emailed notification as the moment.** Placing on proof
of delivery rather than on the switch. Dropped: a lone arrival has nobody to be
notified about until a cohort exists, which is the deadlock 2026-09-15 already
had to break once.

## The privacy page

Said *it happens when you turn notifications on, and not before*. It now says
it happens once you can be told, naming both ways, in the same commit — a
disclosure that lagged the code by a deploy would be wrong for exactly the
people it describes.

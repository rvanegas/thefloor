# Collapse the three invitations into one

From the call with Erta, 2026-10-02. There are three things somebody can be
invited to — the app, being your contact, and a channel — and joining means
accepting more than one of them. Rodrigo wants it to be one step, optionally:
**the path where the invitee says yes to everything should be the most fluid
and the least demanding**, with the separate ones still possible.

Two shapes were floated: **invitations are always to a channel**, and the
process makes the account and the contact happen too; or **invitations are
only ever to be a contact**, which works if `contacts-are-one-on-one-channels.md`
is built. Not decided.

**The hard part is the App Store.** An install loses the link that brought you,
so a new install can open with no contacts. Today the invite page sends you to
the store and then asks you to come back and press the same link again, which
works and which nobody does. Ideas from the call, none decided:

- In the app on first launch: *if somebody sent you a link, tap it again and
  everything is done for you* — or carry on registering here.
- Send two links: one to install, one to complete the invitation.
- Carry the invited email or phone number in the link and **prefill** the
  sign-in field with it, editable. Rodrigo: save steps, but not so many that it
  gets smarmy; be conventional.
- Erta dislikes being made to go back; she would rather the flow carry the
  person forward, then send a sign-in link to the email or phone so the
  invitation is matched on the far side (`resolveInvitesFor` already matches a
  pending invite to the address at sign-up).

Erta's view, which Rodrigo accepted: on iOS lead with the native app — a
web-first flow feels "retro". The web stays for Android and for guests.
Erta will look at how Luma keeps track of who invited whom. Rodrigo is not sure
whether per-guest tracked links were backed out; check before designing
around them. Read GLOSSARY.md (*invitation*, *invite link*, *guest link*) and
`decision/2026-09-25-the-invitation-asks-for-one-thing.md` first, and
UNIVERSAL-LINKS.md for why there are no universal links.

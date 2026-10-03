# Authenticate With Phone Numbers And SMS

Let somebody sign in with a phone number and a one-time code sent by SMS, as
well as with an email address. Today `request-code` in `server/src/accounts.ts`
refuses anything that is not an email address. `sms-authentication.md` is the
older entry, and all it says is *Not just email.* Pairs with
`offer-to-add-contacts-to-the-floor.md`: address books are indexed by phone
number.

# Add a contact says search when it means invite

The field on *Add a contact* is labelled *Search by email address*
(`searchByEmail` in `app/src/i18n/en.ts`, asserted in
`app/src/ui/__tests__/contacts.test.tsx`). Erta read it as a search on the call
of 2026-10-02 and was unsure whether to search or just type the address.
Rodrigo agreed and had already meant to change it: it does look up an existing
account first and invites otherwise, but it should not *say* search. It should
also take a phone number once `authenticate-with-phone-numbers-and-sms.md` is
built. Change the Spanish string with it.

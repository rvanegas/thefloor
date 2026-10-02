# Contact request fails in the detail view, while it works in the sidebar

Reported 2026-10-02, in these words: *Contact request fails in detail view,
while it works in sidebar.* "Sidebar" is the *list* pane and "detail view" the
*detail (pane)*, in GLOSSARY.md's terms; which screen in the detail pane, and
what the failure looked like — an error line, a 404, or nothing — was not said
and is the first thing to find out.

**The two surfaces do not share a route, which is the likeliest reason only one
fails.** The list's Contacts form asks by name or address:
`ContactsView` → `requestContact` → `POST /contacts/request`. A profile in the
detail pane asks by account: `ProfileView`'s *Add contact* → `connectWith` →
`requestContactById` → `POST /contacts/:id/request`. The second is gated on
`channels.shareAChannel` and answers 404 *No such person.* to a pair with no
channel in common — so a profile reachable from somewhere other than a shared
room would offer a button whose request the server refuses. If that is it, the
button and the gate disagree, and the fix is to make them agree rather than to
loosen the gate by reflex: it is why asking by id cannot be used to probe who
exists.

The guest row's *Add contact* in `channelCards` is a third path, and was not
part of the report.

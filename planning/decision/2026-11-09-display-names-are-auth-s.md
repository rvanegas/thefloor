# Display names are auth's

Decided at noesis's prompt on 2026-11-09, and built the same day (noesis
`planning/decision/2026-11-09-a-channel-s-voices-are-its-members.md`;
dianoia-auth's `display-names-are-stored-here`). A person's display name is
kept at auth.rvanegas.co, so noesis and Roxana call somebody what The Floor
does: a channel's library names each member by it, and Roxana's toggles show
it.

- **A rename here is set at auth first** (`POST /me`, through the register's
  `PUT /names/display` with The Floor's pair), the way a username is. If auth
  refuses or does not answer, the name here stays as it was (503 or 400), so
  the two never differ. An account with no username keeps its name here
  alone.
- **A signup gives auth the name typed**, best effort, while the username is
  still a reservation there.
- **Every sign-in and library connection agrees on one name** (`noesis.ts`,
  `agreeOnName`). The Floor takes auth's name if auth has one. Otherwise it
  gives auth its own, using the grant's own `identity` token, except for an
  account made by that same sign-in, whose name is a placeholder until the
  person chooses one. A taken name reaches contacts' home screens the way a
  rename does.
- **Names chosen here before** are carried once: `ts export-display-names`,
  read by auth's `scripts/display_names.py`.

Nothing is pushed from auth: a name changed there arrives at the next sign-in
or connection.

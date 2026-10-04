# Diagnostics expire on the server's clock rather than the journal's

**What changed.** The lines a debug account's phone ships to `POST
/diagnostics`, and the server's silence notices, went to the journal; since
this date they go to two tables, `diagnostic_lines` and `silence_notices`, in
server/src/diagnostics.ts. Both are swept hourly at `DIAGNOSTICS_RETENTION_MS`,
a week, and `DELETE /me` removes an account's lines and every notice naming it.
`bin/diagnostics` reads the tables, with its flags unchanged, and now windows
by the phone's own stamp rather than by arrival. The journal still gets a
notice's kind and channel, so somebody following it live sees one happen, and
no account id. The privacy page says all of this, in one item.

**Why.** The route's own comment chose the journal over a table to avoid a
sweep and a line in `DELETE /me`, on the premise that "`journalctl` already
rotates" and the data's value "expires in a day or two". The rotation was
measured on 2026-09-17 — backlog/nothing-expires-the-journal-and-something-should.md
— and it is by size, at a 4 GiB cap about sixteen months out, with nothing
deleted since the box's first boot. So the premise was false from the start,
and the cost of it was specific: a deleted account's diagnostics outlived it by
more than a year, in the one store the deletion route cannot reach. Found while
reviewing that backlog entry.

**Why not fix it by setting journal retention.** That is the open question in
the backlog entry, and it waits on the back-catalogue decision in
backlog/session-tokens-are-in-the-journal-in-plaintext.md: a policy short
enough to matter would delete the reconnect evidence before anybody chose to.
Moving these two records out of the journal gives them a lifetime this server
controls whatever is decided there, and takes one dependency off that
question.

**A week**, rather than the "day or two" the old comment guessed or the thirty
days the usage meter keeps: the value of a line is in the days around the
fault it was shipped during, and a week keeps a Friday's run readable on
Monday. Its own constant, stated on the privacy page and held to it by
privacy.test.ts.

**Silence notices are about everybody, not only debug accounts**, which is the
part the privacy page did not say before: any account in a channel can be the
listener or speaker one names. The new item says so.

**What this does not do.** Lines and notices already in the journal stay
there; journald cannot delete single entries, so they age out only under
whatever whole-journal policy is chosen, with the tokens. `bin/diagnostics`
no longer reads them — a run from before the deploy is read with `journalctl`
directly. And `excess` still writes a warning naming the flagged account to
the journal, beside the row that `DELETE /me` removes; that is the same defect
in a third place, left out of this change and filed with the backlog entry.

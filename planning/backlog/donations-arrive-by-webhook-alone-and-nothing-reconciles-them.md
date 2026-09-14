# Donations arrive by webhook alone, and nothing reconciles them

`POST /donations/kofi` is the only writer to the `donations` table. **Ko-fi has no
read API**, so there is no way to ask what we missed: a delivery that did not
land — because the server was restarting, or because their retry gave up — is
gone from here and exists only in their dashboard. **Ko-fi's dashboard is the
authoritative record; this database is a convenience copy**, and anyone
comparing the two should start from that rather than discovering it.

Two gaps, and one tool closes both:

- **Donations paid from an address nobody signed in with.** Attribution is by
  matching the payer's address against `accounts.identifier`, and Ko-fi's link
  carries no field to put an account id in. A donation from somebody's work
  address lands with `account_id` and `matched_by` null. This is the *expected*
  case rather than a failure — deliberately, since the alternative was guessing
  from who last opened the app, which credits the wrong person undetectably
  (see decisions/archive/DECISIONS-2026-08-13-to-2026-08-15.md).
- **Deliveries missed entirely.** Rare enough not to engineer against on its
  own: the window is the few seconds of a deploy's restart, which at any
  plausible rate of donations and deploys is a fraction of a percent. It was
  investigated on 2026-08-14 and deliberately left, because the tool below
  covers it anyway and Ko-fi's retry policy could not be established — their
  documentation refuses automated fetching, and the empirical test costs real
  downtime.

**`bin/import-donations <file.csv>`**, reading a Ko-fi export: dry run by
default, `--commit` to write, reporting new / already-present / unmatched. The
schema is already shaped for it — `matched_by` takes `'manual'`, `raw` is
nullable precisely so a row from a dashboard does not have to invent a payload,
and `kofi_transaction_id` is the primary key so re-importing the same file twice
is a no-op. If the export carries no transaction id, a stable key hashed from
timestamp + address + amount is re-import-safe, at the cost of collapsing two
identical donations in the same second.

Deferred on 2026-08-14 for the reason it should be: **there is no real export to
write the parser against**, and guessing at a third party's column names is how
you get a parser that passes its own tests and fails on the first real file.
`bin/` rather than a route, because an admin endpoint would be a new kind of
privileged surface in a server that has none, for a job done a few times a year.

# bin/db reads a JSON column two ways

Settles the backlog item *bin/db cannot show a JSON column*, which had been
carried since 2026-08-09 and re-read as still holding on 2026-09-15 — by eye,
which is how its premise outlived the thing that made it true.

**The premise was false, and is worth naming so nobody re-derives it.** The
item said `-column` mode "truncates them to the terminal width, so the values
that matter most are the ones you cannot read". SQLite sized columns off the
first row and truncated the rest until 3.33; since then it auto-widens. Local
is 3.43.2 and the box is 3.45.1, so neither end has truncated for the life of
this project. A 603-character `recordings.stems` comes back over `bin/db`
entire, on a 626-character line. Nothing was ever lost. The `instr()` and
`json_extract` workarounds the item complained of were never forced by an
inability to see the value.

What is true is the half the item did not say: the values are *illegible*, and
there are about a dozen of them rather than the two it named —
`recordings.participants`, `.display_names`, `.stems`, `.floor_timeline`,
`.segment_keys`, `channels.participants`, `channels.state`,
`kofi_donations.raw`, and the pair at `server/src/db.ts:961-973`. The worst of
them is `channels.state`, the durable projection of the live `ChannelState`:
simultaneously the widest column in the database and the only window onto what
a channel was actually doing, since `bin/db`'s own header notes that a live
channel has no row anywhere.

## Two flags, because they answer different questions

**`--line`** is for a wide row: one column per line, raw value, no escaping, no
dependency. It is what you want when you are eyeballing a record.

**`--json`** is for a nested one, and alone it would have been half a fix.
SQLite emits the column as an escaped *string*, so `stems` arrives as
`"{\"media\":[...]}"` — no more readable than the ribbon it replaced. So
`--json` pipes a one-shot query through jq and decodes any value that is itself
JSON. `channels.state` comes back as structure.

The filter is `map(map_values((tostring | fromjson?) // .))`. **Not
`try fromjson catch .`**, which binds jq's *error text* into the value — the
first working version returned an account id as `"Invalid numeric literal at
EOF at line 1, column 16"`. `tostring` first, so nulls and numbers reach
`fromjson` as strings rather than throwing. A column holding the literal string
`"123"` therefore decodes to a number; accepted, and noted in the script.

**jq is not a dependency of this repo and did not become one.** Without it
`--json` still emits correct, escaped JSON. Decoding is also skipped for an
interactive session, which is a live stream with nothing to post-process — and
interactively you could always type `.mode json` at the prompt anyway, which is
why the gap this closes is really the one-shot path.

`json_pretty()` would have moved the work to SQLite and been the obvious
alternative. It arrived in 3.46 and **neither end has it**; both were checked.

## The remote one-shot had lost its busy timeout

Found while unifying the flags, and the more consequential half of the change.
Three of the four `sqlite3` invocations carried `-cmd '.timeout 2000'`. The
fourth — `bin/db "query"` against production, the most-used path of the four —
did not, because the two remote paths interpolate into a command string for the
far shell rather than exec'ing directly, and so had been spelled by hand. The
timeout was dropped in the copy. `pragma busy_timeout` over the old script
returned `0` and over the new one returns `2000`. The path most likely to meet
a live writer was the one that failed instead of waiting.

Both forms now derive from one array, `printf ' %q'` flattening it for the far
shell. That is the actual guard: a second spelling is what drifted.

## An unknown flag was silently swallowed as SQL

The `*) sql="$arg"` catch-all meant `bin/db --json "select 1"` ran the select,
ignored the flag and exited 0 — a flag that did nothing was indistinguishable
from a flag that worked, which is a poor thing to have underneath a change that
adds two flags. Flag-shaped arguments now exit 2. The cost is that SQL may no
longer *begin* with a `--` comment; put it on the second line.

# bin/db cannot show a JSON column

`recordings.stems` and `floor_timeline` are JSON, and `-column` mode truncates
them to the terminal width, so the values that matter most are the ones you
cannot read. Working around it means `instr()` or `json_extract` in every query
when you wanted to look at the value. A `--json` flag, or `.mode line` for wide
results, would fix it. Noted 2026-08-09 while checking whether a media stem
reached a recording.

Re-read against the tree on 2026-09-15 and still holds. `bin/db`.

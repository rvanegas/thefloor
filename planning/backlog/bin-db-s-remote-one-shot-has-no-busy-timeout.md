# bin/db's remote one-shot has no busy timeout

The interactive and local paths set `.timeout 2000`; the one that runs a single
query over SSH does not, so it fails immediately against a locked database
instead of waiting the way the others do.

Re-read against the tree on 2026-09-15 and still holds. `bin/db`.

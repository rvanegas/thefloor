# The version names its own release notes — 2026-09-20

`bin/submit-ios --whats-new FILE` is gone. The path is derived from
`expo.version` instead — `planning/submissions/whats-new-<version>.txt` —
which is how `bin/set-review-notes` has always found the notes beside it.

**The flag was an argument on the one run that matters.** What it sent was
whatever path was typed, and Apple takes it either way: the previous release's
text is one stale shell-history line away, the field would be filled, every
check in the script would pass, and nothing on screen would say which file it
had read. The two texts a submission sends now come from the same place by the
same rule, so a version bump moves both and neither can be handed the other
release's.

## What the file's absence means, which is not an error

A missing `whats-new-<version>.txt` is reported — `no
planning/submissions/whats-new-1.6.0.txt` — and is not fatal, because writing
the field in App Store Connect is still a way to have one. The error that
already existed is the one that matters and is unchanged in force: *What's New
is empty for `<locale>`* fires when nothing anywhere has it, which is the
failure this section of the script exists for. Its last line names the file to
write rather than the flag to pass.

**An empty file is fatal**, and that is new. It is somebody having meant to
write the text, and the old shape could not tell that apart from not having
passed the flag.

The cap check moves with it: the message names the file and its length rather
than the flag's, and points at RELEASING.md § *Writing "What's New"*, since
running into 4,000 characters is a cutting problem rather than a command-line
one.

RELEASING.md step 5 and LISTING.md § *What's New* named the flag and were
edited in the same commit. `--help` prints the usage block by line range, so
the slice moved from ten lines to nine with the line it prints.

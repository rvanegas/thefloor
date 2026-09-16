# Timers derive from wall clock

Every rule uses a caller-supplied `now`. The server is now the authority, which
removed the device-drift problem, but a clock change on the server would still
skew live countdowns. A monotonic source would be sounder.

Re-read against the tree on 2026-09-15 and still holds.

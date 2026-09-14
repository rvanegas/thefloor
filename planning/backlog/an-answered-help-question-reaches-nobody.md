# An answered help question reaches nobody

Shipped 2026-09-10 with the Help screen, deliberately — see
decisions/2026-09-10-help-is-a-question-box.md. Writing an answer with
`bin/help` changes a row and reaches no phone, so **the only way somebody
learns you replied is by opening the screen again.**

That is acceptable while this is rare and while the same person who answers is
watching how rare it is. It stops being acceptable the moment a question sits
long enough that the asker has given up looking, and there is nothing on either
side that would say so: nothing records whether an answer was ever seen.

What it would take is more than a push. A support reply that wakes a phone at
midnight and cannot be turned off is worse than no notification at all, so it
needs a notification level of its own — the machinery in
`channel_notification_levels` is per channel and does not fit — and a preference
somebody can find before the first one arrives rather than after. That is why it
is not in the first version.

The cheap half, if the full version stays unbuilt: `bin/help --all` shows how
long each answered question waited, and a question older than a few days is one
to answer by email instead, where arrival is not in doubt.

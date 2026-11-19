# Alert.alert is not for ordinary UI

Said at the prompt, 2026-11-18: **`Alert.alert` should never be used for
ordinary UI.** It is the system's dialog: it draws nothing of STYLE.md, holds
no control but buttons — so no checkbox, which is how this came up, in
`2026-11-18-one-delete-for-a-segment-with-what-goes-checked.md` — and reads as the
operating system interrupting rather than the app asking.

STYLE.md says so as of 2026-11-18. **The modal exists**: `ConfirmModal` in
`components.tsx`, built for *Delete* on a segment the same day — title, body,
optional boxes and sentences, a cancel and a confirm with its `danger` tone.
What is left is the 44 calls in 10 files outside the tests
(`grep -rn "Alert.alert" app/src`): move them to it, confirmations first, an
alert that asks for text — none yet — needing a field it does not have. Decide,
and write into STYLE.md, what if anything still may use the system alert: an
error with nothing to choose may be the one case.

# Alert.alert is not for ordinary UI

Said at the prompt, 2026-11-18: **`Alert.alert` should never be used for
ordinary UI.** It is the system's dialog: it draws nothing of STYLE.md, holds
no control but buttons — so no checkbox, which is how this came up, in
`one-delete-for-a-segment-with-what-goes-checked.md` — and reads as the
operating system interrupting rather than the app asking.

STYLE.md says so as of 2026-11-18. The app has 53 calls in 12 files today
(`grep -rn "Alert.alert" app/src`). Build the modal once, in `components.tsx`
— title, body, an optional set of controls, a cancel and a confirm with its
`destructive` tone — and move the calls to it, confirmations first. Decide,
and write into STYLE.md, what if anything still may use the system alert: an
error with nothing to choose may be the one case.

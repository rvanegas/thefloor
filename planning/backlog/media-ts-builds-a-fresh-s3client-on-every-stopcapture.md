# media.ts builds a fresh S3Client on every stopCapture

The playback stem is stored with a client constructed per call, from the same
credentials `RecordingStore.put` now holds a long-lived client for. One write
path would do, and the store is the one that should own it — the credentials
bundle has to stay in `media.ts` regardless, because LiveKit is *given* the key
with each egress request and cannot be handed a store.

Noted 2026-08-16. Re-read against the tree on 2026-09-15 and still holds.
`server/src/media.ts`.

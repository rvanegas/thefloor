# useSessionAudio takes three bare booleans in a row

From planning/AUDIO-PRESENCE-REVIEW.md, 2026-09-07; the one hazard in it that
the 2026-09-08 redesign did not dissolve. Re-checked 2026-10-03:
`useSessionAudio` (`app/src/audio/useSessionAudio.ts`, around :791) still ends
`recoverPlayout = false, deferSubscribe = false, holdForPlayout = false`, and
the audio tests still call it with `false, true, true`.

`useSessionAudio` ends with **three consecutive optional booleans** — four
until 2026-09-08, when `handBack` left with the watch-party clause:

```ts
recoverPlayout = false,
deferSubscribe = false,
holdForPlayout = false
```

`App.tsx` passes them bare — `false, true, true`. **A transposition would be
completely silent**, and all three change audio behaviour in ways that took
builds to diagnose the first time. One fewer is not a fix.

Worse, the JSDoc is not a reliable guide to the order: it documents them as
`holdForPlayout, deferSubscribe, recoverPlayout`, the reverse of the signature.

Two of its `@param` names do not exist at all — it says `@param micNeeded` and
`@param selfMuted` where the parameters are `micNeededAsked` and
`selfMutedAsked`. `hasAudioAsked` is documented correctly, which is what makes
the other two read as deliberate rather than as drift.

**An options object for the trailing flags would end the whole class.**

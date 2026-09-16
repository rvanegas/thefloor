# The chime has one loudness again

2026-09-15, the same day the ladder was built. *How loud the channel chimes
are* is gone from Floor Settings, from the wire, from the `accounts` table and
from every argument between the settings screen and the sound. The app plays at
**1**, the top rung of the five that were offered — `CHIME_AMPLITUDE` in
`app/modules/audio-route/index.ts` and `chimeAmplitude` in
`AudioRouteModule.swift`, kept equal.

**The lab had already said why.** *How loud the chime is belongs to the
listener* records the sweep and its own caveat in the same breath: the file's
loudness spans a real 15dB across those five peaks, and a phone heard all five
as much the same. That is a finding about `AudioServicesPlaySystemSound` and
the alert level, not about the samples — and a control whose rungs an ear
cannot reliably tell apart is five synonyms with a settings card around them.
The card admitted as much in its own muted copy, which is where this should
have been decided rather than shipped.

**What the ladder was actually for was one number, and it found it.** The
complaint was *too quiet to notice* at 0.18. A setting is the right shape for a
question only its owner can answer; this one had an answer.

**And the answer is the top of the ladder rather than the middle of it.** It
was 0.5 for the first hour of this change, on the reasoning that the middle is
where a withdrawn choice should land. That is the wrong reasoning here: the
whole finding is that the rungs are hard to tell apart through a phone's alert
path, so headroom left in the file buys nothing an ear will ever collect, while
the one complaint on record is that the cue is too quiet. There is no argument
for stopping short of full scale.

**1 is also the ceiling, not a number near it.** `clampAmplitude` in the Swift
pins every request into `[0.01, 1]` — full scale for a sine, above which a peak
clips into a buzz rather than getting louder — and `chimeKey` is computed from
the *clamped* value, so 1.5 would be the same rendered sound under a different
name: no louder, no distinct cache entry, and no complaint. **If this is still
too quiet on a phone, the lever is not the peak.** It is `ChimePath` — the
`player` comparison already built into the module and the lab, `AVAudioPlayer`
at full gain on the media path, which is not subject to the alert level — or
the waveform, a sine being the quietest thing that fits in a given envelope.
Both are decisions about what a presence cue may interrupt, and both are
settled by ear in the lab. `chimeAmplitude.test.ts` pins the constant at or
below the clamp so that reaching past it fails rather than passing silently.

Note that the web twin has no such clamp: `chime.web.ts` spends the number as a
real `GainNode` value, so a peak above 1 would distort in a browser rather than
being pinned.

**Removed rather than hidden.** The column is dropped at boot on `tabs_at_foot`'s
reasoning — a peak stored there is a preference the application no longer has a
word for, and nothing can read it back. `POST /me/settings` ignores
`chimeAmplitude` rather than refusing it, which is the same two-step: build 211
and earlier still send a peak when somebody taps a rung, and a 400 would be an
error on a screen where nothing went wrong. Those builds keep playing at the
peak they last cached locally until they update — the honest degradation, and
no shim was written for it. The cache key `thefloor.chimeAmplitude` survives as
`DEAD_CHIME_AMPLITUDE_KEY` in AppProvider.tsx, read by nothing and cleared by
the two paths that empty an install.

**The argument stayed even though the setting went.** `chime` and
`prepareChime` still take a peak, `playFirstAccepted` still negotiates its
argument count down, and the audio lab still sweeps the five: that machinery is
what makes any other loudness audible on a phone, and it is the thing to reach
for the next time this question is asked. What was removed above it is the
plumbing that carried a *chosen* peak — `usePresenceChime` takes no amplitude,
`App` passes none, and `warmChimes` and `chime` agree by default, which is what
the native renderer's per-peak cache needs.

**The Swift constant is now checked from jest.** `chimeAmplitude.test.ts` used
to assert that two of three copies matched and note that the third was out of
reach; with core's copy gone there were two left and only one reachable, so the
test reads `AudioRouteModule.swift` as text and matches the number out of it —
`storageKeys.test.ts`'s trick, and the same `declare const require` for a
package whose tsconfig has no Node typings.

The *Sounds* section went with the control rather than staying as a card with
nothing on it: it arrived with the ladder and Floor Settings is settings, not
documentation. What a chime is, that you never hear your own, and that it is in
no recording are in GLOSSARY.md § *Chime*.

See `decisions/2026-09-15-how-loud-the-chime-is-belongs-to-the-listener.md` for
the setting this removes, `decisions/2026-09-15-a-loudness-you-can-hear-before-you-keep-it.md`
for the tap that demonstrated a rung, and
`decisions/2026-09-15-the-chime-is-too-quiet-to-notice.md` for the complaint
that started it.

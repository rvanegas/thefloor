# The output picker is on probation

`HomeSettingsView` raises iOS's own route picker — an `AVRoutePickerView`
via `AudioSession.showAudioRoutePicker`, not a control of ours, because nothing
in this stack tells JavaScript what outputs exist.

It is there to make a wrong route recoverable by whoever is hearing it rather
than by a release, and **it is expected to be removed.** The default should be
right on its own: `defaultToSpeaker` gives the loudspeaker rather than the
earpiece and yields to anything connected. If nobody reaches for the picker
after a few weeks of real use, that is the evidence that the default works and
this should come out — decided by the author on the day it was added, so that
the removal is a plan rather than a regret.

What would argue for keeping it: people using it to move audio somewhere iOS
would not have chosen — a Bluetooth speaker across a room, a car, an AirPlay
receiver. That is a want the default cannot infer.

**It cannot do the job the first paragraph gives it, established 2026-09-03.**
`AVRoutePickerView` lists *destinations* — AirPlay devices and Bluetooth
devices — and the built-in receiver and the built-in speaker are not separate
entries in it. So somebody hearing the earpiece can send the audio to their
computer or to a speaker across the room and still have no way at all to move
it to the loudspeaker on the phone in their hand. Reported by a user in exactly
that position: "I could send audio to my computer and other devices, but I
could not select between earpiece and speaker."

That splits this entry in two, and the halves point opposite ways. As a way to
reach *another device* the picker works and the paragraph above still stands.
As **recovery for a wrong route on this device** — which is the reason it was
added and the reason it is on probation rather than deleted — it has never been
able to help, and the probation was therefore measuring something the control
could not have passed. Recovery from the earpiece is now automatic instead:
`src/audio/routeRecovery.ts` restates the configuration when iOS drops the
output to the receiver, which is what that job actually required.

**The probation has no instrument, established 2026-09-17.** Its test is "if
nobody reaches for the picker after a few weeks of real use" — and nothing
counts the presses. `onPress` raises the sheet and does nothing else. The
pipeline that looks like the answer is not one: `recordEvent` drains to
`POST /diagnostics`, which refuses any account without the `debug` column and
writes to the journal rather than a table, so it would measure the author and
rotate the evidence away inside a day. Measuring ordinary use means the meter's
shape instead — a table nothing in the server reads, swept at
`USAGE_RETENTION_MS`, cleared by `deleteAccount`, read by a script in `bin/`,
as `pings` is. Two traps come with it: the thirty-day window happens to match
"a few weeks", and **the clock restarts at whatever build ships the counter** —
every install below it reports zero presses for the same reason old builds are
`silentBuilds`, so silence is not evidence until the population has moved.

So the entry's two halves now stand like this. The **recovery** half is closed:
it was never possible and is `routeRecovery.ts`'s job now, automatically. The
**another-device** half is open and unmeasured, and it is the only question a
counter would answer — not "is the default right", which recovery took, but
"does anybody want the audio somewhere else". Whether to pay for that counter,
keep the control unmeasured, or remove it on the argument that Control Centre
already offers the same sheet, is undecided and is the author's call.

The code no longer argues the retired half: `routePicker.ts`, the comment on
the card, and STATES.md § *Audio Output Selection* were reconciled
on 2026-09-17, and the button's sublabel stopped promising a choice between the
earpiece and the speaker that the sheet has never offered.

**It moved to Floor Settings on 2026-09-17**, having been on Channel Settings
since it was added. Nothing about it is per channel — the sheet is the same
sheet and the route it sets outlives the channel it was set from — so the test
that puts the name and the recording setting there does not reach it. Nothing
above changes: what is on probation is the control, not where it is drawn, and
a control that is now findable without being in a channel is if anything easier
to measure than one that was not.

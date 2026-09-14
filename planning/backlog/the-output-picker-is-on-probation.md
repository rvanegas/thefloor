# The output picker is on probation

`ChannelSettingsView` raises iOS's own route picker — an `AVRoutePickerView`
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

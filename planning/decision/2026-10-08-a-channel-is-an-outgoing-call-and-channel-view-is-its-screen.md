# A channel is an outgoing call, and Channel View is its screen

2026-10-08. The result of Phase 0 of `task/integrate-with-callkit.md`, run on
one iPhone (build 338, branch `spike/callkit`) against the web app. Everything
below that was measured is read from `bin/diagnostics` for that morning. **What
is heard was not tested**, since both ends were in one room; that waits for a
second tester at a distance, along with Hold & Accept.

## What was decided

**Every step-in is an outgoing call, whoever arrives first.** CallKit has
calls you place and calls you receive, and stepping in is always the person's
own act. Making a later arrival an *incoming* call would ring them, which is
the one thing this app refuses (PROPOSITION.md).

**There is no system call screen, and none is wanted: Channel View is the
replacement.** iOS gives a call that an app places no in-call screen of its
own. Tapping the green pill or the banner opens the app, through the
passcode on a locked phone. Rodrigo's answer was that Channel View is the
call screen.

**So CallKit does not deliver a mute without a passcode.** Every lock-screen
mute in the run was the Live Activity card's (`lock tap`). It asked for the
passcode exactly as `2026-10-01-a-lock-screen-button-asks-whatever-is-declared.md`
found, and CallKit heard of it only afterwards from the app. That was the
premise of `task/mute-a-locked-phone-through-callkit.md`, and it does not
hold. CallKit stays wanted for Recents and for meeting other calls.

## What was measured

- **`voip` is required.** Without it in `UIBackgroundModes`, every transaction
  was refused as *unentitled* (`com.apple.CallKit.error.requesttransaction
  error 1`), for an outgoing call too. The plan had said the opposite.
- **The session is shared without conflict, as things stand** (setup A). The
  app's `startAudioSession` activated first (`rtcActive=true` at 11:36:11.639),
  and CallKit's `didActivate` followed 190ms later, on the same `CALL`
  configuration: `playAndRecord`, `videoChat`, speaker, built-in microphone.
  The engine started and the far end was subscribed. Setups B and C were not
  needed.
- **No earpiece.** CallKit left the output on the loudspeaker, so
  `speakerOnActivate` is not needed.
- **Recents: one entry per step-in, written when the call ends.**
- **The green pill** shows the call, in the app as well as out of it.
- **Step-out releases the session to other apps.** The app's own
  `releaseSession` fails while the call owns the session (`-12988`, *Session
  deactivation failed*). That is harmless: CallKit's `didDeactivate` follows
  within a second, every time. Music and YouTube did not *resume* on their
  own, which they did without CallKit. Rodrigo's requirement is only that
  other apps can take their audio back, which they can, and the automatic
  resume is not required. `notifyOnDeactivate` on the spike branch is the fix
  if it is ever wanted.
- **The spike mirrors every app mute to CallKit twice**, and the second one
  comes back as if a system button had been tapped. That is harmless at equal
  values, and Phase 2 matches the actions properly.

## Still to measure

With a second tester at a distance: both directions heard, no echo, and Hold
& Accept, with the session coming back afterwards. Bluetooth, the film and a
guest's `LISTENING` under a call are in `app/modules/call-kit/SPIKE.md` on the
spike branch.

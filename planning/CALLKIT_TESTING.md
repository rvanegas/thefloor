# CallKit testing

What remains of Phase 3 of `task/integrate-with-callkit.md` — another call
arriving while a channel is a *reported call* — as of 2026-10-20. Phase 3 is
built and on master since `c02b7872` (2026-10-12), and **none of it has run on
a phone**: no `reported call held` line has reached `bin/diagnostics` since
the device test that prompted it.

**Test on build 381 or later.** Phase 3 has been in every build since 356, but
two later changes sit on the same path and are tested by the same calls:

- **Build 359** (`935fff08`): the module ends the interruption iOS starts 480
  seconds into a film and never ends. It does nothing while the call is held.
- **Build 380** (`569806a8`): LiveKit 3.0. The module now forwards
  `didActivate`/`didDeactivate` to `LKRTCAudioSession`, the prefixed WebRTC.
  If that forwarding went to the wrong session, a held call would never get
  its audio back, silently. Checked only by a Debug build that links one
  WebRTC; never on a phone.

**The server is done.** The deployed commit includes `ON_ANOTHER_CALL`
(`bin/health`), so the roster can say *On another call* as soon as a build
sends it.

## 1. On a phone

Two phones in a channel, and a third line to call one of them. Keep Bluetooth
off unless the check is about Bluetooth: a headset that connects mid-run takes
the audio. `bin/diagnostics --grep 'reported call|playout|engine'` reads each
run back.

- [ ] **Hold & Accept**: the other phone's People card says *On another call*
      (*En otra llamada* in Spanish), not *Present*. Log: `reported call held true`.
- [ ] **The other call hung up, The Floor not opened**: the voice comes back by
      itself, both ways. Log: `resuming, no other call is up`, then `held
      false` and `activated`. This relies on iOS letting a backgrounded app take
      its own call off hold, which has not been confirmed. A `resume refused`
      line means it does not.
- [ ] **Resumed from iOS's own call list** instead of waiting for the other
      call to end: the voice comes back the same way.
- [ ] **Hold & Accept while holding the floor**: the floor is released, and
      coming back does not return it.
- [ ] **End & Accept**: steps out, and the channel goes on without this phone.
      Built in Phase 1, never exercised.
- [ ] **No `playout frozen`** after any resume. That line is what the 2026-10-12
      failure looked like.

## 2. Decisions for Rodrigo

- [ ] **The floor on hold.** Going on hold releases a held floor, as a dropped
      connection does, and coming back does not return it. That was the
      implementing session's choice, not his. Related gap: nothing refuses a
      claim from somebody on another call. In practice they are in the Phone
      app and cannot make one.
- [ ] **A held call during a watch party.** Does it pause the film on that
      phone, or only take the phone out of the room?
      `task/phone-calls-during-watch.md` asks; nothing is built. The 2026-10-12
      hold during a film (10:53) is not covered by the resume work, because the
      film had already stopped the voice engine. Test a hold during a film as
      well, past eight minutes, once a behaviour is chosen.

## 3. After the phone tests

- [ ] **`backlog/websocket-lost.md`**: the plan expected resuming from hold to
      bring the audio back without a reconnect, which may close this entry.
      Re-read it once the second check above passes.
- [ ] Record what the run found in a dated decision. Then update the Phase 3
      paragraph in `task/integrate-with-callkit.md`, and delete this file.

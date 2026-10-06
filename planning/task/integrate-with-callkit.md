# Integrate With CallKit

Integrate the app with CallKit. Two existing tasks would each be delivered by
part of this, and they say to decide CallKit together:
`mute-a-locked-phone-through-callkit.md`, which wants a lock screen mute that
needs no passcode, and `phone-calls-during-watch.md`, which wants other calls
to get a busy signal. Doing it means rewriting the "there is no CallKit in it
at all" position in `apply-the-app-store-listing.md` and `post-to-the-launch-surfaces.md`. Read STATES.md and
POSTMORTEM-echo.md first, because CallKit takes over activating the audio
session.

On the call with Erta, 2026-10-02, Rodrigo said he wants this: being on The
Floor should count as a phone call to the phone, so that **incoming calls see
you as busy** and **the call shows up in Recents**.

## The plan

Written 2026-10-06. Nothing below is built. It is ordered so that the part
that can fail — whether CallKit and LiveKit's session observer can share one
`AVAudioSession` — is measured on a device before anything is designed on top
of it.

### First, what CallKit will and will not give

- **Recents: yes.** `CXProviderConfiguration.includesCallsInRecents` is on by
  default. Each step-in becomes one entry, named by the call's
  `localizedCallerName`, and the entry syncs to the account's other Apple
  devices through iCloud call history.
- **A mute that needs no passcode on a locked phone: yes,** probably. The
  system call screen's mute arrives as a `CXSetMutedCallAction`, which iOS runs
  itself. That is the evidence `mute-a-locked-phone-through-callkit.md` asked
  for. It is unmeasured until the spike, below.
- **Busy: not as worded, and this needs deciding before the work.** iOS has no
  setting that makes a CallKit call turn other calls away. A cellular or
  FaceTime call that arrives during one gets *call waiting* — Hold & Accept /
  End & Accept / Decline — and the caller hears it ringing. They hear busy
  only where the carrier's call waiting is off. What CallKit really changes is
  smaller and still worth having: the incoming call becomes a choice offered
  over the channel, and the app is told which choice was made (see Phase 3).
  Today it takes the audio session silently, which is the Telegram case in
  `useSessionAudio.ts` and `backlog/websocket-lost.md`. Settle this on a device
  in the spike. If Rodrigo meant a real busy signal, that is a
  carrier setting and no app can provide it.
- **Side effects that come along with it.** The green call pill or Dynamic
  Island. CarPlay and Apple Watch both show the call by name. Bluetooth hands-free
  routing is handled the way a phone call's is.

### Decisions to make before the build, none of them technical

1. **What "busy" means, above.**
2. **What the call is named.** Recents, CarPlay and the Watch show
   `localizedCallerName`, and iCloud copies it to every device. This is the
   disclosure question already left open in `modules/call-service/index.ts`
   and `decision/2026-09-17-the-lock-screen-carries-two-controls.md` § *What
   was left open*. It now has a third surface and a persistent record. Either
   the channel's name everywhere, or a fixed *The Floor* everywhere. Android's
   notification follows whichever is chosen.
3. **Whether the Live Activity card stays.** A locked phone would show two
   surfaces, the card (Out, and Mute that asks for a passcode) and the call
   screen (Mute and End, which do not ask). The recommendation is to keep the card,
   since it holds the floor state CallKit has no words for, and to say in
   STYLE.md which surface each control belongs to.
4. **China.** App Review rejects apps that use CallKit in the China storefront.
   Either remove China from availability or turn CallKit off by region at
   runtime. Check RELEASING.md's territory notes and what is sold there now.
5. **The listing's sentences.** Only `post-to-the-launch-surfaces.md` still
   says CallKit by name (*"There's no CallKit and no VoIP push in it at all"*,
   twice). `apply-the-app-store-listing.md` no longer does, and no submission
   in `planning/submissions/` mentions it. The truthful rewrite is *no VoIP
   push and no ringing*: what made the claim worth making is still true. The
   next review notes should say plainly that CallKit reports a channel the
   person entered as an outgoing call, and never rings.

### Phase 0 — a spike on two phones, thrown away afterwards

A local module, `app/modules/call-kit` (iOS only, a no-op elsewhere, loaded
lazily as `call-service` is). It holds one `CXProvider` and one
`CXCallController`. A `CXStartCallAction` is sent when `mediaRoom` appears and
a `CXEndCallAction` when it goes. Nothing else changes. What it has to answer:

- **Who activates the session.** Today `AudioDeviceModuleObserver.m` calls
  `setActive:YES` itself whenever the session is inactive at an engine
  transition, and `useSessionAudio` calls `AudioSession.startAudioSession()`
  before `room.connect`. CallKit wants to activate the session itself and to
  report it in `provider(_:didActivate:)`. The observer already has a code
  path for *"an external deactivation (e.g. CallKit)"*. What is unknown is
  whether its own activation, made before CallKit's, still works for an
  outgoing call or leaves the call without audio. `RTCAudioSession`
  in the pinned WebRTC build has `useManualAudio`, `isAudioEnabled` and
  `audioSessionDidActivate:`, and `WebRTCModule+RTCAudioSession.m` exports the
  last two to JS. Whether `useManualAudio` reaches the `AVAudioEngine`
  device module the observer drives is the open question.
- **Whether `LISTENING` can exist under a call.** A guest with no speech grant
  and the device *watching here* both drop to `playback`/`spokenAudio`. Does
  CallKit tolerate that category change mid-call, and does the film's
  `WKWebView` still take the session and play
  (`decision/2026-09-27-the-film-stops-the-engine.md`)?
- **The echo canceller.** `CALL` must still read back as `videoChat` once
  CallKit has activated it. Check with `modules/audio-route` and
  `diagnostics.ts`. See POSTMORTEM-echo.md. Bluetooth headset and speaker
  routes must still behave as the table in STATES.md § *Audio Session
  Configuration* says.
- **The locked mute**, phone flat on a table and Face ID out of it, which is
  the method from `2026-10-01-a-lock-screen-button-asks-whatever-is-declared.md`.
- **Busy versus call waiting**, by calling the phone from a second line.
- **Whether a backgrounded app may open a new microphone** while a call is
  active. If it may, the deferred-promotion row in STATES.md can go.
- **Deactivation.** Does CallKit's own teardown give a paused podcast its audio
  back, or is `releaseSession`'s `notifyOthersOnDeactivation` still needed, or
  does calling it now fail?

The result is a dated decision, whichever way it goes. If the observer and
CallKit cannot share the session, the plan stops here.

### Phase 1 — the call is the step-in

- **One call per `mediaRoom`, not per connection.** The connection effect in
  `useSessionAudio.ts` re-runs on `generation`, and a reconnect must not end
  the call and start another — that would put a Recents entry in for every
  network blip. The call belongs in its own effect keyed on `[mediaRoom]`,
  the way `startCallService` already is. That makes it the iOS twin of
  Android's foreground service: the platforms' two reasons to hold a call-like
  thing, with one lifetime.
- **Native ownership of activation.** `didActivate` and `didDeactivate` are
  handled in Swift and forwarded to `RTCAudioSession` natively, with no
  JavaScript in the path, for the same reason the policy observer is native.
  JS waits for an `onActivated` event before `room.connect`. That replaces
  `startAudioSession` under CallKit, or follows it, whichever Phase 0 shows
  works. A reconnect's teardown must stop releasing the session while the
  call is still live. `releaseSession` moves to the call's end.
- **Every exit ends the call with a reason.** Step Out, going nearby, Rule B,
  and being displaced by another device all take `mediaRoom` away, so the one
  effect covers them. `reportCall(with:endedAt:reason:)` gets `.remoteEnded`
  for the ones the person did not do, so Recents does not record them as
  hang-ups.
- **End from the system screen is Step Out**: `CXEndCallAction` goes to the same
  path as the card's `onStepOut`.
- **The call's handle** is `.generic`, carrying the channel id. Tapping it in
  Recents opens the app through `INStartCallIntent` / `NSUserActivity` via an
  `ExpoAppDelegateSubscriber`. The recommendation is that this *opens* the
  channel and does not step in: a Recents tap is not consent to a microphone.

### Phase 2 — mute, both ways

`CXSetMutedCallAction` maps to **Self-Mute and nothing else**. It does not map
to Muted-by-Claim or Party-Muted (STATES.md). A self-mute made in the app or
on the card is sent back as a `CXSetMutedCallAction` transaction, so that the
system button never disagrees with the app. Inbound and outbound actions have
to be told apart, or the app's own update comes back to it as a toggle. Do
not put a mute on the audio session: STATES.md says why self-mute is not an
input to it.

### Phase 3 — another call arrives

This is what `phone-calls-during-watch.md` asks for, and it needs a word for
a new state:

- **Hold & Accept** sends `CXSetHeldCallAction(onHold: true)`, and CallKit
  deactivates the session. The phone stays stepped in, with the microphone
  shut and nothing heard. The roster should say so. That means a field the
  server carries, so `core/` and GLOSSARY.md need a word for it — *on another
  call*, perhaps — and it has to work in Spanish.
  Whether being on hold pauses a watch party on this device, or only takes it
  out of the room, is that task's question.
- **Resuming** sends `onHold: false` and then `didActivate`. The session comes back
  without the reconnect `backlog/websocket-lost.md` is waiting on, so this may
  close that entry too.
- **End & Accept** is Step Out.

### Phase 4 — the documents, in the same commits

STATES.md: CallKit becomes a fourth writer, or rather the one that activates
the session; add it to § *Where the sources disagree*. Add any new state to
GLOSSARY.md's one-line list, and add the second lock-screen surface to
STYLE.md. In RELEASING.md, `UIBackgroundModes` stays `["audio"]`: an outgoing
call needs no `voip`, and its line about *"adopted for call-like ringing"*
should say that. Rewrite the quotes in post-to-the-launch-surfaces.md. Retire
`mute-a-locked-phone-through-callkit.md` into the Phase 0 decision. Android's
counterpart is a self-managed `ConnectionService`, and that belongs in
`bring-android-level-with-ios.md` rather than here.

**It is the wire that sets the order.** Phases 0–2 are client-only and can ship
in one build. Phase 3's new state is a wire change, so it follows AGENTS.md's
rule: the server learns it first, and a shim goes in SHIMS.md.

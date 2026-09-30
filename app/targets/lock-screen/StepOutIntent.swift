import AppIntents

#if !LOCKSCREEN_WIDGET_EXTENSION
  import LiveActivity
#endif

/**
 The Out button on the lock screen.

 **The Mute button's arrangement, a second time**, and `ToggleMuteIntent.swift`
 carries the reasoning: a `LiveActivityIntent` is performed in the app's own
 process, where the room and the socket are, and it has two target memberships
 with the body compiled out of the extension's copy by
 `LOCKSCREEN_WIDGET_EXTENSION`.

 **What is new is that this one waits for an answer.** A mute leaves the app
 holding the audio session; a step-out gives it up, and an app that has given
 up its audio session is one iOS suspends at the next opportunity — possibly
 before the snapshot that would have taken the card down has arrived. So the
 intent asks JavaScript to act, is told whether the action reached the socket,
 and ends the card itself when it did. That is safe because `STEP_OUT` is never
 refused: a departure that has reached the server is a departure.

 **When it did not reach the socket, the card stays up**, and that is the
 correct answer rather than a failure to give one. A queued step-out is sent on
 reconnect, but until then this device is still in the media room and can
 still be heard — a card that vanished on the tap would be telling somebody
 audible that they had left. It comes down the ordinary way, with the snapshot
 that follows the reconnect.

 **No passcode, stated rather than relied on.** `authenticationPolicy` is iOS
 26, and `.alwaysAllowed` is already what `ToggleMuteIntent`'s built metadata
 records without saying so — yet the Mute button has been seen asking for the
 passcode, which `tasks/unmute-without-unlock.md` is chasing. So this line is
 the intent written down, not the fix: whatever makes Mute ask may make this
 ask too. The worst anybody holding somebody else's phone can do with this is
 take them out of a conversation the card already names. Decided 2026-09-29;
 see `planning/decisions/2026-09-29-the-lock-screen-carries-a-way-out.md`.
 */
@available(iOS 17.0, *)
struct StepOutIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Step out"

  /** Restated for `ToggleMuteIntent`'s reason: not opening is the point. */
  static var openAppWhenRun: Bool = false

  @available(iOS 26.0, *)
  static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

  init() {}

  func perform() async throws -> some IntentResult {
    #if !LOCKSCREEN_WIDGET_EXTENSION
      if await LiveActivityModule.requestStepOut() {
        _ = LiveActivityModule.host?.hide()
      }
    #endif
    return .result()
  }
}

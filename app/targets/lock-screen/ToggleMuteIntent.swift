import AppIntents

#if !LOCKSCREEN_WIDGET_EXTENSION
  import LiveActivity
#endif

/**
 The Mute button on the lock screen.

 **A `LiveActivityIntent` is performed in the app's own process**, and that one
 sentence is why this feature is possible at all. iOS resumes a suspended app
 to run it, so the tap lands where the LiveKit room and the socket already are
 — rather than in the widget extension, which has neither and could only leave
 a note. Everything else about the design follows from it.

 It also means nothing here has to handle a cold launch. The app is alive
 whenever this card is up, because it is holding the audio session, and holding
 the audio session is what being in a channel *is*.

 **Two target memberships, like the attributes beside it**, and one of them
 cannot see the app. The extension needs the type — `Button(intent:)` has to
 name it — but must not link the pod, so the body is compiled out there by
 `LOCKSCREEN_WIDGET_EXTENSION`, a flag `plugins/with-live-activity.js` sets on
 that target and nowhere else. `canImport` was the obvious guard and is the
 wrong one: it answers about search paths rather than about linkage, and a leak
 in the former would silently put a call to a missing symbol in the extension.

 The extension's copy never runs. If it ever did, it would do nothing, which is
 the correct nothing.

 **It carries what was asked for, not a toggle.** The button says Mute or
 Unmute, and a card can be a moment stale — a toggle would invert whatever the
 app had meanwhile become, so the tap means the word that was on it.
 */
@available(iOS 17.0, *)
struct ToggleMuteIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Mute"

  /**
   Not shown to anybody.

   `openAppWhenRun` false is the default for a `LiveActivityIntent` and is
   restated here because it is the behaviour being relied on: the whole value
   of the button is that it does *not* take somebody out of their lock screen
   to change one thing. Opening is the card's other control, and it is a tap on
   the card rather than on this.
   */
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Muted")
  var muted: Bool

  init() {}

  init(muted: Bool) {
    self.muted = muted
  }

  func perform() async throws -> some IntentResult {
    #if !LOCKSCREEN_WIDGET_EXTENSION
      LiveActivityModule.emitToggle(muted: muted)
    #endif
    return .result()
  }
}

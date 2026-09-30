import ExpoModulesCore
import os

/**
 What the lock screen card shows, as it crosses from JavaScript.

 A plain record rather than the ActivityKit type, and the split is the point.
 `ActivityAttributes` has to be **the same type in two targets** — this app and
 the widget extension that draws the card — which means it is a source file
 with two target memberships, compiled into each. A pod is a third module, and
 a third copy would be a third type that ActivityKit would not match against
 the other two. So this module never names the attributes at all; it hands
 these fields to whoever registered as the host, and the host is in the
 app target where the shared file is.

 See `targets/lock-screen/FloorActivityAttributes.swift` for the type this
 becomes, and `plugins/with-live-activity.js` for the target memberships.
 */
public struct LockScreenPayload {
  public let channelId: String
  public let channelName: String
  /** Already resolved by the app — see `ContentState.micLabel`. */
  public let micLabel: String
  /** The same, said as a state, for the iOS 16 card. */
  public let micState: String
  public let muted: Bool
  public let canToggle: Bool
  /** What the Out button is called, resolved for `micLabel`'s reason. */
  public let outLabel: String
}

/**
 The app-target half of this module, seen from the pod.

 **The dependency only runs one way.** An app target may import a pod; a pod
 may not import the app. So the ActivityKit code — which must live beside the
 shared attributes type, in the app — registers itself here at launch, and this
 module calls it through a protocol it can see. Nothing in the pod knows what a
 Live Activity is.

 `AnyObject` so the reference can be weak: the controller is owned by the app,
 and a pod holding it strongly would keep it past a teardown for no reason.
 */
public protocol LockScreenHost: AnyObject {
  /// Starts the card, or moves what is already on it. False if iOS refused.
  func show(_ payload: LockScreenPayload) -> Bool
  /// Ends the card. False if there was none, which is not an error.
  func hide() -> Bool
}

/**
 The card on the lock screen, and the three controls on it.

 See `modules/live-activity/index.ts` for why this is a Live Activity rather
 than a notification — in one line, `UNNotificationAction` has no disabled
 state, and the design calls for a greyed-out Unmute rather than one that
 disappears.

 **This module does no ActivityKit work and holds no activity.** It is a wire
 between JavaScript and `LockScreenController` in the app target, for the
 reason `LockScreenPayload` gives. What it does own is the *event* going the
 other way: the Mute and Out buttons are App Intents performed in this
 process, and `emitToggle` and `requestStepOut` are how they reach the
 JavaScript that can act on them.
 */
public class LiveActivityModule: Module {
  /**
   Whoever is drawing the card, set once at launch by the app target.

   Weak, and nil in any build where the controller was not registered — a
   simulator run before the extension exists, a unit test host, or a future
   reader who deletes the AppDelegate line and wonders why the card stopped.
   Every entry point below tolerates nil by answering false, on this module's
   founding rule: none of this may be able to take a channel down.
   */
  public static weak var host: LockScreenHost?

  /**
   The one live instance, so a static intent handler can find its emitter.

   An App Intent is constructed by the system, not by us, so it has no way to
   reach a module instance except through a static. Weak for the same reason
   `host` is: the module's lifetime belongs to Expo.
   */
  private static weak var current: LiveActivityModule?

  /**
   The Mute button, arriving from the app target.

   Called by `ToggleMuteIntent.perform()`, which iOS runs **in this process**
   because the intent is a `LiveActivityIntent` — resuming a suspended app to
   do it. That is the whole reason the button can reach a live room, and it is
   why nothing here has to deal with a background launch: the app is already
   alive holding the audio session, which is what being in a channel *is*.

   Silently does nothing when JavaScript is not listening, which is the window
   between process start and the hook mounting. A tap lost there is a tap on a
   card that should not have been up.
   */
  public static func emitToggle(muted: Bool) {
    // TEMPORARY, for tasks/unmute-without-unlock.md: a nil here is a tap that
    // reached the process and never reached JavaScript.
    Logger(subsystem: "co.rvanegas.thefloor", category: "lock-screen").notice(
      "[lock-screen] emitToggle listening=\(current != nil, privacy: .public)"
    )
    current?.sendEvent("onToggleMute", ["muted": muted])
  }

  /**
   Step-outs asked of JavaScript and not yet answered, by the id each was sent
   with. Touched only on the main queue, which is what makes a plain
   dictionary enough.
   */
  private static var pendingStepOuts: [String: CheckedContinuation<Bool, Never>] = [:]

  /**
   How long the Out button waits to hear whether its action left the phone.

   A socket send is immediate when the socket is open, so the answer ordinarily
   comes back in a frame. The wait exists for the case where nothing answers —
   JavaScript not listening yet — and then the card stays up, which is the
   same answer as *queued*.
   */
  private static let stepOutWait: TimeInterval = 2

  /**
   The Out button, arriving from the app target, and **the one event that is
   answered**.

   Called by `StepOutIntent.perform()`. Returns whether JavaScript reached the
   socket with the step-out — true meaning the departure is on its way and the
   card may be ended here, without waiting for a snapshot that a suspended app
   might never receive. See `StepOutIntent.swift` for why *false* keeps the
   card.
   */
  public static func requestStepOut() async -> Bool {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async {
        guard let module = current else {
          continuation.resume(returning: false)
          return
        }
        let id = UUID().uuidString
        pendingStepOuts[id] = continuation
        module.sendEvent("onStepOut", ["id": id])
        DispatchQueue.main.asyncAfter(deadline: .now() + stepOutWait) {
          settleStepOut(id, reached: false)
        }
      }
    }
  }

  /** Resumes a waiting step-out once, whichever of answer and timeout is first. */
  private static func settleStepOut(_ id: String, reached: Bool) {
    pendingStepOuts.removeValue(forKey: id)?.resume(returning: reached)
  }

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Events("onToggleMute", "onStepOut")

    OnCreate {
      LiveActivityModule.current = self
    }

    OnDestroy {
      // Only if it is still us. Expo can create the replacement before
      // destroying the old one on a reload, and clearing unconditionally would
      // leave the new instance unreachable by the intent.
      if LiveActivityModule.current === self { LiveActivityModule.current = nil }
    }

    AsyncFunction("show") { (state: [String: Any]) -> Bool in
      guard let host = LiveActivityModule.host else { return false }
      guard
        let channelId = state["channelId"] as? String,
        let channelName = state["channelName"] as? String,
        let micLabel = state["micLabel"] as? String,
        let micState = state["micState"] as? String,
        let muted = state["muted"] as? Bool,
        let canToggle = state["canToggle"] as? Bool,
        let outLabel = state["outLabel"] as? String
      else {
        // A malformed payload is a bug on the JavaScript side, and the useful
        // thing to do with it is nothing: a card drawn from half a payload
        // would say something false about somebody's microphone.
        return false
      }
      return host.show(
        LockScreenPayload(
          channelId: channelId,
          channelName: channelName,
          micLabel: micLabel,
          micState: micState,
          muted: muted,
          canToggle: canToggle,
          outLabel: outLabel
        )
      )
    }

    AsyncFunction("hide") { () -> Bool in
      return LiveActivityModule.host?.hide() ?? false
    }

    Function("answerStepOut") { (id: String, reached: Bool) in
      DispatchQueue.main.async {
        LiveActivityModule.settleStepOut(id, reached: reached)
      }
    }
  }
}

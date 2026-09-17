import ActivityKit
import Foundation
import LiveActivity

/**
 Owns the card: starts it, moves it, ends it.

 **In the app target rather than in the pod**, and not by preference. The
 activity is typed on `FloorActivityAttributes`, which has to be the same Swift
 type here as in the widget extension that draws it — so it is a source file
 with two target memberships, and anything naming it has to sit in one of those
 two targets. The pod is a third module. `LiveActivityModule` therefore knows
 nothing about ActivityKit and passes a plain `LockScreenPayload` to whoever
 registered; this is that registrant.

 The dependency runs the only way it can: an app target may import a pod, so
 `import LiveActivity` above is fine and the reverse would not be.

 **Everything is `iOS 16.1` or later, against a 15.1 deployment target.** A
 phone below that gets no card and a channel that works exactly as it did
 before any of this existed, which is the same bargain every other local module
 here strikes — see `modules/call-service`, which answers `false` on three
 platforms.
 */
@objc public class LockScreenController: NSObject, LockScreenHost {
  @objc public static let shared = LockScreenController()

  /**
   Hands this object to the pod, once, at launch.

   Called from `AppDelegate` — `plugins/with-live-activity.js` inserts the
   line — rather than from a lazy first use, because the first use is a
   `show()` from JavaScript and a `show()` that arrived before registration
   would be dropped rather than queued. Launch is the moment there is nothing
   to miss.
   */
  @objc public static func register() {
    LiveActivityModule.host = shared
  }

  /**
   The running activity, type-erased.

   `Activity<FloorActivityAttributes>` is `iOS 16.1`, and a stored property
   cannot be annotated on a class that has to exist at 15.1 — so the type is
   erased here and restored at each use. The alternative is a second class
   behind an availability check, which buys nothing but a file.
   */
  private var activity: Any?

  /** Which channel the running activity is about, so a move can be spotted. */
  private var channelId: String?

  public func show(_ payload: LockScreenPayload) -> Bool {
    guard #available(iOS 16.1, *) else { return false }
    /**
     Somebody can switch Live Activities off for this app in Settings, and
     several are off by default on a Mac. Asking is cheaper than catching the
     throw, and it keeps a refusal out of the logs on every snapshot.
     */
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

    let state = FloorActivityAttributes.ContentState(
      channelName: payload.channelName,
      muted: payload.muted,
      canToggle: payload.canToggle
    )

    /**
     A different channel is a different card.

     Presence is exclusive, so this happens when somebody steps straight from
     one channel into another without a moment outside — the server permits it
     and the app does not pass through a null `live`. Updating the running
     activity would leave its `channelId` pointing at the room they left, and
     the deep link on the card would take them back to it.
     */
    if let running = activity as? Activity<FloorActivityAttributes>,
      channelId == payload.channelId
    {
      Task { await running.update(using: state) }
      return true
    }

    endRunning()

    do {
      let started = try Activity.request(
        attributes: FloorActivityAttributes(channelId: payload.channelId),
        contentState: state,
        pushType: nil
      )
      activity = started
      channelId = payload.channelId
      return true
    } catch {
      /**
       Refused, and there is nothing useful to do about it.

       iOS caps how many activities an app may run and refuses outright when
       the process is in the background — which is exactly where a card would
       be most welcome, and is why `show` is driven from a hook that runs while
       the app is on screen rather than from the moment the screen locks. A
       channel with no card behind it works for as long as the app is open,
       which is every case except the one this feature is for.
       */
      activity = nil
      channelId = nil
      return false
    }
  }

  public func hide() -> Bool {
    guard #available(iOS 16.1, *) else { return false }
    let had = activity != nil
    endRunning()
    return had
  }

  @available(iOS 16.1, *)
  private func endRunning() {
    guard let running = activity as? Activity<FloorActivityAttributes> else {
      activity = nil
      channelId = nil
      return
    }
    activity = nil
    channelId = nil
    /**
     `.immediate`, because the card is about a conversation that has ended.

     ActivityKit's default leaves a finished activity on the lock screen for up
     to four hours, which is right for a delivery and wrong for this: a card
     saying *In a channel* with a Mute button on it, hours after somebody
     stepped out, is an interface asserting something false about their
     microphone.

     **`end(using:)` rather than `end(_:)`, and the deprecation is deliberate.**
     The unlabelled form is `iOS 16.2`, and this file's floor is 16.1 — so the
     modern spelling does not compile here, with an error that names the
     version and not the caller's annotation. `end(using:dismissalPolicy:)` is
     the 16.1 API, deprecated in 16.2 and still present. Raising the floor to
     16.2 to use the newer one would drop the card from phones that can draw it
     perfectly well, to silence a warning. The same applies to
     `Activity.request(attributes:contentState:pushType:)` above.
     */
    Task { await running.end(using: nil, dismissalPolicy: .immediate) }
  }
}

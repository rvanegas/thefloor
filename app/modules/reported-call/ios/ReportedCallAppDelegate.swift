import ExpoModulesCore
import Intents

/**
 * A tap on a channel's entry in Recents, which iOS delivers as an
 * `INStartCallIntent` carrying the handle the call was reported with — the
 * channel's id.
 *
 * **It opens the channel and does not step in.** A Recents tap is not consent
 * to a microphone, and the same tap on the lock screen card only opens the
 * channel too; `useChannelLink` is where both arrive.
 *
 * `NSUserActivityTypes` in `app.json` declares the intent type, which is what
 * lets iOS hand it to this app at all.
 */
public class ReportedCallAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard let channel = channelOf(userActivity) else { return false }
    ReportedCallModule.open(channel: channel)
    return true
  }

  private func channelOf(_ activity: NSUserActivity) -> String? {
    // `INStartAudioCallIntent` is the pre-iOS 13 form; this app's floor is 15.
    guard let start = activity.interaction?.intent as? INStartCallIntent else { return nil }
    guard let value = start.contacts?.first?.personHandle?.value, !value.isEmpty else { return nil }
    return value
  }
}

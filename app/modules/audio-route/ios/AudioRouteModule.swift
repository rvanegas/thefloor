import AVFoundation
import ExpoModulesCore

/**
 Reads the audio route, which nothing else in this app can.

 Written 2026-08-20, after five builds spent on a symptom described as "muting
 hands a Bluetooth headset out of A2DP and back". Every one was aimed at a
 mechanism read off the source, and none changed the sound. The engine's own
 diagnostics then reported, at 40ms resolution, that nothing about the input
 moves at a mute — which left the obvious question unasked because it was
 unaskable: does the route move at all?

 planning/STATES.md recorded that gap as disagreement 8, "Nothing can read the
 audio route… Open, and probably permanent." It was not permanent. It was this
 file.

 What is exposed, and what each answers that the others cannot:

 - `outputs` and `inputs` name the ports, so `BluetoothA2DP` against
   `BluetoothHFP` is stated rather than inferred from how something sounded.
 - `sampleRate` settles it numerically: the hands-free profile forces the
   session to 16 kHz, sometimes 8, where A2DP runs at 44.1 or 48. A rate that
   halves at a mute is a profile handover and nothing else. This exists because
   the person testing said, reasonably, that they could not quite judge the
   change by ear — and a diagnostic needing a trained ear is not a diagnostic.
 - `onRouteChange` carries iOS's own **reason code**, which is what separates a
   handover from a session being deactivated and reactivated, and both of those
   from no route change at all. The third would mean the tone is not a handover
   and five builds were aimed at the wrong phenomenon.
 - `category`, `mode` and `categoryOptions` are the session as it **actually
   is**, which is a different question from what this app last asked for.
   Three writers mutate the same process-wide configuration — this app, the
   SDK's native policy observer, and WebRTC re-applying its defaults — and the
   last one wins. Reading the asked-for value back proves nothing; reading
   these does. `categoryOptions` was added 2026-08-21 for exactly that
   comparison, the first two having been here from the start.
 - `allowsHapticsDuringRecording` is the one field here that is *written* as
   well as read, and it is why the silenced-speaker buzz did nothing at all.
   `AVAudioSession`'s own header: "Set allowHapticsAndSystemSoundsDuringRecording
   to YES in order to allow system sounds and haptics to play while the session
   is actively using audio input. Default value is NO." So iOS mutes the Taptic
   Engine for exactly the session this app holds whenever anybody's microphone
   is open — which is exactly when somebody can be silenced. Nothing fails:
   `notificationAsync` resolves, and no buzz is produced. Reading it back is
   what turns "it did not buzz" into a stated fact rather than a guess.

 - `otherAudioPlaying` and `secondaryAudioHint` are the only readable evidence
   about somebody *else's* audio. There is no public getter for whether our own
   session is active, so "did foregrounding interrupt a podcast" has to be
   answered from the far side.
 */
public class AudioRouteModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events("onRouteChange")

    // Synchronous on purpose. Callers take it either side of a transition and
    // compare, and an await between the two samples is exactly how the
    // JavaScript-side engine diagnostic managed to miss a flicker.
    Function("snapshot") { () -> [String: Any] in
      Self.snapshot()
    }

    /**
     Asks iOS to stop muting haptics while we are capturing.

     Separate from `snapshot`'s read of the same value, and asserted rather
     than assumed for the same reason the mute mode is: the request can fail,
     and a silent failure looks exactly like a success. The boolean says
     whether it took.

     Asynchronous where `snapshot` is not. This one crosses to the audio
     session server to *change* something, where the read is a property
     access, and the JavaScript thread is not the place to wait on that.
     */
    AsyncFunction("setAllowHapticsDuringRecording") { (allow: Bool) -> Bool in
      do {
        try AVAudioSession.sharedInstance()
          .setAllowHapticsAndSystemSoundsDuringRecording(allow)
        return true
      } catch {
        return false
      }
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let self else { return }
        var payload = Self.snapshot()
        let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        payload["reason"] = Self.reasonName(raw)
        self.sendEvent("onRouteChange", payload)
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }
  }

  private static func snapshot() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    let route = session.currentRoute
    return [
      "outputs": route.outputs.map { Self.describe($0) },
      "inputs": route.inputs.map { Self.describe($0) },
      "sampleRate": session.sampleRate,
      "category": session.category.rawValue,
      "mode": session.mode.rawValue,
      "categoryOptions": Self.optionNames(session.categoryOptions),
      // Whether some other app is producing sound right now, and whether iOS
      // thinks ours should defer to it. These are the only readable evidence
      // for "did we just interrupt somebody's podcast" — there is no getter
      // for whether our own session is active, so an interruption has to be
      // read from the other side of it.
      "otherAudioPlaying": session.isOtherAudioPlaying,
      "secondaryAudioHint": session.secondaryAudioShouldBeSilencedHint,
      // Whether the Taptic Engine is allowed to run while we are capturing.
      // False is the default, and false is a cue that cannot be delivered —
      // see the note at the top of this file.
      "allowsHapticsDuringRecording": session.allowHapticsAndSystemSoundsDuringRecording,
    ]
  }

  /**
   Names the bits of a category-option set, in the spelling the JavaScript
   side uses.

   These match `AppleAudioConfiguration.audioCategoryOptions` exactly —
   `allowBluetooth`, `allowBluetoothA2DP`, `allowAirPlay`, `defaultToSpeaker`,
   `mixWithOthers` — which is what lets a panel compare what was asked for
   against what the session has, string for string, rather than by eye.

   The remaining three are named as Apple names them. They are never asked
   for by this app, so seeing one is itself the finding: somebody else wrote
   this session.
   */
  private static func optionNames(
    _ options: AVAudioSession.CategoryOptions
  ) -> [String] {
    var names: [String] = []
    if options.contains(.mixWithOthers) { names.append("mixWithOthers") }
    if options.contains(.duckOthers) { names.append("duckOthers") }
    if options.contains(.allowBluetooth) { names.append("allowBluetooth") }
    if options.contains(.allowBluetoothA2DP) { names.append("allowBluetoothA2DP") }
    if options.contains(.allowAirPlay) { names.append("allowAirPlay") }
    if options.contains(.defaultToSpeaker) { names.append("defaultToSpeaker") }
    if options.contains(.interruptSpokenAudioAndMixWithOthers) {
      names.append("interruptSpokenAudioAndMixWithOthers")
    }
    if #available(iOS 14.5, *) {
      if options.contains(.overrideMutedMicrophoneInterruption) {
        names.append("overrideMutedMicrophoneInterruption")
      }
    }
    return names
  }

  /// Port type first, because the type is the diagnostic part and the name is
  /// only there to tell two of the same kind apart.
  private static func describe(_ port: AVAudioSessionPortDescription) -> String {
    "\(port.portType.rawValue)(\(port.portName))"
  }

  private static func reasonName(_ raw: UInt?) -> String {
    guard let raw, let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else {
      return "absent"
    }
    switch reason {
    case .unknown: return "unknown"
    case .newDeviceAvailable: return "newDeviceAvailable"
    case .oldDeviceUnavailable: return "oldDeviceUnavailable"
    // The one to expect if an audio-session category change is moving the
    // route, which is what four of the five fixes assumed was happening.
    case .categoryChange: return "categoryChange"
    case .override: return "override"
    case .wakeFromSleep: return "wakeFromSleep"
    case .noSuitableRouteForCategory: return "noSuitableRouteForCategory"
    // Fires when the same port reconfigures itself — a Bluetooth device
    // changing profile without the route's identity changing.
    case .routeConfigurationChange: return "routeConfigurationChange"
    @unknown default: return "raw(\(raw))"
    }
  }
}

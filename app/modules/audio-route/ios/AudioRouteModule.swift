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

 Three things are exposed and each answers something the others cannot:

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
    ]
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

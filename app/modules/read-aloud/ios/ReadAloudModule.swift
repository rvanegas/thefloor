import AVFoundation
import ExpoModulesCore
import NaturalLanguage

/**
 Claude's replies, spoken, with whatever voices this phone has installed.

 **Local rather than `expo-speech`, for one field.** Floor Settings tells
 somebody whether the voice their phone will use is the robotic one, and that
 needs `AVSpeechSynthesisVoice.quality` in all three of its values. Premium
 arrived in iOS 16, and a wrapper that reports only Default and Enhanced draws
 the best voice a phone can have as the worst.

 **It never touches the audio session.** The synthesizer only renders, and the
 call's own engine plays the result (`CallEngine`, `Reader`). Nothing here
 writes a category, an option or an active state: the three components that
 already configure the session are planning/POSTMORTEM-echo.md, and a fourth is
 not wanted. Nothing is sent into the call either: each phone reads to its own
 listener, and the echo canceller keeps it out of the microphone.
 */
public class ReadAloudModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReadAloud")

    Events("onReport")

    /**
     The engine hook goes in before any call can configure an engine, and its
     report is the first line: installed, or which selector this LiveKit lacks.
     */
    OnCreate {
      CallEngine.shared.report = { [weak self] line in
        self?.sendEvent("onReport", ["line": line])
      }
      CallEngine.shared.install()
    }

    /**
     Every voice installed for a language, by its two-letter subtag — `es`
     answers `es-ES` and `es-MX` both, the JavaScript half choosing among them.

     **Novelty voices are left out** — Bells, Bubbles, Bad News and the rest,
     which are `en-US` at Default quality and would otherwise be candidates to
     read a reply in. Personal Voice is never listed without its own
     permission, which this does not ask for.
     */
    Function("voices") { (language: String) -> [[String: Any]] in
      let prefix = language.lowercased()
      return AVSpeechSynthesisVoice.speechVoices()
        .filter { voice in
          let tag = voice.language.lowercased()
          guard tag == prefix || tag.hasPrefix(prefix + "-") else { return false }
          if #available(iOS 17.0, *) {
            if voice.voiceTraits.contains(.isNoveltyVoice) { return false }
          }
          return true
        }
        .map { voice in
          [
            "identifier": voice.identifier,
            "name": voice.name,
            "language": voice.language,
            "quality": Self.qualityName(voice.quality),
          ]
        }
    }

    /**
     The language a reply is written in, as a BCP 47 subtag and how sure the
     recognizer is, or nil where it will not guess.

     **The reply's own text decides**, not the app's language: Claude answers
     in the conversation's, and the text is the one thing in hand that is
     certainly in it. On-device and offline, and a reply of two sentences is
     plenty for it. **English and Spanish are hinted**, being the two this app
     is used in, so a short reply leans to one of them rather than to a
     neighbour like Catalan or Portuguese; anything else still wins on
     evidence.
     */
    Function("language") { (text: String) -> [String: Any]? in
      let recognizer = NLLanguageRecognizer()
      recognizer.languageHints = [.english: 0.4, .spanish: 0.4]
      recognizer.processString(text)
      guard
        let best = recognizer.languageHypotheses(withMaximum: 1).first,
        best.key != .undetermined
      else { return nil }
      return ["language": best.key.rawValue, "confidence": best.value]
    }

    /** What the engine hook found at creation, for the diagnostics log. */
    Function("hook") { () -> String in
      CallEngine.shared.status
    }

    /**
     Rendered and played by `Reader`, on the call's engine where it is playing
     out — see `CallEngine` for why there — and queued behind anything still
     being read rather than cutting it off.
     */
    AsyncFunction("speak") { (text: String, voice: String?, language: String) -> Bool in
      self.reader.speak(text, voice: voice, language: language)
      return true
    }.runOnQueue(.main)

    AsyncFunction("stop") { () -> Bool in
      self.reader.stop()
      return true
    }.runOnQueue(.main)
  }

  private lazy var reader: Reader = {
    let reader = Reader()
    reader.report = { [weak self] line in self?.sendEvent("onReport", ["line": line]) }
    return reader
  }()

  private static func qualityName(_ quality: AVSpeechSynthesisVoiceQuality) -> String {
    if #available(iOS 16.0, *) {
      if quality == .premium { return "premium" }
    }
    return quality == .enhanced ? "enhanced" : "default"
  }
}

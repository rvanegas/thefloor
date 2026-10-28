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

 **It never touches the audio session.** The synthesizer only renders — see
 `speak` — and an `AVAudioPlayer` in this process plays the result through
 whatever the call has configured. Nothing here writes a category, an option or
 an active state: the three components that already configure the session are
 planning/POSTMORTEM-echo.md, and a fourth is not wanted. Nothing is sent into
 the call either: each phone reads to its own listener.
 */
public class ReadAloudModule: Module {
  private lazy var synthesizer: AVSpeechSynthesizer = {
    let synthesizer = AVSpeechSynthesizer()
    synthesizer.usesApplicationAudioSession = true
    return synthesizer
  }()

  public func definition() -> ModuleDefinition {
    Name("ReadAloud")

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

    /**
     Rendered to a file, then played by an `AVAudioPlayer` in this process —
     **not** `speak(_:)`.

     **`speak(_:)` came out of the earpiece**, build 395, with `CALL` holding
     `defaultToSpeaker` and the chimes beside it on the loudspeaker. Why is not
     established — the likeliest account is that recent iOS plays synthesis
     from a system service rather than this process, and that playback does not
     take the route the session's options choose. What is established is the
     other side: an `AVAudioPlayer` here is the film chimes' path (`playThroughPlayer`
     in audio-route), which is heard on the loudspeaker under the same session,
     so speech takes it too: `write` hands back the audio, nothing is played
     until it is all in, and the player follows whatever route the call has.

     The cost is the render before the first word — faster than real time, so
     about a second for a long reply. **Queued behind anything still being
     spoken** rather than cutting it off: two replies in quick succession are
     two things somebody asked to hear.
     */
    AsyncFunction("speak") { (text: String, voice: String?, language: String) -> Bool in
      let utterance = AVSpeechUtterance(string: text)
      utterance.voice =
        voice.flatMap { AVSpeechSynthesisVoice(identifier: $0) }
        ?? AVSpeechSynthesisVoice(language: language)
      self.render(utterance)
      return true
    }.runOnQueue(.main)

    AsyncFunction("stop") { () -> Bool in
      self.generation += 1
      self.queue.removeAll()
      self.player?.stop()
      self.player = nil
      return self.synthesizer.stopSpeaking(at: .immediate)
    }.runOnQueue(.main)
  }

  /** Bumped by `stop`, so a render still under way when somebody leaves is dropped. */
  private var generation = 0
  private var queue: [URL] = []
  private var player: AVAudioPlayer?
  private lazy var finish = PlayerFinish { [weak self] in self?.playNext() }

  /**
   One utterance into one file in the caches directory, then onto the queue.

   **The end is a buffer of no frames**, which is how `write` says it is done;
   the file is released there, which is what closes it, before it is played.
   */
  private func render(_ utterance: AVSpeechUtterance) {
    let started = generation
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("read-aloud-\(UUID().uuidString).caf")
    var file: AVAudioFile?
    var done = false
    synthesizer.write(utterance) { [weak self] buffer in
      guard !done, let pcm = buffer as? AVAudioPCMBuffer else { return }
      if pcm.frameLength == 0 {
        done = true
        let wrote = file != nil
        file = nil
        DispatchQueue.main.async {
          guard let self, wrote, started == self.generation else {
            try? FileManager.default.removeItem(at: url)
            return
          }
          self.queue.append(url)
          if self.player == nil { self.playNext() }
        }
        return
      }
      do {
        if file == nil {
          file = try AVAudioFile(
            forWriting: url,
            settings: pcm.format.settings,
            commonFormat: pcm.format.commonFormat,
            interleaved: pcm.format.isInterleaved
          )
        }
        try file?.write(from: pcm)
      } catch {
        done = true
        file = nil
        try? FileManager.default.removeItem(at: url)
      }
    }
  }

  private func playNext() {
    if let previous = player?.url { try? FileManager.default.removeItem(at: previous) }
    player = nil
    while !queue.isEmpty {
      let url = queue.removeFirst()
      if let next = try? AVAudioPlayer(contentsOf: url) {
        next.delegate = finish
        player = next
        if next.play() { return }
        player = nil
      }
      try? FileManager.default.removeItem(at: url)
    }
  }

  private static func qualityName(_ quality: AVSpeechSynthesisVoiceQuality) -> String {
    if #available(iOS 16.0, *) {
      if quality == .premium { return "premium" }
    }
    return quality == .enhanced ? "enhanced" : "default"
  }
}

/** The player's delegate, which a `Module` cannot be, being no `NSObject`. */
final class PlayerFinish: NSObject, AVAudioPlayerDelegate {
  private let then: () -> Void
  init(_ then: @escaping () -> Void) { self.then = then }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async(execute: then)
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    DispatchQueue.main.async(execute: then)
  }
}

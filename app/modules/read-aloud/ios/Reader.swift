import AVFoundation
import NaturalLanguage

/**
 Claude's replies, a sentence at a time: rendered by the synthesizer, played on
 the call's engine where it is playing out (`CallEngine`), and by an
 `AVAudioPlayer` where it is not — alone in a room with nothing to play.

 **Rendered, never `speak(_:)`**, which came out of the earpiece on build 395
 with `CALL` holding `defaultToSpeaker`. **A sentence at a time** so the first
 one plays while the rest render, and so that a render that ends early costs a
 sentence rather than the reply.

 **Everything here runs on the main queue**; the synthesizer's callback and the
 node's completions hop onto it, and anything that arrives from before a
 `stop`, or from an earlier sentence, is recognised by its token and dropped.

 **It reports as it goes** — each render, each play and on which path, each
 engine stop mid-sentence and the resume — because build 396's reply stopping
 after a few sentences had two candidate causes and the code alone could not
 say which. Lines start `read-aloud` in the diagnostics log.
 */
final class Reader: NSObject, AVAudioPlayerDelegate {
  var report: (String) -> Void = { _ in }
  /**
   The reply being heard — the id it was handed with — or nil once nothing is
   rendering, playing or queued. Called only when that changes; it is what
   draws *Restart* and *Stop* while a reply is being read.
   */
  var reading: (String?) -> Void = { _ in }
  private var published: String?

  private let synthesizer: AVSpeechSynthesizer = {
    let synthesizer = AVSpeechSynthesizer()
    synthesizer.usesApplicationAudioSession = true
    return synthesizer
  }()

  /**
   Bumped by each render and by `stop`, so a buffer that arrives late is never
   taken for the next sentence's.
   */
  private var render = 0
  private var replies = 0

  private struct Sentence {
    let reply: String
    let utterance: AVSpeechUtterance
    let label: String
    let last: Bool
  }

  private final class Segment {
    let reply: String
    let audio: AVAudioPCMBuffer
    let label: String
    let last: Bool
    /** How far it has been heard, in seconds — a rate the engine may change. */
    var heard: Double = 0
    var converted: AVAudioPCMBuffer?
    init(reply: String, audio: AVAudioPCMBuffer, label: String, last: Bool) {
      self.reply = reply
      self.audio = audio
      self.label = label
      self.last = last
    }
  }

  private var sentences: [Sentence] = []
  private var segments: [Segment] = []

  private var rendering = false
  private var buffers: [AVAudioPCMBuffer] = []
  private var empties = 0
  private var settle: DispatchWorkItem?

  private enum Path {
    case engine(AVAudioPlayerNode, Int)
    case player(AVAudioPlayer, URL)
  }
  private var path: Path?
  /** Bumped whenever the node is stopped, so its flushed completions are ignored. */
  private var scheduled = 0
  /** After the engine stops mid-sentence, how long to wait for it before the player. */
  private var waitForEngineUntil: Date?
  private var pending: DispatchWorkItem?

  override init() {
    super.init()
    CallEngine.shared.changed = { [weak self] in self?.engineChanged() }
  }

  /** Queued behind anything still being read: two replies are two things asked to hear. */
  func speak(_ text: String, voice: String?, language: String, reply: String) {
    let chosen =
      voice.flatMap { AVSpeechSynthesisVoice(identifier: $0) }
      ?? AVSpeechSynthesisVoice(language: language)
    replies += 1
    let parts = Self.sentences(of: text)
    for (index, part) in parts.enumerated() {
      let utterance = AVSpeechUtterance(string: part)
      utterance.voice = chosen
      sentences.append(
        Sentence(
          reply: reply, utterance: utterance,
          label: "#\(replies).\(index + 1)/\(parts.count)",
          last: index == parts.count - 1))
    }
    report(
      "read-aloud reply #\(replies) chars=\(text.count) sentences=\(parts.count) "
        + "voice=\(chosen?.identifier ?? "none")")
    renderNext()
    publish()
  }

  func stop() {
    render += 1
    sentences.removeAll()
    segments.removeAll()
    buffers.removeAll()
    rendering = false
    settle?.cancel()
    pending?.cancel()
    waitForEngineUntil = nil
    synthesizer.stopSpeaking(at: .immediate)
    halt()
    publish()
  }

  /**
   **Reading until the last sentence of everything queued has been heard**: the
   segment playing, else the sentence rendering, else nothing. The gap while
   the next sentence renders is not a stop, so the controls do not blink
   between sentences.
   */
  private func publish() {
    let now = segments.first?.reply ?? sentences.first?.reply
    guard now != published else { return }
    published = now
    reading(now)
  }

  // MARK: Rendering

  /**
   **The end of a render is a buffer of no frames — and then a quarter of a
   second with nothing after it.** Build 396 took the first empty buffer as
   the end and dropped whatever followed, which is one of the two accounts of
   a reply stopping after a few sentences; anything that arrives after one is
   now kept, and counted in the report as `empties`. A render that goes quiet
   with no empty buffer at all is ended after five seconds with what it has.
   */
  private func renderNext() {
    guard !rendering, let sentence = sentences.first else { return }
    rendering = true
    buffers = []
    empties = 0
    render += 1
    let token = render
    synthesizer.write(sentence.utterance) { [weak self] buffer in
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      let copy = pcm.frameLength == 0 ? nil : Self.copy(pcm)
      DispatchQueue.main.async {
        guard let self, token == self.render, self.rendering else { return }
        if let copy { self.buffers.append(copy) } else { self.empties += 1 }
        self.settleAfter(copy == nil ? 0.25 : 5)
      }
    }
    settleAfter(5)
  }

  private func settleAfter(_ seconds: Double) {
    settle?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.rendered() }
    settle = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func rendered() {
    guard rendering, !sentences.isEmpty else { return }
    rendering = false
    let sentence = sentences.removeFirst()
    let frames = buffers.reduce(0) { $0 + Int($1.frameLength) }
    let rate = buffers.first?.format.sampleRate ?? 0
    let seconds = rate > 0 ? Double(frames) / rate : 0
    report(
      "read-aloud rendered \(sentence.label) chars=\(sentence.utterance.speechString.count) "
        + "secs=\(Self.round(seconds)) buffers=\(buffers.count) empties=\(empties)"
        + (empties == 0 ? " (no end marker)" : ""))
    if let first = buffers.first,
      let canonical = AVAudioFormat(standardFormatWithSampleRate: first.format.sampleRate, channels: 1),
      let audio = Self.concatenate(buffers, into: canonical)
    {
      segments.append(
        Segment(reply: sentence.reply, audio: audio, label: sentence.label, last: sentence.last))
    } else if !buffers.isEmpty {
      report("read-aloud could not convert \(sentence.label)")
    }
    buffers = []
    pump()
    renderNext()
    publish()
  }

  // MARK: Playing

  private func pump() {
    guard path == nil, let segment = segments.first else { return }
    if let node = CallEngine.shared.liveNode() {
      waitForEngineUntil = nil
      if playOnEngine(node, segment) { return }
    } else if let until = waitForEngineUntil, until > Date() {
      return
    }
    waitForEngineUntil = nil
    playOnPlayer(segment)
  }

  /** In half-second buffers, so a stopped engine is resumed from the one it was in. */
  private func playOnEngine(_ node: AVAudioPlayerNode, _ segment: Segment) -> Bool {
    let format = node.outputFormat(forBus: 0)
    if segment.converted?.format != format {
      segment.converted = Self.concatenate([segment.audio], into: format)
    }
    guard let audio = segment.converted, format.commonFormat == .pcmFormatFloat32,
      audio.frameLength > 0
    else {
      report("read-aloud could not play \(segment.label) on the engine")
      return false
    }
    let rate = format.sampleRate
    let total = Int(audio.frameLength)
    let from = min(Int(segment.heard * rate), total)
    let chunk = Int(rate / 2)
    scheduled += 1
    let token = scheduled
    var start = from
    while start < total {
      let length = min(chunk, total - start)
      guard let slice = Self.slice(audio, from: start, length: length) else { break }
      let end = start + length
      node.scheduleBuffer(slice, completionCallbackType: .dataPlayedBack) { [weak self] _ in
        DispatchQueue.main.async {
          guard let self, token == self.scheduled else { return }
          segment.heard = Double(end) / rate
          if end >= total { self.finished(segment) }
        }
      }
      start = end
    }
    if start == from {
      finished(segment)
      return true
    }
    path = .engine(node, token)
    node.play()
    report(
      "read-aloud play \(segment.label) on engine"
        + (from > 0 ? " from=\(Self.round(Double(from) / rate))s" : ""))
    return true
  }

  private func playOnPlayer(_ segment: Segment) {
    let audio = segment.audio
    let rate = audio.format.sampleRate
    let from = min(Int(segment.heard * rate), Int(audio.frameLength))
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("read-aloud-\(UUID().uuidString).caf")
    do {
      guard let rest = Self.slice(audio, from: from, length: Int(audio.frameLength) - from),
        rest.frameLength > 0
      else {
        finished(segment)
        return
      }
      // Scoped, so the file is closed before it is opened to play.
      do {
        let file = try AVAudioFile(
          forWriting: url, settings: audio.format.settings, commonFormat: .pcmFormatFloat32,
          interleaved: false)
        try file.write(from: rest)
      }
      let player = try AVAudioPlayer(contentsOf: url)
      player.delegate = self
      path = .player(player, url)
      guard player.play() else { throw CocoaError(.featureUnsupported) }
      report("read-aloud play \(segment.label) on player (engine not playing out)")
    } catch {
      path = nil
      try? FileManager.default.removeItem(at: url)
      report("read-aloud could not play \(segment.label): \(error.localizedDescription)")
      segments.removeFirst()
      pump()
      publish()
    }
  }

  private func finished(_ segment: Segment) {
    guard segments.first === segment else { return }
    segments.removeFirst()
    if case .player(_, let url) = path { try? FileManager.default.removeItem(at: url) }
    path = nil
    if segment.last { report("read-aloud done \(segment.label)") }
    pump()
    publish()
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async {
      guard case .player(let current, _) = self.path, current === player,
        let segment = self.segments.first
      else { return }
      if !flag { self.report("read-aloud player stopped early in \(segment.label)") }
      self.finished(segment)
    }
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    audioPlayerDidFinishPlaying(player, successfully: false)
  }

  /**
   **The engine stopping mid-sentence stops the node with it** — LiveKit stops
   and restarts it when the call reconfigures, as when somebody takes the
   floor — so the sentence waits a second and a half for it to come back and
   resumes from the half-second it was in, or else finishes on the player.
   */
  private func engineChanged() {
    if case .engine = path, CallEngine.shared.liveNode() == nil {
      let label = segments.first.map { "\($0.label) at \(Self.round($0.heard))s" } ?? ""
      halt()
      waitForEngineUntil = Date().addingTimeInterval(1.5)
      report("read-aloud engine stopped during \(label); waiting to resume")
      later(1.6)
    }
    later(0.25)
  }

  private func later(_ seconds: Double) {
    let work = DispatchWorkItem { [weak self] in self?.pump() }
    pending = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  private func halt() {
    scheduled += 1
    switch path {
    case .engine(let node, _):
      node.stop()
    case .player(let player, let url):
      player.stop()
      try? FileManager.default.removeItem(at: url)
    case nil:
      break
    }
    path = nil
  }

  // MARK: Buffers

  private static func sentences(of text: String) -> [String] {
    let tokenizer = NLTokenizer(unit: .sentence)
    tokenizer.string = text
    var parts: [String] = []
    tokenizer.enumerateTokens(in: text.startIndex..<text.endIndex) { range, _ in
      let part = text[range].trimmingCharacters(in: .whitespacesAndNewlines)
      if !part.isEmpty { parts.append(part) }
      return true
    }
    return parts.isEmpty ? [text] : parts
  }

  /** The synthesizer's buffer is its own to reuse; this one is ours. */
  private static func copy(_ pcm: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let copy = AVAudioPCMBuffer(pcmFormat: pcm.format, frameCapacity: pcm.frameLength)
    else { return nil }
    copy.frameLength = pcm.frameLength
    let source = UnsafeMutableAudioBufferListPointer(
      UnsafeMutablePointer(mutating: pcm.audioBufferList))
    let target = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
    for (from, to) in zip(source, target) {
      guard let data = from.mData, let into = to.mData else { continue }
      memcpy(into, data, Int(min(from.mDataByteSize, to.mDataByteSize)))
    }
    return copy
  }

  /** Every buffer, in order, as one in `format` — converting rate and sample type. */
  private static func concatenate(_ buffers: [AVAudioPCMBuffer], into format: AVAudioFormat)
    -> AVAudioPCMBuffer?
  {
    guard let first = buffers.first,
      buffers.allSatisfy({ $0.format == first.format }),
      let converter = AVAudioConverter(from: first.format, to: format)
    else { return nil }
    let frames = buffers.reduce(0) { $0 + Double($1.frameLength) }
    let capacity = AVAudioFrameCount(frames * format.sampleRate / first.format.sampleRate) + 4096
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
    var queue = buffers[...]
    var error: NSError?
    let status = converter.convert(to: out, error: &error) { _, state in
      if let next = queue.popFirst() {
        state.pointee = .haveData
        return next
      }
      state.pointee = .endOfStream
      return nil
    }
    return status == .error ? nil : out
  }

  /** Frames `from` for `length`, of a deinterleaved float buffer. */
  private static func slice(_ audio: AVAudioPCMBuffer, from: Int, length: Int) -> AVAudioPCMBuffer? {
    guard length > 0, let source = audio.floatChannelData,
      let out = AVAudioPCMBuffer(pcmFormat: audio.format, frameCapacity: AVAudioFrameCount(length)),
      let target = out.floatChannelData
    else { return nil }
    for channel in 0..<Int(audio.format.channelCount) {
      memcpy(target[channel], source[channel] + from, length * MemoryLayout<Float>.size)
    }
    out.frameLength = AVAudioFrameCount(length)
    return out
  }

  private static func round(_ seconds: Double) -> String {
    String(format: "%.1f", seconds)
  }
}

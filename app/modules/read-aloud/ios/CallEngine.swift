import AVFoundation
import ObjectiveC

/**
 The call's own `AVAudioEngine`, and a player node of ours on its main mixer.

 **Why speech goes in there.** Played anywhere else — `speak(_:)`, or an
 `AVAudioPlayer` as build 396 did — a reply is *other audio* to the voice
 processing the call runs, and two things follow, both heard on build 396: iOS
 ducks other audio under a voice-processing engine, so the reply was faint; and
 the echo canceller's reference is only what the engine itself plays, so the
 reply went into the open microphone and on to everybody else in the call,
 late, on top of their own phone reading it. A node on the engine's main mixer
 is mixed with the call itself: at the call's level, and cancelled from the
 microphone like the voices beside it — so it reaches neither the call nor a
 recording, which is made from what the microphone sends.

 **Reached by replacing three methods on the React Native observer**, because
 LiveKit's engine is not public and its module takes one delegate, which
 `@livekit/react-native-webrtc` already is. Each replacement calls the original
 first and changes nothing it answers. The engine wires
 `source → mainMixerNode → outputNode` itself and then calls
 `configureOutputFromSource` with the mixer, which is the moment the graph is
 meant to be extended (`audio_engine_device.mm`, m144, LiveKitWebRTC
 144.7559.15); a node attached anywhere else would race the engine's own
 thread. **An upgrade of LiveKit that renames the class or a selector turns
 this off rather than breaking anything**: speech falls back to the player,
 and `install` says which was missing in the diagnostics log.
 */
final class CallEngine {
  static let shared = CallEngine()

  /** A line for the diagnostics log, delivered on the main queue. */
  var report: (String) -> Void = { _ in }
  /** The engine started or stopped, delivered on the main queue. */
  var changed: () -> Void = {}

  private let lock = NSLock()
  private weak var engine: AVAudioEngine?
  private var node: AVAudioPlayerNode?
  /** Whether the engine was last started with its output enabled. */
  private var playout = false
  private var installed = false
  /** What `install` found, for a reader that subscribed after it ran. */
  private(set) var status = "not installed"

  /**
   The node, while the engine is running and playing the call out; nil
   otherwise, which is the player's turn. **Asked immediately before every
   `play`**: a node played on an engine that is not running raises, and
   Swift cannot catch it.
   */
  func liveNode() -> AVAudioPlayerNode? {
    lock.lock()
    defer { lock.unlock() }
    guard playout, let node, let engine, node.engine === engine, engine.isRunning,
      !engine.outputConnectionPoints(for: node, outputBus: 0).isEmpty
    else { return nil }
    return node
  }

  /** Once, at module creation — before any call has configured an engine. */
  func install() {
    guard !installed else { return }
    installed = true
    guard let observer = NSClassFromString("AudioDeviceModuleObserver") else {
      status = "missing: no AudioDeviceModuleObserver"
      report("read-aloud engine hook \(status)")
      return
    }
    let missing = [
      ("configureOutput", hookOutput(observer)),
      ("willStart", hookStart(observer)),
      ("didStop", hookStop(observer)),
      ("willRelease", hookRelease(observer)),
    ].filter { !$0.1 }.map { $0.0 }
    status = missing.isEmpty ? "installed" : "missing: \(missing.joined(separator: ","))"
    report("read-aloud engine hook \(status)")
  }

  private func hookOutput(_ cls: AnyClass) -> Bool {
    let selector = NSSelectorFromString(
      "audioDeviceModule:engine:configureOutputFromSource:toDestination:withFormat:context:")
    guard let method = class_getInstanceMethod(cls, selector) else { return false }
    typealias Original = @convention(c) (
      AnyObject, Selector, AnyObject, AVAudioEngine, AVAudioNode, AVAudioNode?, AVAudioFormat,
      NSDictionary
    ) -> Int
    let original = unsafeBitCast(method_getImplementation(method), to: Original.self)
    let replacement: @convention(block) (
      AnyObject, AnyObject, AVAudioEngine, AVAudioNode, AVAudioNode?, AVAudioFormat, NSDictionary
    ) -> Int = { observer, module, engine, source, destination, format, context in
      let result = original(observer, selector, module, engine, source, destination, format, context)
      if result == 0 { CallEngine.shared.outputConnected(engine, mixer: source, format: format) }
      return result
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
    return true
  }

  private typealias Transition = @convention(c) (
    AnyObject, Selector, AnyObject, AVAudioEngine, ObjCBool, ObjCBool
  ) -> Int
  private typealias TransitionBlock = @convention(block) (
    AnyObject, AnyObject, AVAudioEngine, ObjCBool, ObjCBool
  ) -> Int

  private func hookStart(_ cls: AnyClass) -> Bool {
    let selector = NSSelectorFromString(
      "audioDeviceModule:willStartEngine:isPlayoutEnabled:isRecordingEnabled:")
    guard let method = class_getInstanceMethod(cls, selector) else { return false }
    let original = unsafeBitCast(method_getImplementation(method), to: Transition.self)
    let replacement: TransitionBlock = { observer, module, engine, playout, recording in
      let result = original(observer, selector, module, engine, playout, recording)
      if result == 0 { CallEngine.shared.transition(engine, playout: playout.boolValue) }
      return result
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
    return true
  }

  private func hookStop(_ cls: AnyClass) -> Bool {
    let selector = NSSelectorFromString(
      "audioDeviceModule:didStopEngine:isPlayoutEnabled:isRecordingEnabled:")
    guard let method = class_getInstanceMethod(cls, selector) else { return false }
    let original = unsafeBitCast(method_getImplementation(method), to: Transition.self)
    let replacement: TransitionBlock = { observer, module, engine, playout, recording in
      CallEngine.shared.transition(engine, playout: false)
      return original(observer, selector, module, engine, playout, recording)
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
    return true
  }

  private func hookRelease(_ cls: AnyClass) -> Bool {
    let selector = NSSelectorFromString("audioDeviceModule:willReleaseEngine:")
    guard let method = class_getInstanceMethod(cls, selector) else { return false }
    typealias Original = @convention(c) (AnyObject, Selector, AnyObject, AVAudioEngine) -> Int
    let original = unsafeBitCast(method_getImplementation(method), to: Original.self)
    let replacement: @convention(block) (AnyObject, AnyObject, AVAudioEngine) -> Int = {
      observer, module, engine in
      CallEngine.shared.released(engine)
      return original(observer, selector, module, engine)
    }
    method_setImplementation(method, imp_implementationWithBlock(replacement))
    return true
  }

  /**
   On the engine's thread, with the engine stopped and its output just wired.

   **Mono, at the engine's rate, in the standard format**, so every buffer the
   reader schedules is converted to one thing it can predict — a node scheduled
   a buffer in any other format than its connection raises.
   */
  private func outputConnected(_ engine: AVAudioEngine, mixer: AVAudioNode, format: AVAudioFormat) {
    guard let mixer = mixer as? AVAudioMixerNode,
      let speech = AVAudioFormat(standardFormatWithSampleRate: format.sampleRate, channels: 1)
    else {
      DispatchQueue.main.async { self.report("read-aloud engine output is not a mixer") }
      return
    }
    lock.lock()
    if let old = node, old.engine !== engine {
      old.engine?.detach(old)
      node = nil
    }
    let player = node ?? AVAudioPlayerNode()
    if player.engine == nil { engine.attach(player) }
    if engine.outputConnectionPoints(for: player, outputBus: 0).isEmpty {
      engine.connect(
        player, to: mixer, fromBus: 0, toBus: mixer.nextAvailableInputBus, format: speech)
    }
    node = player
    self.engine = engine
    lock.unlock()
    DispatchQueue.main.async {
      self.report("read-aloud engine attached \(Int(format.sampleRate))Hz")
    }
  }

  private func transition(_ engine: AVAudioEngine, playout: Bool) {
    lock.lock()
    self.engine = engine
    self.playout = playout
    lock.unlock()
    DispatchQueue.main.async { self.changed() }
  }

  private func released(_ engine: AVAudioEngine) {
    lock.lock()
    if let old = node, old.engine === engine { engine.detach(old) }
    if self.engine === engine {
      node = nil
      self.engine = nil
      playout = false
    }
    lock.unlock()
    DispatchQueue.main.async { self.changed() }
  }
}

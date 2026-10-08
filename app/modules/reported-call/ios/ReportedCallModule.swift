import AVFoundation
import CallKit
import ExpoModulesCore
import WebRTC
import os

/**
 * Being in a channel, reported to iOS as an outgoing call shown under the
 * channel's *title* — its name, or, for an unnamed channel, who else is in
 * it — as the lock screen card is headed.
 *
 * **That title reaches Recents, CarPlay, the Watch, and through iCloud every
 * device on the Apple ID**, and an unnamed channel's title is the display
 * names of who else is in the room. Chosen knowingly on 2026-10-08, reversing
 * *Floor* for every call, which had kept channels' titles off all of those.
 *
 * One call per step-in, started when this device steps in and ended when it
 * steps out — `useSessionAudio` keys it on `mediaRoom`, as it keys Android's
 * foreground service, so a reconnect never ends one call and starts another.
 * What it buys is Recents, the green pill, and other calls meeting this one as
 * a call. **What it does not buy is a call screen**: iOS gives a call an app
 * places none of its own, the pill opens the app, and Channel View is the call
 * screen. See `planning/decision/2026-10-08-a-channel-is-an-outgoing-call-and-channel-view-is-its-screen.md`.
 *
 * **Every step-in is outgoing, whoever arrived first.** CallKit has calls you
 * place and calls you receive, and stepping in is always the person's own act;
 * an incoming call would ring them, which is the one thing this app refuses.
 *
 * **CallKit activates the session, and is told nothing it has not measured.**
 * The app still starts its own session first, as it did before; the spike
 * showed CallKit's `didActivate` following about 190ms later on the same `CALL`
 * configuration, with no conflict. `didActivate` and `didDeactivate` are passed
 * to `RTCAudioSession` here, natively, with no JavaScript in the path. And
 * while CallKit holds the session the app's own `releaseSession` fails
 * (`-12988`), so `holdsSession` tells the teardown to leave the release to
 * CallKit, which makes it within a second.
 *
 * Needs `voip` in `UIBackgroundModes`. Without it every transaction is refused
 * as *unentitled*, an outgoing call included.
 */
private let log = Logger(subsystem: "co.rvanegas.thefloor", category: "reported-call")

public class ReportedCallModule: Module {
  /** The live instance, for the app delegate subscriber, which has no other way in. */
  fileprivate static weak var current: ReportedCallModule?

  /**
   * A channel opened from Recents before JavaScript was listening — a cold
   * launch, which is the common case. Taken once by `takePendingChannel`.
   */
  fileprivate static var pendingChannel: String?

  fileprivate var provider: CXProvider?
  fileprivate let controller = CXCallController()
  fileprivate var delegate: ProviderDelegate?
  fileprivate var callId: UUID?
  /** The channel the live call is for, which a title has to match to be applied. */
  fileprivate var callChannel: String?
  /**
   * The newest title JavaScript gave, and for which channel. Held because the
   * call usually starts before the title arrives, and the title often changes
   * while the call is up — an unnamed channel's follows who is in the room.
   */
  fileprivate var titled: (channel: String, title: String)?
  /**
   * The mute the app says this device has in `channel` — Self-Mute, or no
   * microphone, as the lock screen card reads it. What an inbound action is
   * compared against: one that agrees is CallKit echoing the app, or the
   * system agreeing with it, and is not a tap.
   */
  fileprivate var appMuted: (channel: String, muted: Bool)?
  /**
   * What CallKit's flag says now, as of the last mute action it performed.
   * What an outbound one is compared against, so nothing is sent that would
   * change nothing — and so a refused tap is undone: the app re-states its
   * mute, which then differs from this.
   */
  fileprivate var callMuted = false
  /** Set when this side asked for the end, so CarPlay's or the Watch's End is told apart from it. */
  fileprivate var endingFromApp = false
  /** From `didActivate` to `didDeactivate`: the stretch in which the app must not release. */
  fileprivate var holdsSession = false

  /** Prefixed, so `idevicesyslog -m "reported call"` and the audio log agree. */
  fileprivate func emit(_ line: String) {
    let prefixed = "reported call \(line)"
    log.notice("\(prefixed, privacy: .public)")
    sendEvent("onLog", ["line": prefixed])
  }

  /** Called by the app delegate subscriber with the channel a Recents entry names. */
  static func open(channel: String) {
    pendingChannel = channel
    current?.sendEvent("onOpenChannel", ["channelId": channel])
  }

  /** What Recents, CarPlay and the Watch show for `channel`, until JavaScript says. */
  fileprivate func title(for channel: String) -> String {
    if let titled, titled.channel == channel { return titled.title }
    return "The Floor"
  }

  /** The app's mute in `channel`; unmuted until JavaScript says otherwise. */
  fileprivate func appIsMuted(in channel: String) -> Bool {
    if let appMuted, appMuted.channel == channel { return appMuted.muted }
    return false
  }

  /**
   * Brings CallKit's flag to the app's, if the live call is for `channel` and
   * the two differ. Main thread.
   */
  fileprivate func pushMute(for channel: String) {
    guard let id = callId, callChannel == channel else { return }
    let muted = appIsMuted(in: channel)
    guard muted != callMuted else { return }
    controller.request(CXTransaction(action: CXSetMutedCallAction(call: id, muted: muted))) { error in
      if let error { self.emit("mute \(muted) refused: \(error.localizedDescription)") }
    }
  }

  private func ensureProvider() -> CXProvider {
    if let provider { return provider }
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = true
    let provider = CXProvider(configuration: config)
    let delegate = ProviderDelegate(module: self)
    provider.setDelegate(delegate, queue: nil)
    self.provider = provider
    self.delegate = delegate
    return provider
  }

  public func definition() -> ModuleDefinition {
    Name("ReportedCall")

    Events("onLog", "onEnd", "onMute", "onOpenChannel")

    OnCreate {
      ReportedCallModule.current = self
    }

    OnDestroy {
      if ReportedCallModule.current === self { ReportedCallModule.current = nil }
    }

    /**
     * Starts the call for `channelId`, which is its handle — what a Recents
     * tap hands back. What it is shown as is the channel's title, from
     * `setTitle`; *The Floor* only until that arrives.
     */
    AsyncFunction("startCall") { (channelId: String, promise: Promise) in
      DispatchQueue.main.async {
        let provider = self.ensureProvider()
        if self.callId != nil {
          self.emit("start ignored, a call is already up")
          promise.resolve(false)
          return
        }
        let id = UUID()
        self.callId = id
        self.callChannel = channelId
        self.callMuted = false
        self.endingFromApp = false
        let handle = CXHandle(type: .generic, value: channelId)
        let start = CXStartCallAction(call: id, handle: handle)
        start.isVideo = false
        self.controller.request(CXTransaction(action: start)) { error in
          if let error {
            self.emit("start refused: \(error.localizedDescription)")
            self.callId = nil
            self.callChannel = nil
            promise.resolve(false)
            return
          }
          let update = CXCallUpdate()
          update.localizedCallerName = self.title(for: channelId)
          update.remoteHandle = handle
          update.hasVideo = false
          update.supportsHolding = true
          update.supportsGrouping = false
          update.supportsUngrouping = false
          update.supportsDTMF = false
          provider.reportCall(with: id, updated: update)
          self.emit("started")
          // A call starts unmuted; one stepped into muted says so at once.
          DispatchQueue.main.async { self.pushMute(for: channelId) }
          promise.resolve(true)
        }
      }
    }

    AsyncFunction("endCall") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let id = self.callId else {
          promise.resolve(false)
          return
        }
        self.endingFromApp = true
        self.controller.request(CXTransaction(action: CXEndCallAction(call: id))) { error in
          if let error {
            // Reported rather than requested, so the call does not outlive the
            // channel in Recents or in the status bar.
            self.emit("end refused: \(error.localizedDescription); reporting it ended")
            self.provider?.reportCall(with: id, endedAt: Date(), reason: .remoteEnded)
            self.callId = nil
            self.callChannel = nil
          }
          promise.resolve(error == nil)
        }
      }
    }

    /**
     * What the call for `channelId` is shown as: the channel's title. Applied
     * at once to a call already up for that channel, and kept for one about to
     * start. A title for any other channel changes nothing.
     */
    Function("setTitle") { (channelId: String, title: String) in
      DispatchQueue.main.async {
        self.titled = (channelId, title)
        guard let id = self.callId, self.callChannel == channelId, let provider = self.provider else { return }
        let update = CXCallUpdate()
        update.localizedCallerName = title
        provider.reportCall(with: id, updated: update)
      }
    }

    /**
     * The app's mute in `channelId` — Self-Mute, or no microphone — which
     * CallKit's flag follows, for CarPlay and the Watch to show. Applied at once
     * to a live call for that channel when the flag differs, kept for one about
     * to start, and ignored for any other channel. Called with the unchanged
     * value it also undoes a tap the app refused.
     */
    Function("setMuted") { (channelId: String, muted: Bool) in
      DispatchQueue.main.async {
        self.appMuted = (channelId, muted)
        self.pushMute(for: channelId)
      }
    }

    /** Whether CallKit holds the audio session, in which case the app must not release it. */
    Function("holdsSession") { () -> Bool in self.holdsSession }

    /** The channel a Recents tap opened before anybody was listening, once. */
    Function("takePendingChannel") { () -> String? in
      let channel = ReportedCallModule.pendingChannel
      ReportedCallModule.pendingChannel = nil
      return channel
    }
  }
}

/** CXProviderDelegate has to be an NSObject, which an Expo module is not. */
private final class ProviderDelegate: NSObject, CXProviderDelegate {
  weak var module: ReportedCallModule?

  init(module: ReportedCallModule) {
    self.module = module
  }

  func providerDidReset(_ provider: CXProvider) {
    // callservicesd went away and took the call with it. Logged and not
    // stepped out on: the channel is still there, and nobody asked to leave.
    module?.emit("provider reset")
    module?.callId = nil
    module?.callChannel = nil
    module?.holdsSession = false
  }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    action.fulfill()
    provider.reportOutgoingCall(with: action.callUUID, connectedAt: Date())
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard let module else { action.fulfill(); return }
    let fromApp = module.endingFromApp
    action.fulfill()
    module.callId = nil
    module.callChannel = nil
    module.endingFromApp = false
    module.emit("ended fromApp=\(fromApp)")
    // An End this app did not ask for — CarPlay, the Watch, End & Accept — is
    // the person stepping out.
    if !fromApp { module.sendEvent("onEnd", [:]) }
  }

  /**
   * Every mute action CallKit performs: the app's own, sent by `pushMute`, and
   * the system's — CarPlay, the Watch, Siri; with no call screen, nothing else
   * can send one.
   *
   * **One that agrees with the app is not a tap.** The spike matched on the
   * last value it had sent, and every app mute came back once as if a system
   * button had been pressed. Comparing with what the app *says* instead makes
   * the app's own echo, and the system agreeing with it, the same non-event.
   * One that disagrees is the person asking, and goes to JavaScript as the
   * mute they asked for, which acts on it or re-states its own to undo it.
   *
   * Runs on the main queue: the provider's delegate queue is nil.
   */
  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    guard let module else { action.fulfill(); return }
    module.callMuted = action.isMuted
    action.fulfill()
    guard let channel = module.callChannel else { return }
    if action.isMuted == module.appIsMuted(in: channel) { return }
    module.emit("mute \(action.isMuted) from the system")
    module.sendEvent("onMute", ["muted": action.isMuted])
  }

  /** Hold & Accept. Logged until Phase 3 gives it a meaning. */
  func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    module?.emit("held \(action.isOnHold)")
    action.fulfill()
  }

  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    module?.emit("timed out performing \(type(of: action))")
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    RTCAudioSession.sharedInstance().audioSessionDidActivate(audioSession)
    module?.holdsSession = true
    module?.emit("activated \(audioSession.category.rawValue)/\(audioSession.mode.rawValue)")
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    RTCAudioSession.sharedInstance().audioSessionDidDeactivate(audioSession)
    module?.holdsSession = false
    module?.emit("deactivated")
  }
}

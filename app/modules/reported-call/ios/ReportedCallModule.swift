import AVFoundation
import CallKit
import ExpoModulesCore
import LiveKitWebRTC
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
 * to `LKRTCAudioSession` here, natively, with no JavaScript in the path. And
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
  /** Held for another call, from *Hold & Accept* until it is taken off hold. */
  fileprivate var held = false
  /**
   * An interruption that began while the call was up and has not ended — see
   * `recoverInterruption`. Cleared by its `ended`, by CallKit activating the
   * session, and by the call going.
   */
  fileprivate var interrupted = false
  /**
   * From the call coming off hold until CallKit next activates or deactivates
   * the session — the stretch in which a deactivation means the resume did not
   * bring the session back. See `recoverResume`.
   */
  fileprivate var resuming = false
  /**
   * From `cycleHold` asking for the hold until CallKit next activates the
   * session: a hold this module made to get the session back, which nobody
   * else is told about. See `cycleHold`.
   */
  fileprivate var cycling = false
  /**
   * The call `cycleHold` has held and will resume once CallKit's
   * `didDeactivate` for that hold lands, so the hold's deactivation can never
   * be mistaken for the resume's.
   */
  fileprivate var resumeAfterDeactivate: UUID?
  fileprivate var interruptionObserver: NSObjectProtocol?
  /**
   * Every call on the device, this app's and everybody else's — what tells a
   * held call that the call it was held for has ended. See `resumeIfAlone`.
   */
  fileprivate let observer = CXCallObserver()

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

  /**
   * Takes the call off hold once no other call is up.
   *
   * **iOS does not do this itself.** When the call taken with *Hold & Accept*
   * ends, a held call from an app stays held, and the person comes back to
   * The Floor to find it silent: measured 2026-10-12, build 354, where the
   * held call got no `held false` at all. WebRTC then restarted its engine on
   * the app's return to the foreground, against a session CallKit still had
   * on hold, and logged `playout frozen` until the person stepped out and in.
   * Taking the call off hold here is meant to bring `didActivate`, which
   * WebRTC treats as the end of the interruption — and does not always:
   * `recoverResume` covers the time it brings `didDeactivate` instead.
   *
   * Asked as a transaction rather than assumed: CallKit may refuse it, and
   * then the call stays held and says so.
   */
  fileprivate func resumeIfAlone() {
    guard held, let id = callId else { return }
    let others = observer.calls.filter { $0.uuid != id && !$0.hasEnded }
    guard others.isEmpty else { return }
    emit("resuming, no other call is up")
    controller.request(CXTransaction(action: CXSetHeldCallAction(call: id, onHold: false))) { error in
      if let error { self.emit("resume refused: \(error.localizedDescription)") }
    }
  }

  /**
   * Ends, for WebRTC, an interruption iOS began and never ended, by telling it
   * the session was deactivated and activated again — the pair CallKit sends
   * across a hold, which `resumeIfAlone` relies on already.
   *
   * **iOS interrupts the session 480 seconds after the film takes it**, while a
   * reported call is up: fifteen times in fifteen from build 346 to 358, at
   * 480.0 to 480.6s after `released LISTENING`, on two phones at once when
   * they started together, and never before the call shipped. No `ended`
   * follows. WebRTC stops its engine on the `began` and will not start it
   * again until it hears the interruption is over, so the pause's retake of
   * `CALL` publishes a track with no engine behind it — `playout frozen` on the
   * other phone, both pause chimes dropped, until somebody steps out and in,
   * whose new call's `didActivate` is the end WebRTC was waiting for. See
   * `planning/decision/2026-10-13-the-call-s-unended-interruption-is-ended-by-the-app.md`.
   *
   * The app's foreground is not enough: build 351 came back to the front
   * inside one and the pause after it was still dead.
   *
   * **The pair rather than `didActivate` alone**, so WebRTC's activation count
   * stays where CallKit's own calls leave it. A held call is left alone:
   * CallKit deactivated that session deliberately, and taking the call off
   * hold is what brings it back.
   *
   * **Usually refused**, which is what `cycleHold` is for: five of six runs
   * from 2026-10-15 to 2026-10-22 logged `Session activation failed` with the
   * app in front. Refused, `interrupted` stays set.
   */
  fileprivate func recoverInterruption() -> Bool {
    guard interrupted, callId != nil, !held else { return false }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setActive(true)
    } catch {
      let code = (error as NSError).code
      emit("interruption not recovered: \(error.localizedDescription) (\(code))")
      return false
    }
    interrupted = false
    let rtc = LKRTCAudioSession.sharedInstance()
    rtc.audioSessionDidDeactivate(session)
    rtc.audioSessionDidActivate(session)
    emit("interruption ended by the app \(session.category.rawValue)/\(session.mode.rawValue)")
    return true
  }

  /**
   * Brings the session back when CallKit answered a call coming off hold with
   * `didDeactivate` rather than `didActivate`.
   *
   * **The resume does not always activate.** Seen 2026-10-22, build 384: the
   * call this one was held for ended, `resumeIfAlone` took it off hold, and
   * 230ms later CallKit deactivated the session — already deactivated by the
   * hold — and never activated it. The roster said *Present* again and the
   * phone heard nothing until a step-out and back. The guess is that
   * the other call still had the audio, `resumeIfAlone` having asked the
   * moment `CXCallObserver` said it ended; on 2026-10-20 a resume fifteen
   * seconds after the hold got its `didActivate`.
   *
   * WebRTC stopped its engine at the hold's interruption and is still waiting
   * for its end, so this is that interruption, ended the way
   * `recoverInterruption` ends the film's. Tried at once and, refused, once
   * more a second later, in case the other call's audio was still going away.
   * Refused twice, `interrupted` stays set, and the next time the session
   * becomes a call JavaScript asks again.
   */
  fileprivate func recoverResume() {
    guard resuming else { return }
    resuming = false
    cycling = false
    guard let id = callId, !held else { return }
    interrupted = true
    if recoverInterruption() { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
      guard self.callId == id, !self.held, !self.holdsSession else { return }
      self.interrupted = true
      _ = self.recoverInterruption()
    }
  }

  /**
   * Gets the session back through CallKit when the app's own activation is
   * refused, by holding the call and taking it straight off hold again.
   *
   * **The app cannot activate the session itself here, and CallKit can.**
   * `recoverInterruption`'s `setActive` was refused five times in six from
   * 2026-10-15 to 2026-10-22, every one a pause after the 480-second
   * interruption, and every one cured ten seconds later by a step-out — whose
   * new call CallKit activated at once, with the app in front. A hold and a
   * resume is the other way CallKit sends `didDeactivate` and `didActivate`,
   * the pair `recoverInterruption` imitates, and it leaves the call standing:
   * no second Recents entry, nothing for CarPlay or the Watch to show but a
   * moment's hold.
   *
   * **The room is not told**: `setHeld` is skipped for these, so the roster
   * does not say *On another call* for a hold nobody took. A resume answered
   * with `didDeactivate` goes to `recoverResume` like any other, and does not
   * come back here, so this cannot loop.
   *
   * **The resume waits for the hold's `didDeactivate`**, so that deactivation
   * cannot land inside the resume and read as the resume failing. When CallKit
   * holds no session there is none to wait for, and the resume follows the
   * hold at once. One that never comes is given a second, so the call cannot
   * be left held.
   */
  fileprivate func cycleHold() {
    guard interrupted, !cycling, !held, let id = callId else { return }
    cycling = true
    let waits = holdsSession
    emit("holding and resuming, the app's activation was refused")
    if waits { resumeAfterDeactivate = id }
    controller.request(CXTransaction(action: CXSetHeldCallAction(call: id, onHold: true))) { error in
      if let error {
        self.cycling = false
        self.resumeAfterDeactivate = nil
        self.emit("hold refused: \(error.localizedDescription)")
        return
      }
      if !waits { self.resumeCycle(id); return }
      // Never left held: a deactivation that does not come is waited for for
      // the second `recoverResume` already allows, and no longer.
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
        guard self.resumeAfterDeactivate == id else { return }
        self.resumeAfterDeactivate = nil
        self.emit("no deactivation for the app's hold, resuming anyway")
        self.resumeCycle(id)
      }
    }
  }

  /** The second half of `cycleHold`. */
  fileprivate func resumeCycle(_ id: UUID) {
    guard cycling, callId == id else { cycling = false; return }
    controller.request(CXTransaction(action: CXSetHeldCallAction(call: id, onHold: false))) { error in
      if let error {
        self.cycling = false
        self.emit("resume refused: \(error.localizedDescription)")
      }
    }
  }

  /** Watches for the interruption `recoverInterruption` ends. Main queue. */
  fileprivate func observeInterruptions() {
    guard interruptionObserver == nil else { return }
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: nil,
      queue: .main
    ) { [weak self] notification in
      guard let self, self.callId != nil else { return }
      let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
      if raw == AVAudioSession.InterruptionType.began.rawValue {
        self.interrupted = true
      } else if raw == AVAudioSession.InterruptionType.ended.rawValue {
        self.interrupted = false
      }
    }
  }

  /** Sets `held` and tells JavaScript, which tells the room. */
  fileprivate func setHeld(_ value: Bool) {
    guard held != value else { return }
    held = value
    sendEvent("onHeld", ["held": value])
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
    observer.setDelegate(delegate, queue: nil)
    self.provider = provider
    self.delegate = delegate
    return provider
  }

  public func definition() -> ModuleDefinition {
    Name("ReportedCall")

    Events("onLog", "onEnd", "onMute", "onHeld", "onOpenChannel")

    OnCreate {
      ReportedCallModule.current = self
      DispatchQueue.main.async { self.observeInterruptions() }
    }

    OnDestroy {
      if ReportedCallModule.current === self { ReportedCallModule.current = nil }
      if let observer = self.interruptionObserver {
        NotificationCenter.default.removeObserver(observer)
      }
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
        self.setHeld(false)
        self.interrupted = false
        self.resuming = false
        self.cycling = false
        self.resumeAfterDeactivate = nil
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
            self.setHeld(false)
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

    /**
     * Ends an interruption that began during the call and never ended — see
     * `recoverInterruption`, and `cycleHold` when that is refused. `false`
     * when there is none, and when it is left to CallKit's activation.
     */
    AsyncFunction("recoverInterruption") { (promise: Promise) in
      DispatchQueue.main.async {
        if self.recoverInterruption() { promise.resolve(true); return }
        self.cycleHold()
        promise.resolve(false)
      }
    }

    /** Whether the call is held for another one, for a JavaScript that started listening late. */
    Function("isHeld") { () -> Bool in self.held }

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
private final class ProviderDelegate: NSObject, CXProviderDelegate, CXCallObserverDelegate {
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
    module?.interrupted = false
    module?.resuming = false
    module?.cycling = false
    module?.resumeAfterDeactivate = nil
    module?.setHeld(false)
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
    module.interrupted = false
    module.resuming = false
    module.cycling = false
    module.resumeAfterDeactivate = nil
    // Told to JavaScript although the end is a step-out, which is what takes
    // the room's `onAnotherCall` away: `useReportedCall` keeps its own copy,
    // and one left saying held tells the room so again at the next step-in.
    module.setHeld(false)
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

  /**
   * *Hold & Accept* holds the call, and `resumeIfAlone` — or the person, from
   * the system's call list — takes it off hold. CallKit deactivates the
   * session on the first and should activate it on the second; the engine
   * follows from `didActivate`. When a deactivation comes instead,
   * `recoverResume` brings the session back.
   */
  func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    guard let module else { action.fulfill(); return }
    module.emit("held \(action.isOnHold)\(module.cycling ? " by the app" : "")")
    action.fulfill()
    module.resuming = !action.isOnHold
    // `cycleHold`'s own hold is not one the room hears about.
    if !module.cycling { module.setHeld(action.isOnHold) }
  }

  /**
   * Any call on the device changed. What is wanted from it is the moment the
   * call this one was held for ends — see `resumeIfAlone`. Main queue, the
   * observer's delegate queue being nil.
   */
  func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
    guard let module, call.uuid != module.callId, call.hasEnded else { return }
    module.resumeIfAlone()
  }

  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    module?.emit("timed out performing \(type(of: action))")
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    LKRTCAudioSession.sharedInstance().audioSessionDidActivate(audioSession)
    module?.holdsSession = true
    module?.interrupted = false
    module?.resuming = false
    module?.cycling = false
    module?.emit("activated \(audioSession.category.rawValue)/\(audioSession.mode.rawValue)")
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    LKRTCAudioSession.sharedInstance().audioSessionDidDeactivate(audioSession)
    module?.holdsSession = false
    module?.emit("deactivated")
    if let id = module?.resumeAfterDeactivate {
      module?.resumeAfterDeactivate = nil
      module?.resumeCycle(id)
      return
    }
    module?.recoverResume()
  }
}

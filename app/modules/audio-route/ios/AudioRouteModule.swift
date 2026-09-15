import AVFoundation
import AudioToolbox
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

 - `otherAudioPlaying` is the only readable evidence about somebody *else's*
   audio. There is no public getter for whether our own session is active, so
   "did foregrounding interrupt a podcast" has to be answered from the far
   side. It decides nothing since 2026-09-08 — stepping in claims the audio
   system unconditionally, so there is no fork left for it to pick — and it is
   kept as a reading rather than as an input. `secondaryAudioHint` and the
   notification behind it left with the fork; see `release` below for what
   replaced the whole question.

 - `release` deactivates the session **with `notifyOthersOnDeactivation`**,
   which is the one thing neither half of the SDK does and the thing that
   actually gives another app its audio back.
 */
public class AudioRouteModule: Module {
  private var observer: NSObjectProtocol?

  /**
   The lab's input tap, held so it can be stopped.

   Nil except while a trial is deliberately capturing. This is the only audio
   engine this app ever starts outside the SDK's, and it exists so that
   "playAndRecord" in a trial means the input chain is actually running rather
   than merely permitted.
   */
  private var engine: AVAudioEngine?

  /**
   The lab's chime player, held so the sound outlives the call that started it.

   Nil until a `player` chime is asked for. One at a time is deliberate: these
   are 180ms cues tapped by hand, and a queue would only blur the comparison
   this exists to make.
   */
  private var player: AVAudioPlayer?

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
    /**
     The alert vibration — the one an incoming call uses.

     Build 71 proved the permission above works and, in the same breath, that
     `UINotificationFeedbackGenerator`'s warning is not the right cue: it
     arrived, and it was described as very slight, hardly perceptible. That is
     a fair account of what it is. The notification haptics are designed to be
     felt by a hand already holding the phone and looking at it, and the case
     this cue exists for is the opposite one — a phone in a pocket, against a
     leg, with somebody talking.

     `AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)` is the whole
     vibration motor rather than a Taptic transient, and it is what iOS itself
     reaches for when it has to reach somebody who is not looking. Borrowing
     the strength iOS uses for the same problem is the argument for it.

     Not `CHHapticEngine`, which would give finer control over intensity and is
     the obvious alternative: it is an engine, started next to a live voice
     session, and this app has spent six builds on what that neighbourhood does
     to audio. A system sound starts nothing.

     **It is a system sound, so it is governed by the property above** — which
     is why this could not have worked before build 71 either, and why the two
     belong in the same file.
     */
    Function("vibrate") { () -> Bool in
      AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
      return true
    }

    /**
     The presence chimes: two notes rising, the same two falling, or one alone.

     **A system sound for the same reason `vibrate` is one.** The argument
     above against `CHHapticEngine` — that it is an engine started next to a
     live voice session, and this app has spent six builds on what that
     neighbourhood does to audio — rules out `AVAudioPlayer` and `expo-audio`
     here by exactly the same reasoning, and more sharply: those two configure
     `AVAudioSession` themselves, which would make a fourth writer to the
     process-wide configuration POSTMORTEM-echo.md is about. A system sound
     starts nothing and configures nothing.

     **It is a system sound, so `setAllowHapticsDuringRecording` governs it**
     just as it governs the vibration — without that property this is silent
     for the whole duration of a capturing session, which is most of when it
     has anything to say. `useSessionAudio` asserts it on every configuration
     write, so nothing extra is needed here; it is named because a future
     session removing that call would silence this with no other symptom.

     **Synthesised rather than shipped**, which costs a WAV header and buys no
     asset in the repository and no decode at chime time.
     `AudioServicesCreateSystemSoundID` wants a file, so each kind is rendered
     once into the temporary directory and its id kept for the life of the
     process. One id per kind; `soundIds` is only ever touched from the
     JavaScript thread, which is the only thread that calls this.

     **A string rather than the `Bool` it was until 2026-09-15**, because there
     turned out to be three of these and not two. A third direction cannot be
     added to a bit, and the bit was already lying: a nearby declaration fired
     the rising chime, so *stepped in* and *stepped to the edge* made the same
     sound. `chimeNotes` is the set of kinds, and an unknown one returns false
     rather than guessing — a chime nobody recognises is worse than silence.
     */
    Function("chime") {
      (kind: String, amplitude: Double, lead: Double, via: String) -> Bool in
      guard
        let url = self.chimeFile(kind: kind, amplitude: amplitude, lead: lead)
      else {
        return false
      }
      if via == "player" {
        return self.playThroughPlayer(url)
      }
      guard let id = self.chimeSound(url: url) else { return false }
      AudioServicesPlaySystemSound(id)
      return true
    }

    /**
     Renders a chime and loads it into the system sound server without playing.

     **This is the candidate mechanism for *quiet once, normal twice*, and it
     was sitting in plain sight the whole time.** On the first call for a given
     kind, amplitude and lead, `chime` renders a WAV, writes it to disk, creates
     a `SystemSoundID` from it and plays it in the same breath.
     `AudioServicesCreateSystemSoundID` returns a status, not a loaded sound —
     and a cue 180ms long has no margin at all for a server still picking the
     file up.

     **It explains the flat sweep, which is the part no other theory reached.**
     The cache key is kind *plus amplitude* plus lead, so every chip on the peak
     row is a fresh key and therefore a cold first tap. Somebody sweeping the
     five peaks taps each one once and hears five cold sounds — which is not a
     comparison of amplitudes at all, however faithfully the file carries them.
     It also survives the ringer result: the alert level never entered into it.

     So the rendering and the loading come off the path of the tap. The app
     warms its three at mount, the lab warms whatever its chips are set to, and
     what is left at the tap is the play.

     The discriminator, before any of this is believed: tap a peak twice, move
     the chip away and back, and tap once. A cold theory says that tap is loud,
     because the key is already warm.
     */
    Function("prepareChime") {
      (kind: String, amplitude: Double, lead: Double) -> Bool in
      guard
        let url = self.chimeFile(kind: kind, amplitude: amplitude, lead: lead)
      else {
        return false
      }
      return self.chimeSound(url: url) != nil
    }

    /**
     What this binary's chime renderer actually is.

     **It exists because a fix that needs a native rebuild is indistinguishable,
     from the phone, from a fix that did not work.** The 180ms lead-in below
     shipped on 2026-09-15 and was reported still broken; the first question —
     which nobody could answer from the screen — was whether the running binary
     had it at all, since a JavaScript reload picks up every word of the lab and
     none of this file. A number read back off the renderer settles that in the
     one place the symptom is.

     It is the same rule the rest of this module is built on. `configure`
     returns a snapshot rather than a success flag because reading back what you
     asked for proves nothing; this returns what the renderer holds rather than
     what the lab believes it passed.

     **Its absence is the finding**, and is the only signal that can cross a
     stale binary: a build without this function returns nothing at all, and the
     lab says so in those words rather than showing a default.
     */
    Function("chimeInfo") { () -> [String: Any] in
      [
        "leadSeconds": Self.chimeLeadSeconds,
        "noteSeconds": Self.chimeNoteSeconds,
        "amplitude": Self.chimeAmplitude,
        "sampleRate": Self.chimeSampleRate,
        "kinds": Self.chimeNotes.keys.sorted(),
      ]
    }

    /**
     Writes the session exactly as asked and hands back what it actually became.

     **The whole point is that it does not know what a good configuration is.**
     Every other writer in this app applies one of two named constants; this one
     takes strings, so the matrix can be swept from a screen on the phone
     without a rebuild per row. Nothing in the app calls it — it exists for the
     lab in `AudioLabView`, and an experiment that needed a new build for each
     cell would not get run.

     **The return value is a `snapshot()` rather than a success flag**, on the
     rule this module was written for: reading back the value you asked for
     proves nothing, because three writers mutate the same process-wide
     configuration and the last one wins. `category`, `mode` and
     `categoryOptions` here are the session as it *is*. A row where the readback
     disagrees with the request is the most interesting result this can produce,
     so it is reported rather than treated as a failure.

     `error` is the thrown message or nil. A refusal from iOS and a silent
     rewrite by somebody else look identical from JavaScript otherwise.
     */
    Function("configure") {
      (category: String, mode: String, options: [String], active: Bool)
        -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      var failure: String? = nil
      do {
        try session.setCategory(
          Self.category(category),
          mode: Self.mode(mode),
          options: Self.options(options)
        )
        // Activation is the moment another app is interrupted, not
        // `setCategory` — so a test that never activates measures nothing.
        try session.setActive(active, options: active ? [] : [.notifyOthersOnDeactivation])
      } catch {
        failure = String(describing: error)
      }
      var payload = Self.snapshot()
      payload["error"] = failure as Any
      payload["asked"] = ["category": category, "mode": mode, "options": options]
      return payload
    }

    /**
     Opens the microphone for real, which is half of what is being tested.

     Apple's own wording for `mixWithOthers` under `playAndRecord` is that other
     apps may play *"while your app has both audio input and output enabled"* —
     so a trial that sets the category and never captures has not asked the
     question. An `AVAudioEngine` input tap is the smallest thing that genuinely
     engages the input chain, and it starts nothing that WebRTC would also
     start: the lab runs outside any channel on purpose.

     The tap discards its buffers. Nothing here is listening to anybody; the
     capture is the experiment's independent variable and not a recording.
     */
    Function("startInput") { () -> [String: Any] in
      if self.engine != nil { return Self.snapshot() }
      let engine = AVAudioEngine()
      var failure: String? = nil
      do {
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.inputFormat(forBus: 0)) {
          _, _ in
        }
        engine.prepare()
        try engine.start()
        self.engine = engine
      } catch {
        failure = String(describing: error)
        self.engine = nil
      }
      var payload = Self.snapshot()
      payload["error"] = failure as Any
      return payload
    }

    Function("stopInput") { () -> [String: Any] in
      if let engine = self.engine {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.engine = nil
      }
      return Self.snapshot()
    }

    /**
     Gives the audio system back, and tells the interrupted app so.

     **`notifyOthersOnDeactivation` is the whole of why this exists**, and it is
     the one thing neither half of the SDK does. `AudioSession.stopAudioSession`
     is `setActive(false)` with no options
     (`LiveKitReactNativeModule.swift`), and the native policy observer's
     `deactivateOnStop` path is `[session setActive:NO error:]` with no options
     either (`AudioDeviceModuleObserver.m`). Deactivating without the flag
     releases the session and says nothing; with it, iOS tells whatever was
     interrupted that it may resume — which is what the 2026-09-08 lab run
     measured, every `Release` bringing the other app back to full rate.

     **Going nearby is *meant* to give somebody their podcast back**, and since
     2026-09-08 that is the only mechanism by which it happens: nearby holds no
     session at all, and only deactivating says so. See
     planning/decisions/2026-09-08-stepping-in-and-nearby.md.

     Called on the connection's teardown, after the SDK has stopped its own
     session — so on a healthy path this is asserting a deactivation that has
     already happened, and its job is the notification rather than the state.
     Returns the snapshot for the same reason `configure` does: the session as
     it *is* is the only evidence worth having.
     */
    AsyncFunction("release") { () -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      var failure: String? = nil
      do {
        try session.setActive(false, options: [.notifyOthersOnDeactivation])
      } catch {
        failure = String(describing: error)
      }
      var payload = Self.snapshot()
      payload["error"] = failure as Any
      return payload
    }

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

  /**
   The rendered chimes, kept for the life of the process.

   **Keyed by kind *and* amplitude**, because amplitude is baked into the
   samples — a system sound has no volume knob, so the file is the volume. In
   the app that is one entry per kind and the key never varies; in the lab it
   is one per row of the comparison, which is a handful of small files in the
   temporary directory and is the price of hearing them one after another.

   Rendering costs a few milliseconds and a file write, and doing it per chime
   would put both on the path of a cue that has to land at the moment somebody
   walks in.
   */
  private static var soundIds: [String: SystemSoundID] = [:]

  /** The rendered files, keyed the same way, so both arms share one render. */
  private static var soundFiles: [String: URL] = [:]

  /** The rendered file for one kind at one amplitude and lead, on first use. */
  private func chimeFile(kind: String, amplitude: Double, lead: Double) -> URL? {
    let key = Self.chimeKey(kind: kind, amplitude: amplitude, lead: lead)
    if let existing = Self.soundFiles[key] { return existing }
    guard
      let url = Self.renderChime(kind: kind, amplitude: amplitude, lead: lead)
    else {
      return nil
    }
    Self.soundFiles[key] = url
    return url
  }

  /** The system-sound id for an already-rendered file. */
  private func chimeSound(url: URL) -> SystemSoundID? {
    let key = url.lastPathComponent
    if let existing = Self.soundIds[key] { return existing }
    var id: SystemSoundID = 0
    let status = AudioServicesCreateSystemSoundID(url as CFURL, &id)
    guard status == kAudioServicesNoError else { return nil }
    Self.declareNotAUISound(id)
    Self.soundIds[key] = id
    return id
  }

  /**
   The same file through `AVAudioPlayer` at full gain, which is the other arm
   of the comparison.

   **It exists because the samples were measured and the ear disagreed.** The
   renderer was compiled and run on its own: the peak sweep spans a real 15dB,
   −15.7 dBFS at the shipping 0.18 up to −0.8 dBFS at full scale. A phone
   reported all five as much the same and all five as very quiet. Two readings
   that cannot both be about the same signal path — so the path is the
   variable, and this is the second value of it.

   **`AudioServicesPlaySystemSound` takes a sound id and nothing else.** There
   is no gain argument in the signature, and the sound goes out the alert path
   rather than the media one, which is a level this app does not set and cannot
   read. That is fine for a cue that only has to be noticed and fatal for one
   that has to be *heard*, and nothing renderable fixes it.

   **`AVAudioPlayer` was ruled out on a premise that does not hold.** The
   comment above `chime` said it configures `AVAudioSession` itself, which
   would have made it a fourth writer to the process-wide configuration
   POSTMORTEM-echo.md is about. `AVAudioPlayer.h` has no category or activation
   API on it at all — it reads `channelAssignments` off the session and
   observes interruptions, and that is the whole of its contact with it. It
   plays into the session this app already holds, and it has `volume`, "nominal
   range … 0.0 to 1.0", which is the knob the other path does not have.

   `expo-audio` is a different question and the original objection stands for
   it: that one does manage the session. This is the bare player.

   Held in a property because a local one deallocates at the end of this
   function and takes the sound with it — the classic way this fails silently,
   which is the last thing this investigation needs another of.
   */
  private func playThroughPlayer(_ url: URL) -> Bool {
    do {
      let player = try AVAudioPlayer(contentsOf: url)
      player.volume = 1.0
      player.prepareToPlay()
      self.player = player
      return player.play()
    } catch {
      return false
    }
  }

  /**
   Takes the sound out of the *user interface sounds* class, which it is in by
   default and does not belong in.

   `kAudioServicesPropertyIsUISound` is 1 unless you say otherwise, and the
   header is explicit about what that buys: the sound "will respect the 'Play
   user interface sounds effects' check box … and be silent when the user turns
   off UI sounds". Set to 0 and it "always be[s] heard … regardless of user's
   setting".

   **That setting is about keyboard clicks, and this is not a keyboard click.**
   A presence chime is the app answering a question the person deliberately
   asked — who just came in — and a cue that disappears because of a preference
   nobody associates with this app is indistinguishable, from the inside, from
   a cue that is broken. This app has already spent builds on exactly that
   confusion once, with haptics during recording.

   **It is a candidate explanation for *quiet*, not only for *absent*.** A
   UI-class sound is levelled by the system rather than by the media volume, so
   a phone whose ringer is low plays it low however loud the samples are. This
   is the half of that which can be fixed from here; the other half is the
   amplitude.

   The status is deliberately ignored. A refusal here costs audibility, which
   is the very thing being measured on a phone, and there is nothing sensible
   to do about it at render time.
   */
  private static func declareNotAUISound(_ id: SystemSoundID) {
    var sound = id
    var off: UInt32 = 0
    AudioServicesSetProperty(
      kAudioServicesPropertyIsUISound,
      UInt32(MemoryLayout<SystemSoundID>.size),
      &sound,
      UInt32(MemoryLayout<UInt32>.size),
      &off
    )
  }

  /**
   One string for a kind at an amplitude, used as both cache key and filename.

   Two decimal places, which is finer than an ear can tell apart and coarse
   enough that a float's last bit cannot mint a second entry for the same
   sound.
   */
  private static func chimeKey(
    kind: String, amplitude: Double, lead: Double
  ) -> String {
    let peak = Int((clampAmplitude(amplitude) * 100).rounded())
    let silence = Int((clampLead(lead) * 1000).rounded())
    return "\(kind)-\(peak)-\(silence)"
  }

  /**
   Amplitude as the renderer will actually use it.

   A peak above 1.0 clips into a buzz rather than getting louder, and a
   non-positive one is a silence that looks exactly like a broken cue — so the
   argument is pinned into the range where it means what it says.
   */
  private static func clampAmplitude(_ raw: Double) -> Double {
    guard raw.isFinite else { return chimeAmplitude }
    return max(0.01, min(1.0, raw))
  }

  /**
   Lead-in as the renderer will actually use it.

   Zero is allowed and is the point — it is the control the sweep is judged
   against, the cue as it was before any of this. The ceiling is a second,
   which is far past any plausible route ramp and already long enough that the
   cue would feel broken.
   */
  private static func clampLead(_ raw: Double) -> Double {
    guard raw.isFinite else { return chimeLeadSeconds }
    return max(0.0, min(1.0, raw))
  }

  private static let chimeSampleRate = 44_100.0
  private static let chimeNoteSeconds = 0.09
  /**
   Silence in front of every chime, so that the notes are not what the output
   route wakes up on.

   **This is the fix for a cue that was quiet once and loud twice**, reported
   from the audio lab on 2026-09-15: a single tap was barely audible, a second
   tap straight after was normal, and the five peaks in the sweep sounded much
   the same as each other. All three are one mechanism.
   `AudioServicesPlaySystemSound` on an idle route makes iOS power the output
   path up, and that ramp takes on the order of a hundred milliseconds — into
   which this cue was delivering a sound a hundred and eighty long, starting at
   full amplitude five milliseconds in. Most of the first tap was spent on the
   amplifier coming up. The second tap landed while the route was still live
   from the first, which is the level the file actually has.

   **And it is why the peak dial looked broken.** When the ramp shapes most of
   a short sound, what an ear is comparing is the ramp and not the samples, so
   0.18 and full scale arrive nearly identical. A sweep run over a cold route
   measures the route.

   Silence costs nothing but delay, and this much of it is under the time it
   takes to notice somebody has walked in. It is deliberately longer than the
   ramp rather than tuned to it: the ramp is not a published number, it varies
   by route, and being generous here is free where being exact is not.
   */
  private static let chimeLeadSeconds = 0.18
  /**
   The peak the app plays at, and what a non-finite argument falls back to.

   **Chosen for *subtle*, which is in the request, and reported from a phone as
   too quiet to notice** — so since 2026-09-15 the peak is an argument and this
   is only where the dial starts. The lab sweeps it; when an ear has picked a
   number this line is what changes, and the sweep goes with the candidates.

   **It is the only lever there is.** `AudioServicesPlaySystemSound` takes no
   volume and obeys no per-app gain — it plays the file at whatever level the
   route is already at. Louder means louder samples, which is this.
   */
  private static let chimeAmplitude = 0.18

  private static let noteE5 = 659.25
  private static let noteA5 = 880.0
  private static let noteCS5 = 554.37

  /**
   What each kind is made of, which is the whole difference between them.

   **`in` and `out` are the same two notes reversed**, which is what makes them
   a pair rather than two unrelated beeps: E5 then A5 going in, A5 then E5
   coming out. Somebody hears the second one once and already knows what it
   means, because it is audibly the first one backwards.

   **`nearby` is neither, and must not be either.** Stepping to the edge of a
   room is not arriving in it, and until this table existed it *sounded* like
   arriving — `usePresenceChime` fired the rising chime for a declaration, so
   the two were indistinguishable to everybody in the room. A single note is
   the shape that says *half of that pair* without anybody being taught it.

   **The three `nearby-*` rows are candidates, and are temporary.** They are
   here so the choice can be made through a phone's speaker, which is the only
   room the sound has to work in; a tone picked on desk speakers is picked in
   the wrong one. `nearby` is the alias the app plays, and it points at the
   winner. When the ear has chosen, the losers go and this paragraph goes with
   them.
   */
  private static let chimeNotes: [String: [Double]] = [
    "in": [noteE5, noteA5],
    "out": [noteA5, noteE5],
    "nearby": [noteE5],
    "nearby-a": [noteE5],
    "nearby-b": [noteA5, noteA5],
    "nearby-c": [noteCS5, noteCS5],
  ]

  /**
   One kind, as a 16-bit mono WAV on disk.

   Each note is a sine under a 5ms attack and an exponential decay — struck
   rather than switched on. The attack is not a nicety: a sine starting at full
   amplitude begins on a discontinuity, and the click that produces is the part
   a listener would notice.
   */
  private static func renderChime(
    kind: String, amplitude: Double, lead: Double
  ) -> URL? {
    guard let notes = chimeNotes[kind] else { return nil }
    let peak = clampAmplitude(amplitude)
    let silence = clampLead(lead)
    let perNote = Int(chimeSampleRate * chimeNoteSeconds)
    let leadFrames = Int(chimeSampleRate * silence)

    var samples: [Int16] = []
    samples.reserveCapacity(leadFrames + perNote * notes.count)
    // The route wakes up on this, rather than on the first note.
    samples.append(contentsOf: repeatElement(0, count: leadFrames))
    for note in notes {
      for frame in 0..<perNote {
        let t = Double(frame) / chimeSampleRate
        let attack = min(1.0, t / 0.005)
        let decay = exp(-t * 18.0)
        let value = sin(2.0 * Double.pi * note * t) * attack * decay * peak
        samples.append(Int16(max(-1.0, min(1.0, value)) * 32_767.0))
      }
    }

    var data = Data()
    func append16(_ value: UInt16) {
      withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }
    func append32(_ value: UInt32) {
      withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
    }

    let rate = UInt32(chimeSampleRate)
    let bytes = UInt32(samples.count * 2)
    data.append(contentsOf: Array("RIFF".utf8))
    append32(36 + bytes)
    data.append(contentsOf: Array("WAVE".utf8))
    data.append(contentsOf: Array("fmt ".utf8))
    append32(16)  // PCM header length
    append16(1)   // uncompressed
    append16(1)   // mono
    append32(rate)
    append32(rate * 2)  // bytes per second
    append16(2)         // bytes per frame
    append16(16)        // bits per sample
    data.append(contentsOf: Array("data".utf8))
    append32(bytes)
    for sample in samples {
      withUnsafeBytes(of: sample.littleEndian) { data.append(contentsOf: $0) }
    }

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(
        "chime-\(chimeKey(kind: kind, amplitude: peak, lead: silence)).wav"
      )
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      // The cue is an extra. A temporary directory that cannot be written to
      // is a real problem and this is not the place it should surface.
      return nil
    }
    return url
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
  /**
   The inverse of `optionNames`, for the lab.

   **Unknown names are dropped rather than rejected**, deliberately: a typo in a
   switch label should produce a trial whose readback disagrees with what was
   asked, which is visible in the log, rather than an exception that looks like
   iOS refusing the configuration. The two failures are not the same and the
   experiment has to be able to tell them apart.
   */
  private static func options(_ names: [String]) -> AVAudioSession.CategoryOptions {
    var options: AVAudioSession.CategoryOptions = []
    for name in names {
      switch name {
      case "mixWithOthers": options.insert(.mixWithOthers)
      case "duckOthers": options.insert(.duckOthers)
      case "allowBluetooth": options.insert(.allowBluetooth)
      case "allowBluetoothA2DP": options.insert(.allowBluetoothA2DP)
      case "allowAirPlay": options.insert(.allowAirPlay)
      case "defaultToSpeaker": options.insert(.defaultToSpeaker)
      case "interruptSpokenAudioAndMixWithOthers":
        options.insert(.interruptSpokenAudioAndMixWithOthers)
      default: break
      }
    }
    return options
  }

  /** Category by name, defaulting to `playback` — the one that takes least. */
  private static func category(_ name: String) -> AVAudioSession.Category {
    switch name {
    case "playAndRecord": return .playAndRecord
    case "record": return .record
    case "multiRoute": return .multiRoute
    case "ambient": return .ambient
    case "soloAmbient": return .soloAmbient
    default: return .playback
    }
  }

  /**
   Mode by name, defaulting to `default`.

   `voiceChat`, `videoChat` and `gameChat` are the voice-processing family —
   the ones that switch on the system echo canceller and, per Apple's own
   documentation of `mixWithOthers`, the ones whose presence is suspected of
   overriding it. They are here so that the control row of the matrix can be
   run, not because the app should be asking for them from this screen.
   */
  private static func mode(_ name: String) -> AVAudioSession.Mode {
    switch name {
    case "voiceChat": return .voiceChat
    case "videoChat": return .videoChat
    case "gameChat": return .gameChat
    case "spokenAudio": return .spokenAudio
    case "voicePrompt": return .voicePrompt
    case "measurement": return .measurement
    case "moviePlayback": return .moviePlayback
    case "videoRecording": return .videoRecording
    default: return .default
    }
  }

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

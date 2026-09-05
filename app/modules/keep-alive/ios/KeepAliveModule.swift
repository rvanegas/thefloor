import AVFoundation
import ExpoModulesCore

/**
 Plays silence, which is what keeps this process alive while it waits.

 Written 2026-09-05, after a measurement rather than a theory. A phone left
 locked for five minutes while standing alone in an empty channel came back
 `drops 2 (recovered 0, expired 2)`: iOS had suspended the process, the
 websocket died with it, and the grace period ran out. Everybody who then
 stepped into that channel saw a person who was not there.

 **`UIBackgroundModes: ["audio"]` does not prevent this and never did.** The
 entitlement buys the right to keep running *while producing audio*, not the
 right to sit idle in the background. planning/TASKS.md § *Websocket Lost*
 reached the same conclusion from the other end, about a phone call: the app
 "suspends despite the `audio` background mode because the interruption means
 it is no longer playing anything". An empty channel is that state without the
 phone call.

 So this module gives the entitlement something to be true about. One second of
 digital silence on a loop is audio by every measure the system applies, and by
 none that a person can hear.

 **It deliberately does not touch `AVAudioSession`.** The apply effect in
 `useSessionAudio.ts` is the only owner of the session's configuration once a
 connection exists, and that single-writer property is load-bearing — three
 writers already contend for this process-wide object and the last one wins.
 This plays under whatever category the app has already set, which where it
 runs is `playback` with `mixWithOthers`. Two consequences follow from that and
 both are the point: another app's audio is not interrupted, and the Bluetooth
 route stays on A2DP, because what scopes A2DP away is `playAndRecord` rather
 than the act of playing.

 **The buffer is silent by construction and the volume is left alone.** Turning
 the volume to zero as well would be belt and braces that hides a wrong buffer
 rather than preventing one: if these samples were ever not zeros, the right
 outcome is that somebody hears it immediately in testing.

 **Known gap: an interruption stops the player and nothing restarts it.** A
 phone call or an alarm ends playback, and `AVAudioPlayer` does not resume
 itself. The app then suspends as it did before this file existed, which is the
 pre-existing behaviour rather than a new fault — but it means the keep-alive
 does not survive a call, and TASKS.md § *Websocket Lost* stays open.
 */
public class KeepAliveModule: Module {
  private var player: AVAudioPlayer?

  public func definition() -> ModuleDefinition {
    Name("KeepAlive")

    /**
     Starts the loop, and answers whether audio is playing when it returns.

     Idempotent: asking twice is not an error and does not restart anything,
     which matters because the effect that calls this re-runs on a reconnect.
     */
    AsyncFunction("startSilence") { () -> Bool in
      if let player = self.player, player.isPlaying { return true }
      do {
        let player = try AVAudioPlayer(data: Self.silentWAV())
        // Negative means forever. Without it the loop ends after one second
        // and the process becomes suspendable again, silently.
        player.numberOfLoops = -1
        player.prepareToPlay()
        self.player = player
        return player.play()
      } catch {
        // Answering `false` rather than throwing: the caller logs the answer
        // either way, and a keep-alive that could not start is a worse
        // presence rather than a broken app.
        self.player = nil
        return false
      }
    }

    AsyncFunction("stopSilence") { () -> Bool in
      guard let player = self.player else { return false }
      player.stop()
      self.player = nil
      return true
    }
  }

  /**
   One second of 44.1 kHz mono 16-bit silence, as a WAV in memory.

   Built here rather than bundled as an asset: a file would have to survive
   `expo prebuild` into the app bundle, and a keep-alive that fails because a
   resource did not copy is a failure with no symptom until somebody's presence
   quietly stops working. Forty-four bytes of header and 88,200 zeros have no
   such failure mode.
   */
  private static func silentWAV() -> Data {
    let sampleRate = 44_100
    let channels = 1
    let bitsPerSample = 16
    let frames = sampleRate
    let dataBytes = frames * channels * bitsPerSample / 8
    let byteRate = sampleRate * channels * bitsPerSample / 8
    let blockAlign = channels * bitsPerSample / 8

    var wav = Data()
    func ascii(_ s: String) { wav.append(contentsOf: Array(s.utf8)) }
    func u32(_ v: Int) { wav.append(contentsOf: withUnsafeBytes(of: UInt32(v).littleEndian, Array.init)) }
    func u16(_ v: Int) { wav.append(contentsOf: withUnsafeBytes(of: UInt16(v).littleEndian, Array.init)) }

    ascii("RIFF")
    u32(36 + dataBytes)
    ascii("WAVE")
    ascii("fmt ")
    u32(16)
    u16(1) // PCM, uncompressed.
    u16(channels)
    u32(sampleRate)
    u32(byteRate)
    u16(blockAlign)
    u16(bitsPerSample)
    ascii("data")
    u32(dataBytes)
    wav.append(Data(count: dataBytes))
    return wav
  }
}

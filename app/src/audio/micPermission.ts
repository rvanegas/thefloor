import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Asks Android for the microphone, before anything needs it to already be
 * granted.
 *
 * **This exists because Android has two consumers of `RECORD_AUDIO` and they
 * disagree about when it has to be there.** WebRTC asks for it implicitly, at
 * the moment it opens the microphone, and that is late: the foreground service
 * in `modules/call-service` is started *first*, deliberately — Android 14 wants
 * a `microphone` service started by a process that is about to capture rather
 * than one that already is — and Android 14 refuses to start it unless the
 * permission is already held. So the very first channel a new Android user
 * entered found the permission ungranted, because nothing had yet reached the
 * point of asking for it.
 *
 * Until 2026-09-10 that refusal was an uncaught `SecurityException` and the app
 * died on the spot; the two Kotlin changes beside this one mean it is now
 * merely a channel with no notification behind it, which dies when the user
 * switches apps. Asking here is what makes it neither.
 *
 * **iOS is not this**, and answers `true` without asking. Its microphone
 * prompt is raised by `NSMicrophoneUsageDescription` when the track opens,
 * nothing is gated on holding it in advance, and there is no second consumer to
 * be out of step with.
 *
 * Never throws, and answers `false` rather than guessing. A refusal is a
 * channel that works on screen and cannot be heard, which is a state the audio
 * hook already renders — see `status: 'denied'` in `useSessionAudio`.
 */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    // Asked only when it is not already held. `request` on a permission the
    // user has permanently refused resolves `never_ask_again` without showing
    // anything, so this is not the thing that stops a dialog on every entry —
    // but it does stop a round trip through the native bridge on every one.
    if (already) return true;
    const answer = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    return answer === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

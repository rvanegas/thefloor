import { Platform } from 'react-native';

/**
 * The Android foreground service, which is what keeps a channel alive when the
 * app is not on screen.
 *
 * See `android/src/main/java/expo/modules/callservice/CallService.kt` for what
 * it does and why it has to exist at all. In short: iOS declares
 * `UIBackgroundModes: ["audio"]` and the system does the rest, and Android has
 * nothing of the sort — a process capturing audio with no visible foreground
 * component is killed, which on hardware presents as *the call drops when I
 * switch apps*.
 *
 * **Everything here is a no-op that answers `false` off Android**, on the same
 * reasoning as `modules/audio-route`: it is a *local* native module, so it is
 * absent under jest, absent on iOS and on the web, and absent in any build
 * where autolinking did not pick it up. None of those may be able to take a
 * call down — a channel with no notification behind it still works for as long
 * as the app is on screen, which is every case except the one this fixes.
 */

interface NativeCallService {
  startCallService(title: string, body: string): Promise<boolean>;
  stopCallService(): Promise<boolean>;
}

function load(): NativeCallService | null {
  if (Platform.OS !== 'android') return null;
  try {
    // Required lazily and defensively, exactly as `audio-route` is: a local
    // module that failed to link throws at *import* time, which would take the
    // whole audio hook with it rather than merely losing the service.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('CallService') as NativeCallService;
  } catch {
    return null;
  }
}

const native = load();

/**
 * What the notification says.
 *
 * Here rather than in Kotlin so that the words are somewhere a reader of this
 * app can find them, and **deliberately without the channel's name**. A
 * foreground-service notification is visible on the lock screen for as long as
 * the channel is open; iOS shows nothing equivalent, so putting a channel name
 * there would be this app disclosing on one platform what it does not on the
 * other, to whoever picks the phone up.
 */
const TITLE = 'In a channel';
const BODY = 'The Floor is open. Tap to come back.';

/**
 * Asks Android to keep this process alive while a channel is open.
 *
 * **Call it while the app is foregrounded.** From Android 12 the system
 * refuses a foreground service started from the background, and from 14 a
 * `microphone` one is refused unless `RECORD_AUDIO` is already granted. Both
 * come back as `false` rather than as a throw; there is nothing useful to do
 * about either beyond not crashing, and the channel still works on screen.
 *
 * Idempotent: starting a service that is already running re-delivers the
 * intent and changes nothing else.
 *
 * @returns whether the service was started. False also covers iOS, the web and
 * jest, where there is no module and nothing to start.
 */
export async function startCallService(): Promise<boolean> {
  try {
    return (await native?.startCallService(TITLE, BODY)) ?? false;
  } catch {
    return false;
  }
}

/**
 * Lets the process be killed again.
 *
 * Idempotent and safe to call having never started anything, which is what
 * lets the caller keep no state about whether the service is up.
 *
 * @returns whether the stop was delivered; false off Android.
 */
export async function stopCallService(): Promise<boolean> {
  try {
    return (await native?.stopCallService()) ?? false;
  } catch {
    return false;
  }
}

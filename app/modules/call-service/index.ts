import { Platform } from 'react-native';

/**
 * The Android foreground service, which is what keeps a channel alive when the
 * app is not on screen.
 *
 * See `android/src/main/java/expo/modules/callservice/CallService.kt` for what
 * it does and why it has to exist at all. In short: Android has nothing like
 * iOS's `UIBackgroundModes` — a process capturing audio with no visible
 * foreground component is killed, which on hardware presents as *the call
 * drops when I switch apps*.
 *
 * **This used to say that on iOS "the system does the rest", and that was
 * measured false on 2026-09-05.** The entitlement keeps a process alive while
 * it is *producing audio*, which a channel with nobody in it is not: a phone
 * locked for five minutes alone in an empty channel came back
 * `drops 2 (recovered 0, expired 2)`. The two platforms want the same thing for
 * opposite reasons — Android a visible component so it may keep a process that
 * is capturing, iOS audio so it may keep a process that has an entitlement.
 *
 * **`modules/keep-alive` was the iOS half and no longer exists**, deleted whole
 * on 2026-09-08 because it played silence when `hasAudio` was false and both
 * states that reached are now either a claim or deliberately suspended — see
 * `decisions/2026-09-08-stepping-in-and-nearby.md`. This comment went on
 * pointing at it for nine days. There is no iOS counterpart to this service
 * today.
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
 *
 * **That reason expired on 2026-09-17 and the name has not been added anyway.**
 * iOS now shows an equivalent — `modules/live-activity`, which puts a card on
 * the lock screen headed by the channel's name — so the asymmetry this
 * omission was protecting no longer exists, and consistency now argues the
 * other way. It was left alone because *what a stranger holding the phone may
 * read* is a disclosure decision rather than a consistency one, and changing
 * it quietly in the commit that removed its justification would be making that
 * decision by accident. Either both surfaces name the channel or neither
 * should; see
 * `planning/decisions/2026-09-17-the-lock-screen-carries-two-controls.md`
 * § *What was left open*.
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

import { Platform } from 'react-native';
import { AudioSession } from '@livekit/react-native';

/**
 * Shows iOS's own output picker.
 *
 * Deliberately the system sheet — an `AVRoutePickerView`, the same control
 * AirPlay puts everywhere — rather than a list of our own. We could not build a
 * list if we wanted one: nothing in this stack enumerates the outputs that are
 * *available*. `getAudioOutputs` offers iOS two values, `default` and
 * `force_speaker`; `enumerateDevices` returns the built-in microphone and no
 * outputs at all; `AudioRouteModule` reads `currentRoute` and so says what is
 * in use but never what could be. The system sheet needs none of that; it knows
 * what is connected.
 *
 * **It sends audio to another device, and that is the whole of what it does.**
 * A Bluetooth speaker across a room, a car, an AirPlay receiver — a want the
 * default cannot infer.
 *
 * **It cannot choose between the earpiece and the loudspeaker**, established
 * 2026-09-03 by a user in exactly that position: the sheet lists destinations,
 * and the two built-in ports are not separate entries in it. That was the job
 * it was added for, so the probation it was added under was measuring something
 * it could never have passed. Recovery from the earpiece is `routeRecovery.ts`
 * now, automatically. See planning/backlog/.
 */
export async function showRoutePicker(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await AudioSession.showAudioRoutePicker();
}

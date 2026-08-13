import { Platform } from 'react-native';
import { AudioSession } from '@livekit/react-native';

/**
 * Shows iOS's own output picker.
 *
 * Deliberately the system sheet — an `AVRoutePickerView`, the same control
 * AirPlay puts everywhere — rather than a list of our own. We could not build a
 * list if we wanted one: nothing in this stack tells JavaScript what outputs
 * exist. `selectAudioOutput` offers a blind speaker/default toggle,
 * `enumerateDevices` returns the built-in microphone and no outputs at all, and
 * neither package surfaces the current route. The system sheet needs none of
 * that; it knows what is connected.
 *
 * **Expected to be removed.** The default should be right on its own —
 * `defaultToSpeaker` gives the loudspeaker rather than the earpiece, and yields
 * to headphones — so this exists to make a wrong route recoverable by whoever
 * is hearing it, rather than by a release. If nobody reaches for it, that is
 * evidence the default is working and this can go. See planning/BACKLOG.md.
 */
export async function showRoutePicker(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await AudioSession.showAudioRoutePicker();
}

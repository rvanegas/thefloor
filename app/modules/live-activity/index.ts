import { Platform } from 'react-native';

/**
 * The card on the lock screen, and the two controls on it.
 *
 * A Live Activity rather than a notification, and the choice was forced rather
 * than preferred. The design is *a mute button, greyed when unavailable, plus a
 * tap that opens the channel* — and `UNNotificationAction` has no disabled
 * state. Expressing "you cannot unmute right now" through a notification means
 * swapping the category to one without the button, so the control **vanishes**
 * and the card changes shape under somebody's thumb. ActivityKit is SwiftUI:
 * `.disabled(true)` greys it in place, same size, same position. See
 * planning/decisions/2026-09-17-the-lock-screen-carries-two-controls.md.
 *
 * The second reason is permission. A Live Activity needs none, where a
 * notification needs the one this app treats as hard-won — so the notification
 * version would have been missing for exactly the people who declined
 * notifications, which is not a coincidence about who wants a control that is
 * not a notification.
 *
 * **What this does not do is open the microphone.** Nothing here crosses the
 * boundary iOS refused on 2026-09-05: a self-muted member still has
 * `micNeeded` true, so the session is already `CALL` and stays there — see
 * `audio/useSessionAudio.ts`, where `wantFor` is passed `micNeeded` and the
 * comment beside it says a self-mute does not reach the category. Unmuting
 * from a locked screen re-opens a device that was never given up. *Taking the
 * floor* from a locked screen is the thing that would need the PushToTalk
 * entitlement, and is not this.
 *
 * **Everything here is a no-op that answers `false` off iOS**, on the same
 * reasoning as `modules/call-service` and `modules/audio-route`: it is a
 * *local* native module, so it is absent under jest, absent on Android and on
 * the web, and absent in any build where autolinking did not pick it up. None
 * of those can take a channel down — the card is a convenience over a
 * conversation that works without it.
 */

/** What the card says, which is the whole of what the extension renders. */
export interface LockScreenState {
  /** Which channel to come back to. Carried into the deep link on a tap. */
  channelId: string;
  /**
   * The channel's name, shown on the card.
   *
   * **Whether this should be here at all is a decision, not a detail.**
   * `modules/call-service` deliberately omits it from the Android
   * notification, on the ground that iOS showed nothing equivalent and naming
   * a channel on one platform and not the other discloses more to whoever
   * picks the phone up. That asymmetry is what this module removes, so the
   * name is passed on both or neither — see the decision file above, which
   * settles it as *both*.
   */
  channelName: string;
  /**
   * Whether you are being heard, and the word is deliberately the icon's
   * rather than the reducer's.
   *
   * `ui/ChannelView.tsx` draws the footer microphone from three causes — you
   * self-muted, the device has no input, somebody else's claim is silencing
   * you — under one meaning, *you are not being heard*. The card shows the
   * same fact, so it takes the same derivation and not `selfMuted` alone. A
   * reader who wires this to the reducer's flag will be wrong about two of
   * the three.
   */
  muted: boolean;
  /**
   * Whether the button is live or grey.
   *
   * False covers every reason the footer control is disabled: no input
   * device, not present, or the floor-holder trying to mute themselves. The
   * card offers **no sentence saying why** — there is no room for one, and
   * being refused is the ordinary condition on this surface rather than an
   * error. That is an amendment to planning/STYLE.md's rule that a disabled
   * control is accompanied by a reason, and it is written down there.
   * Assessing what is going on is what the tap is for.
   */
  canToggle: boolean;
}

interface NativeLiveActivity {
  show(state: LockScreenState): Promise<boolean>;
  hide(): Promise<boolean>;
  addListener(event: string): void;
  removeListeners(count: number): void;
}

function load(): NativeLiveActivity | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Required lazily and defensively, exactly as `audio-route` and
    // `call-service` are: a local module that failed to link throws at
    // *import* time, which here would take `App.tsx` down rather than merely
    // losing the card.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('LiveActivity') as NativeLiveActivity;
  } catch {
    return null;
  }
}

const native = load();

/**
 * Puts the card up, or moves what is already on it.
 *
 * **One call for both, deliberately.** The caller is an effect that runs on
 * every snapshot, and it should not have to remember whether it has started
 * anything — the Swift side keeps the activity token and decides between
 * `request` and `update` from whether it holds one. A caller that kept that
 * state would have two copies of it, and the copies would disagree the first
 * time iOS ended an activity on its own.
 *
 * @returns whether the card is up. False also covers Android, the web, jest,
 * and an iOS below 16.1 or with Live Activities switched off for this app —
 * none of which is worth distinguishing here, because there is nothing
 * different to do about any of them.
 */
export async function showLockScreen(state: LockScreenState): Promise<boolean> {
  try {
    return (await native?.show(state)) ?? false;
  } catch {
    return false;
  }
}

/**
 * Takes the card down.
 *
 * Idempotent and safe to call having never shown anything, which is what lets
 * the caller keep no state about whether a card is up.
 */
export async function hideLockScreen(): Promise<boolean> {
  try {
    return (await native?.hide()) ?? false;
  } catch {
    return false;
  }
}

/**
 * The lock screen's Mute button, coming back the other way.
 *
 * The button is an App Intent, and an intent marked `LiveActivityIntent` is
 * performed **in the app's own process** — iOS resumes a suspended app to run
 * it. That is the whole reason this can reach a live LiveKit room at all, and
 * why the app being alive is a premise rather than a hope: it is holding the
 * audio session, which is what the channel is.
 *
 * What arrives is what the person asked for — `muted: true` from a Mute, false
 * from an Unmute — rather than a toggle, because the card and the app can
 * disagree for a moment and the tap should mean what it said on the button.
 *
 * @returns an unsubscribe function, safe to call twice.
 */
export function addLockScreenToggleListener(
  handle: (muted: boolean) => void
): () => void {
  if (!native) return () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventEmitter } = require('expo-modules-core');
    const emitter = new EventEmitter(native as object);
    const subscription = emitter.addListener(
      'onToggleMute',
      (event: { muted?: unknown }) => {
        if (typeof event?.muted === 'boolean') handle(event.muted);
      }
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

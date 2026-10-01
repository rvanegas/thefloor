import { Platform } from 'react-native';

/**
 * The card on the lock screen, and the three controls on it.
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
   * What the microphone control is called, resolved.
   *
   * **The finished word rather than a flag**, for `channelName`'s reason one
   * step further on: the extension is a separate binary with no catalogue in
   * it and no way to reach one, and an `es.lproj` inside the widget would be a
   * second place the app's vocabulary lives and a second place it goes stale.
   * The app knows which language it is speaking and what state the microphone
   * is in, so it sends the sentence.
   */
  micLabel: string;
  /**
   * The same thing said as a state rather than as an act, for the iOS 16 card
   * — which has no button, `Button(intent:)` being iOS 17, and so announces
   * what is true instead of what a tap would do.
   */
  micState: string;
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
  /**
   * What the Out button is called, resolved for `micLabel`'s reason. Read
   * only by the screen reader, the button itself being a glyph.
   */
  outLabel: string;
}

interface NativeLiveActivity {
  show(state: LockScreenState): Promise<boolean>;
  hide(): Promise<boolean>;
  answerStepOut(id: string, reached: boolean): void;
  lastPushToken(): { channelId?: unknown; token?: unknown } | null;
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

/**
 * The lock screen's Out button, coming back the other way — **and answered**.
 *
 * Performed in this process for the Mute button's reason. What is different is
 * that the native side waits to hear whether the step-out reached the socket:
 * a step-out gives up the audio session, after which iOS may suspend the app
 * before the snapshot that takes the card down arrives. So `handle` returns
 * what `act` returned, the intent ends the card itself when that was `true`,
 * and leaves it up when the action was only queued — this device is then still
 * in the room and can still be heard, and the card saying so is the truth. See
 * `targets/lock-screen/StepOutIntent.swift`.
 *
 * A `handle` that throws is answered `false`, for the same reason.
 *
 * @returns an unsubscribe function, safe to call twice.
 */
export function addLockScreenStepOutListener(
  handle: () => boolean
): () => void {
  if (!native) return () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventEmitter } = require('expo-modules-core');
    const emitter = new EventEmitter(native as object);
    const subscription = emitter.addListener(
      'onStepOut',
      (event: { id?: unknown }) => {
        if (typeof event?.id !== 'string') return;
        let reached = false;
        try {
          reached = handle();
        } catch {
          reached = false;
        }
        try {
          native.answerStepOut(event.id, reached);
        } catch {
          // The native side times out on its own and keeps the card.
        }
      }
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

/** A card's ActivityKit push token, and the channel the card is about. */
export interface LockScreenPushToken {
  channelId: string;
  token: string;
}

/**
 * Each push token a card is given, for the server to end it with.
 *
 * **What lets a card come down on a phone that is not running.** The hook ends
 * the card whenever JavaScript sees the step-out, which a suspended or killed
 * app never does; the server sees every step-out it makes. So the token goes
 * to the server, which sends the end itself — see
 * `server/src/live-activities.ts`.
 *
 * `handle` is called at once with the newest token already issued, if there is
 * one: a card adopted at launch reports its token before anything is
 * listening, and the native side holds it for exactly this.
 *
 * @returns an unsubscribe function, safe to call twice.
 */
export function addLockScreenPushTokenListener(
  handle: (event: LockScreenPushToken) => void
): () => void {
  if (!native) return () => {};
  const forward = (event: { channelId?: unknown; token?: unknown } | null) => {
    if (typeof event?.channelId !== 'string') return;
    if (typeof event.token !== 'string') return;
    handle({ channelId: event.channelId, token: event.token });
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventEmitter } = require('expo-modules-core');
    const emitter = new EventEmitter(native as object);
    const subscription = emitter.addListener('onPushToken', forward);
    try {
      forward(native.lastPushToken());
    } catch {
      // A build without the function has nothing held to report.
    }
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

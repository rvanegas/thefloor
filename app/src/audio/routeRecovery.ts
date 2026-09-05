/**
 * Putting the output back on the loudspeaker when iOS has dropped it to the
 * earpiece.
 *
 * **The category is not the bug and must not be the fix.** `CALL` is
 * `playAndRecord`, and `playAndRecord`'s default output is `builtInReceiver` —
 * the small speaker held to an ear. `defaultToSpeaker` is what converts that
 * default to the loudspeaker, it is in `CALL`, and on 2026-09-03 it was
 * observed working: the route logged `Speaker(Speaker)` at 48 kHz the instant
 * the session became a call. What is missing is not the option but any
 * *re-assertion* of it. iOS re-picks a route on every change — a device
 * arriving, a device leaving, an override being cleared — and nothing in this
 * app has ever restated the configuration when one of those picks landed on the
 * receiver.
 *
 * That is what this restores, and it is deliberately the mildest instrument
 * available. Re-applying the configuration makes iOS re-evaluate the default,
 * so `defaultToSpeaker` wins again *on its own terms*: it still yields to
 * headphones, to Bluetooth, to AirPlay. The blunt alternative —
 * `selectAudioOutput('force_speaker')`, which is `overrideOutputAudioPort` —
 * would take the route away from a headset somebody is wearing, and this
 * subsystem has already lost a tester's headphones once by reaching for the
 * strong tool first. See DECISIONS-2026-08-07-to-2026-08-13.md.
 *
 * **The route picker cannot do this job**, which is worth stating because it
 * looks as though it should. `AVRoutePickerView` lists AirPlay and Bluetooth
 * destinations; the built-in receiver and the built-in speaker are not separate
 * entries in it, so somebody hearing the earpiece can send the audio to a
 * different *device* and still have no way to move it to the speaker on the
 * device in their hand. Reported 2026-09-03, and it is why recovery has to be
 * automatic rather than left to whoever is listening.
 */

/**
 * iOS's port type for the earpiece.
 *
 * `AVAudioSessionPortBuiltInReceiver` is the constant; its raw value is the
 * bare word, and `AudioRouteModule.describe` prints port type first — so an
 * output reads `Receiver(Receiver)` exactly as the loudspeaker reads
 * `Speaker(Speaker)`. Matched on the type rather than the whole string, the
 * name being only there to tell two of a kind apart.
 */
export const RECEIVER_PORT = 'Receiver';

/** Whether the audio is coming out of the earpiece. */
export function onReceiver(outputs: string[]): boolean {
  return outputs.some((port) => port.split('(')[0] === RECEIVER_PORT);
}

/**
 * How many times a single episode may restate the configuration before it
 * stops.
 *
 * **A bound is not caution here, it is a requirement.** Re-applying the
 * configuration is itself a category change, and a category change is a route
 * change, so a re-assertion that does not work would observe the receiver
 * again and re-assert again, for as long as the channel lasted. Two is enough
 * for the case this exists for — iOS picking the receiver once as a fallback —
 * and small enough that a genuinely stuck route produces one line rather than a
 * log full of them.
 */
export const MAX_REASSERTS = 2;

export interface RecoveryState {
  /** Re-assertions made since the route was last somewhere sensible. */
  attempts: number;
  /**
   * Whether this episode has stopped trying.
   *
   * Its own flag rather than `attempts >= MAX_REASSERTS`, so that giving up is
   * announced exactly once. The count alone cannot distinguish the observation
   * that exhausted it from every observation after.
   */
  gaveUp: boolean;
}

export const NO_RECOVERY: RecoveryState = { attempts: 0, gaveUp: false };

export interface RecoveryStep {
  next: RecoveryState;
  /** Whether to restate the session configuration now. */
  reassert: boolean;
  /** A line for the diagnostic log, or null when there is nothing to say. */
  event: string | null;
}

/**
 * What to do about a route that has just changed.
 *
 * A reducer rather than a condition inline, on the same reasoning as
 * `microphoneNeeded` and `sessionFor`: it decides whether to write the audio
 * session, which is the one thing in this subsystem that has repeatedly looked
 * obviously right while being wrong.
 *
 * @param wantsCall whether the session we are asking for is `CALL`. The
 *                  receiver is only ever an eligible output under
 *                  `playAndRecord`, so under `IDLE` — category `playback` —
 *                  there is nothing here to correct and the episode resets.
 *                  Since 2026-09-05 that case is rarer than it was: the
 *                  session is `CALL` whenever this app has any audio, so
 *                  `IDLE` now means a channel with nothing in it to hear.
 */
export function onRouteObserved(
  state: RecoveryState,
  outputs: string[],
  wantsCall: boolean
): RecoveryStep {
  // A route that is not the earpiece ends the episode, whatever it was. This
  // is the reset that lets the next fallback be corrected too, and it is why
  // the state is per-episode rather than per-connection.
  if (!wantsCall || !onReceiver(outputs)) {
    return { next: NO_RECOVERY, reassert: false, event: null };
  }
  if (state.gaveUp) return { next: state, reassert: false, event: null };
  if (state.attempts >= MAX_REASSERTS) {
    return {
      next: { ...state, gaveUp: true },
      reassert: false,
      // Worth a line precisely because it is the case this fix does not cover:
      // the route is on the earpiece, restating the configuration did not move
      // it, and something else is holding it there.
      event: `route stuck on receiver after ${MAX_REASSERTS} re-asserts`,
    };
  }
  const attempts = state.attempts + 1;
  return {
    next: { attempts, gaveUp: false },
    reassert: true,
    event: `route on receiver, re-asserting CALL (${attempts}/${MAX_REASSERTS})`,
  };
}

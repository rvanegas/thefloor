import { useEffect, useRef, useState } from 'react';
import { canSetSelfMute } from '../../../core/channel';
import { DISCONNECT_GRACE_MS } from '../../../core/constants';
import { describeChannel } from '../../../core/naming';
import type { ChannelView } from '../../../core/protocol';
import type { UserId } from '../../../core/types';
import {
  addLockScreenToggleListener,
  hideLockScreen,
  showLockScreen,
  type LockScreenState,
} from '../../modules/live-activity';

/**
 * Keeps the lock screen's card in step with the channel, and brings its Mute
 * button back the other way.
 *
 * **Held above the channel screen, in `App.tsx`, for the reason
 * `useSilencedNudge` is**: presence is not a screen. Somebody who walked back
 * to Home is still in the room, and a card mounted inside `ChannelView` would
 * switch itself off for precisely the people who are not looking at it — which
 * on a *locked* phone is everybody. It follows `live`, the channel this device
 * is standing in, exactly as the audio does.
 *
 * The card exists iff there is a channel to be in *and* this device is still
 * in touch with it — `inTouch`, which the caller answers from the control
 * socket and the media room together. There is deliberately no check on
 * whether the screen is actually locked: iOS decides when to draw a Live
 * Activity, and a card that tried to appear at the lock would have to guess at
 * a moment the system already knows.
 *
 * **Neither condition survives the process, and the card does.** An activity
 * outlives the app that started it, so a force-quit or a crash leaves one on
 * the lock screen describing a room the server has since stepped this account
 * out of. Nothing in JavaScript can reach that card; the answer is in
 * `targets/lock-screen/LockScreenController.swift`, which adopts whatever is
 * still running at launch and ends the card when the process is told it is
 * going away.
 */

/** What the two controls read, derived once so the hook and its test agree. */
export function lockScreenStateFor(
  view: ChannelView,
  me: UserId,
  inputAvailable: boolean | undefined
): LockScreenState {
  const channel = view.channel;
  /**
   * **No microphone is the same as muted**, the same equation `ChannelView`
   * makes and for the same reason: this app publishes nothing without an input
   * device, so saying the microphone is open would be false and offering an
   * Unmute that cannot open one would be worse.
   */
  const noInput = inputAvailable === false;
  const muted = noInput || !!channel.selfMuted[me];
  return {
    channelId: channel.id,
    /**
     * The same fallback every other surface uses, rather than the raw field.
     *
     * `channel.name` is null whenever nobody has named the channel, which is
     * most of them, and a card headed `null` — or headed nothing — is worse
     * than one headed by who is in the room. `describeChannel` over the other
     * participants is what the channel header, the list row and the profile
     * card all draw; this is a fourth reader of it and not a fourth rule.
     */
    channelName:
      channel.name ??
      describeChannel(
        view.participants
          .filter((p) => p.id !== me)
          .map((other) => other.displayName)
      ),
    muted,
    /**
     * The footer's guard, minus its presence clause — a non-null channel here
     * already means present *on this device*, which is stricter than the
     * footer's test rather than weaker.
     *
     * **Being silenced does not grey it**, and that is the one case worth
     * stating because it looks like an omission. `canSetSelfMute` refuses only
     * the floor-holder muting themselves; somebody silenced by another's claim
     * may still set their own mute, and what they set is what they are left
     * with when the claim ends. The footer keeps the control live there too,
     * and colours it instead. The card has no colour to spend, so it simply
     * stays live.
     */
    canToggle: !noInput && canSetSelfMute(channel, me, !muted),
  };
}

/**
 * The default `show` and `hide`, hoisted to the module.
 *
 * **Not inline defaults, and the difference is not style.** A default written
 * as `(state) => void showLockScreen(state)` in the parameter list is a new
 * function on every render, so the effect below — which depends on it — would
 * re-run on every render and push the card to ActivityKit several times a
 * second, which is exactly what `key` exists to prevent. The tests would not
 * have caught it: they pass their own stable spies, which is the shape that
 * makes this class of bug invisible.
 */
const SHOW = (state: LockScreenState) => void showLockScreen(state);
const HIDE = () => void hideLockScreen();

export function useLockScreen(
  view: ChannelView | null,
  me: UserId,
  inputAvailable: boolean | undefined,
  inTouch: boolean,
  onSetMute: (channelId: string, muted: boolean) => void,
  show: (state: LockScreenState) => void = SHOW,
  hide: () => void = HIDE,
  subscribe: (
    handle: (muted: boolean) => void
  ) => () => void = addLockScreenToggleListener
): void {
  /**
   * Whether this device has been out of contact long enough that the server
   * has stopped counting it as present.
   *
   * **`view` is the last snapshot that arrived, and a snapshot stops being
   * evidence once nothing is arriving.** Presence is the server's answer, and
   * since 2026-09-08 it is falsified by not being in the media room: a phone
   * that loses the network keeps a `view` saying it is in the room while the
   * server runs the grace down and removes it by `DISCONNECT_EXPIRED`. The
   * conversation carries on without it and the card carries on describing
   * one, with a Mute button that can reach neither end of it.
   *
   * So the card is held for exactly the grace the server gives, and no
   * longer. Held rather than dropped at once because losing touch is
   * ordinarily a blip — a tunnel, a handover, a deploy rounding up to a
   * retry — and a card that flickered off and on at the lock screen for every
   * one of those would be worse than one that is a minute stale. The server
   * makes the same bargain with the same number, which is the point: until it
   * expires this device is still in the room, and after it, it is not.
   */
  const [adrift, setAdrift] = useState(false);
  useEffect(() => {
    if (inTouch) {
      setAdrift(false);
      return;
    }
    const timer = setTimeout(() => setAdrift(true), DISCONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [inTouch]);

  const state =
    view && !adrift ? lockScreenStateFor(view, me, inputAvailable) : null;

  /**
   * The payload as a string, which is what the effect actually depends on.
   *
   * `lockScreenStateFor` builds a fresh object every render, so depending on
   * the object would push a new activity to ActivityKit on every snapshot —
   * several a second in a busy room, for a card that had not changed. Four
   * scalars compare fine as one string, and the string is stable exactly when
   * the card is.
   */
  const key = state ? JSON.stringify(state) : null;
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!key || !latest.current) {
      hide();
      return;
    }
    show(latest.current);
    // No teardown that hides, deliberately: this effect re-runs whenever the
    // card's contents move, and hiding on the way out of each run would take
    // the card down and put it back up for an ordinary mute. The card is taken
    // down by the `!key` branch above — which is what a step-out produces —
    // and by the unmount below.
  }, [key, show, hide]);

  useEffect(() => {
    return () => hide();
    // Unmount only. `hide` is stable by default and the caller passing an
    // unstable one would merely take the card down and let the effect above
    // put it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = useRef(onSetMute);
  act.current = onSetMute;

  useEffect(() => {
    return subscribe((muted) => {
      /**
       * Read at the moment the tap arrives rather than closed over.
       *
       * The subscription outlives every snapshot, and the channel it should
       * act on is the one being stood in *now* — not the one that was live
       * when the listener was attached. A tap from a locked phone can arrive
       * minutes later.
       */
      const current = latest.current;
      if (!current || !current.canToggle) return;
      // The button said what it would do, so the tap carries an intent rather
      // than a toggle. Honouring the word on the button is what keeps a stale
      // card from inverting somebody's microphone.
      act.current(current.channelId, muted);
    });
  }, [subscribe]);
}

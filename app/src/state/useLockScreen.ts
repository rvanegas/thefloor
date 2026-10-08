import { useEffect, useRef, useState } from 'react';
import { canSetSelfMute } from '../../../core/channel';
import { DISCONNECT_GRACE_MS } from '../../../core/constants';
import { describeChannel } from '../../../core/naming';
import type { ChannelView } from '../../../core/protocol';
import type { UserId } from '../../../core/types';
import { AppState } from 'react-native';
import { recordEvent } from '../audio/diagnostics';
import { useText, type Strings } from '../i18n';
import {
  addLockScreenPushTokenListener,
  addLockScreenStepOutListener,
  addLockScreenToggleListener,
  hideLockScreen,
  showLockScreen,
  type LockScreenPushToken,
  type LockScreenState,
} from '../../modules/live-activity';

/**
 * Keeps the lock screen's card in step with the channel, and brings its Mute
 * and Out buttons back the other way.
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
 * out of. Nothing in JavaScript can reach that card. Two things can:
 * `targets/lock-screen/LockScreenController.swift`, which adopts whatever is
 * still running at launch and ends the card when the process is told it is
 * going away; and the server, which since 2026-10-01 ends the card by push
 * when it steps this device out — see `useLockScreenPushToken`.
 */

/**
 * How long the card outlives losing touch with the room, which is **less than
 * the server's grace, and on purpose**.
 *
 * Until 2026-10-01 it was `DISCONNECT_GRACE_MS` exactly, on the argument that
 * the two ends should make one bargain with one number. They do not start
 * their clocks at the same moment. The server's runs from when *it* notices —
 * a socket closing, the room losing the phone — and the phone's from when
 * `inTouch` goes false, which waits on its own heartbeat to time out: up to
 * `HEARTBEAT_TIMEOUT_MS` of silence, checked every `HEARTBEAT_INTERVAL_MS`,
 * and longer still when it is the media room that has to give up first. So a
 * card held for the same minute came down *after* the server had stepped the
 * account out, every time, and the lock screen spent those seconds offering a
 * Mute to a room that had already watched its owner leave.
 *
 * Fifteen seconds early covers that lag with room to spare, and still holds
 * the card through a deploy as seen from a phone — a restart the phone rides
 * out in twenty-five seconds — and through an ordinary tunnel. A card that
 * comes down while the server still counts the phone present is the right
 * error to make: the phone is, by then, unable to hear the room either.
 *
 * **This is the half that works while the app runs.** A suspended or killed
 * app runs no timer at all, and its card is ended by the server instead — see
 * `useLockScreenPushToken` below.
 */
export const LOCK_SCREEN_HOLD_MS = DISCONNECT_GRACE_MS - 15_000;

/**
 * A channel's *title* (GLOSSARY.md): its name, or, for an unnamed channel, who
 * else is in it.
 *
 * `channel.name` is null whenever nobody has named the channel, which is most
 * of them, and a surface headed `null` — or headed nothing — is worse than one
 * headed by who is in the room. `describeChannel` over the other participants
 * is what the channel header, the list row and the profile card all draw; the
 * lock screen card and the *reported call* share this one copy of it.
 */
export function channelTitleFor(
  view: ChannelView,
  me: UserId,
  naming: Strings['naming']
): string {
  return (
    view.channel.name ??
    describeChannel(
      view.participants.filter((p) => p.id !== me).map((other) => other.displayName),
      naming
    )
  );
}

/** What the controls read, derived once so the hook and its test agree. */
export function lockScreenStateFor(
  view: ChannelView,
  me: UserId,
  inputAvailable: boolean | undefined,
  words: Strings['lockScreen'],
  naming: Strings['naming']
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
     * The channel's title — see `channelTitleFor`. The field keeps its older
     * word because the widget extension decodes it by that key.
     */
    channelName: channelTitleFor(view, me, naming),
    micLabel: muted ? words.unmute() : words.mute(),
    micState: muted ? words.microphoneMuted() : words.microphoneOpen(),
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
    outLabel: words.out(),
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
  /**
   * Steps this account out of the channel, returning whether the action
   * reached the socket — `act`'s own answer, which the card needs. See
   * `addLockScreenStepOutListener`.
   */
  onStepOut: (channelId: string) => boolean,
  show: (state: LockScreenState) => void = SHOW,
  hide: () => void = HIDE,
  subscribe: (
    handle: (muted: boolean) => void
  ) => () => void = addLockScreenToggleListener,
  subscribeStepOut: (
    handle: () => boolean
  ) => () => void = addLockScreenStepOutListener
): void {
  const words = useText().lockScreen;
  const naming = useText().naming;
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
   * So the card is held for a little less than the grace the server gives —
   * `LOCK_SCREEN_HOLD_MS`, which says why less. Held rather than dropped at
   * once because losing touch is ordinarily a blip — a tunnel, a handover, a
   * deploy rounding up to a retry — and a card that flickered off and on at
   * the lock screen for every one of those would be worse than one that is
   * most of a minute stale.
   */
  const [adrift, setAdrift] = useState(false);
  useEffect(() => {
    if (inTouch) {
      setAdrift(false);
      return;
    }
    const timer = setTimeout(() => setAdrift(true), LOCK_SCREEN_HOLD_MS);
    return () => clearTimeout(timer);
  }, [inTouch]);

  const state =
    view && !adrift
      ? lockScreenStateFor(view, me, inputAvailable, words, naming)
      : null;

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
    // TEMPORARY, with the tap's line below: when the card actually moved.
    recordEvent(`lock card muted=${latest.current.muted} app=${AppState.currentState}`);
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
      // TEMPORARY, for task/a-lock-screen-tap-during-a-reconnect-looks-dead.md:
      // the tap, so the socket's `sent`/`queued` line after it can be told from
      // an in-app Mute. Goes with the fix, with the trace in socket.ts.
      recordEvent(
        `lock tap muted=${muted} canToggle=${current?.canToggle ?? 'none'} app=${AppState.currentState}`
      );
      if (!current || !current.canToggle) return;
      // The button said what it would do, so the tap carries an intent rather
      // than a toggle. Honouring the word on the button is what keeps a stale
      // card from inverting somebody's microphone.
      act.current(current.channelId, muted);
    });
  }, [subscribe]);

  const leave = useRef(onStepOut);
  leave.current = onStepOut;

  useEffect(() => {
    return subscribeStepOut(() => {
      /**
       * Read at the moment the tap arrives, for the Mute button's reason. No
       * card state means there is no channel being stood in, and a card still
       * showing is one iOS has not yet taken down: nothing to step out of, and
       * `false` leaves the card to the hook, which is already ending it.
       *
       * **Never refused otherwise**: the reducer has no refusal for
       * `STEP_OUT`, which is why the button is never grey.
       */
      const current = latest.current;
      if (!current) return false;
      return leave.current(current.channelId);
    });
  }, [subscribeStepOut]);
}

/**
 * Files each lock screen card's push token with the server, which ends the
 * card when it steps this device out — the one ending that still happens when
 * this app is suspended or killed. See `server/src/live-activities.ts`.
 *
 * **Sent while in touch, and kept until it is accepted.** A token arrives a
 * moment after the card goes up, ordinarily with the socket open; one that
 * arrives offline, or whose request fails, is tried again the next time the
 * device is in touch. Only the newest is kept: a newer token is either the
 * same card's reissue or a later card's, and either way the older one is
 * about a card that is no longer the one up.
 *
 * Held in `App.tsx` beside `useLockScreen`, for its reason.
 */
export function useLockScreenPushToken(
  inTouch: boolean,
  file: (event: LockScreenPushToken) => Promise<unknown>,
  subscribe: (
    handle: (event: LockScreenPushToken) => void
  ) => () => void = addLockScreenPushTokenListener
): void {
  const [pending, setPending] = useState<LockScreenPushToken | null>(null);
  const send = useRef(file);
  send.current = file;

  useEffect(() => subscribe(setPending), [subscribe]);

  useEffect(() => {
    if (!pending || !inTouch) return;
    send.current(pending).then(
      () => setPending((current) => (current === pending ? null : current)),
      // Left pending; the next time touch is regained tries it again.
      () => {}
    );
  }, [pending, inTouch]);
}

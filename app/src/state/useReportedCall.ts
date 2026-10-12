import { useEffect, useRef, useState } from 'react';
import {
  addReportedCallEndListener,
  addReportedCallHeldListener,
  addReportedCallMuteListener,
  reportedCallIsHeld,
  setReportedCallMuted,
  setReportedCallTitle,
} from '../../modules/reported-call';
import { recordEvent } from '../audio/diagnostics';

/**
 * What the *reported call* follows, read off the lock screen card's state so
 * that the card and CallKit cannot disagree: `lockScreenStateFor` draws both.
 */
export interface ReportedCallState {
  channelId: string;
  /** The channel's *title*. */
  title: string;
  /** Self-Mute, or no microphone — never Muted-by-Claim or Party-Muted. */
  muted: boolean;
  /** The card's guard: whether this device may set its own mute right now. */
  canToggle: boolean;
  /** Whether the room has this account as *on another call* — the server's view. */
  onAnotherCall: boolean;
}

/** The module's half, a parameter so the tests can stand in for it. */
export interface ReportedCallBridge {
  setTitle: (channelId: string, title: string) => void;
  setMuted: (channelId: string, muted: boolean) => void;
  subscribeMute: (handle: (muted: boolean) => void) => () => void;
  subscribeEnd: (handle: () => void) => () => void;
  isHeld: () => boolean;
  subscribeHeld: (handle: (held: boolean) => void) => () => void;
}

/**
 * Hoisted rather than an inline default, for `useLockScreen`'s reason: a new
 * object every render would re-run the subscriptions every render.
 */
const NATIVE: ReportedCallBridge = {
  setTitle: setReportedCallTitle,
  setMuted: setReportedCallMuted,
  subscribeMute: addReportedCallMuteListener,
  subscribeEnd: addReportedCallEndListener,
  isHeld: reportedCallIsHeld,
  subscribeHeld: addReportedCallHeldListener,
};

/**
 * The *reported call*'s links back to the channel, held in `App.tsx` beside
 * `useLockScreen` for that hook's reason: presence is not a screen.
 *
 * **What it is shown as.** The channel's *title*, passed on whenever it
 * changes, since an unnamed channel's title follows who is in the room, and
 * CallKit shows the newest in Recents, CarPlay and on the Watch.
 *
 * **Its mute, both ways.** CallKit holds a muted flag that CarPlay and the
 * Watch show and set. It follows the app's mute — Self-Mute, or no microphone,
 * exactly what the card shows — and never Muted-by-Claim or Party-Muted, which
 * are other people's doing and which nothing on a car's screen should offer
 * to undo. A system mute that disagrees with the app arrives as the state
 * asked for and is acted on as the card's Mute is: `SET_SELF_MUTE`, when the
 * card's guard allows it. When it does not — the floor-holder muting
 * themselves, or an unmute with no microphone — the app's mute is sent back
 * unchanged, which puts CallKit's flag back where the app is.
 *
 * **Its End, when this app did not ask for it, is stepping out.** CarPlay and
 * the Watch show the call with an End of their own, and *End & Accept* on an
 * incoming call ends it too. Each is the card's Out by another road: a bare
 * `STEP_OUT`. An End with no channel is a call already on its way down.
 *
 * **Being held is said to the room**, as *On another call* on the roster.
 * *Hold & Accept* holds the call, and the module takes it off hold once the
 * other call ends. Each change is sent as `ON_ANOTHER_CALL` whenever it differs
 * from what the room already says, which covers a reconnect's arrival clearing
 * it too. A server that predates the action refuses it and the roster goes on
 * saying *Present*; nothing is sent again until one side changes.
 *
 * Every arrival is read against the state at the moment it arrives, not when
 * it was subscribed.
 */
export function useReportedCall(
  call: ReportedCallState | null,
  onSetMute: (channelId: string, muted: boolean) => void,
  onStepOut: (channelId: string) => void,
  onAnotherCall: (channelId: string, onCall: boolean) => void,
  bridge: ReportedCallBridge = NATIVE
): void {
  const [held, setHeld] = useState(bridge.isHeld);
  const report = useRef(onAnotherCall);
  report.current = onAnotherCall;
  const latest = useRef(call);
  latest.current = call;
  const mute = useRef(onSetMute);
  mute.current = onSetMute;
  const leave = useRef(onStepOut);
  leave.current = onStepOut;

  const channelId = call?.channelId ?? null;
  const title = call?.title ?? null;
  const muted = call?.muted ?? null;
  const roomSays = call?.onAnotherCall ?? null;

  useEffect(() => {
    if (channelId && title) bridge.setTitle(channelId, title);
  }, [channelId, title, bridge]);

  useEffect(() => {
    if (channelId && muted !== null) bridge.setMuted(channelId, muted);
  }, [channelId, muted, bridge]);

  useEffect(
    () =>
      bridge.subscribeMute((asked) => {
        const current = latest.current;
        recordEvent(
          `reported call mute ${asked} from the system, canToggle=${current?.canToggle ?? 'none'}`
        );
        if (!current) return;
        if (!current.canToggle) {
          bridge.setMuted(current.channelId, current.muted);
          return;
        }
        mute.current(current.channelId, asked);
      }),
    [bridge]
  );

  useEffect(
    () =>
      bridge.subscribeHeld((value) => {
        recordEvent(`reported call held=${value}`);
        setHeld(value);
      }),
    [bridge]
  );

  useEffect(() => {
    if (channelId && roomSays !== null && roomSays !== held) {
      report.current(channelId, held);
    }
  }, [channelId, roomSays, held]);

  useEffect(
    () =>
      bridge.subscribeEnd(() => {
        const current = latest.current;
        recordEvent(`reported call ended by the system, channel=${current?.channelId ?? 'none'}`);
        if (current) leave.current(current.channelId);
      }),
    [bridge]
  );
}

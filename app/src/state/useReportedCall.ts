import { useEffect, useRef } from 'react';
import {
  addReportedCallEndListener,
  nameReportedCall,
} from '../../modules/reported-call';
import { recordEvent } from '../audio/diagnostics';

/**
 * The *reported call*'s two links back to the channel, held in `App.tsx` beside
 * `useLockScreen` for that hook's reason: presence is not a screen.
 *
 * **What it is called.** The channel's name, given or derived — `name`, which
 * the caller draws with `channelNameFor`, the lock screen card's own copy. It
 * is passed on whenever it changes, since a derived name follows who is in the
 * room, and CallKit shows the newest in Recents, CarPlay and on the Watch.
 *
 * **Its End, when this app did not ask for it, is stepping out.** There is no
 * call screen to end it from — Channel View is that — but CarPlay and the Watch
 * show the call with an End of their own, and *End & Accept* on an incoming
 * call ends it too. Each is the person leaving the channel, so each is the
 * card's Out by another road: a bare `STEP_OUT`, read against the channel at
 * the moment the End arrives. An End with no channel is a call already on its
 * way down, and is left to the hook ending it.
 */
export function useReportedCall(
  channelId: string | null,
  name: string | null,
  onStepOut: (channelId: string) => void,
  subscribe: (handle: () => void) => () => void = addReportedCallEndListener,
  nameCall: (channelId: string, name: string) => void = nameReportedCall
): void {
  const channel = useRef(channelId);
  channel.current = channelId;
  const leave = useRef(onStepOut);
  leave.current = onStepOut;

  useEffect(() => {
    if (channelId && name) nameCall(channelId, name);
  }, [channelId, name, nameCall]);

  useEffect(
    () =>
      subscribe(() => {
        const current = channel.current;
        recordEvent(`reported call ended by the system, channel=${current ?? 'none'}`);
        if (current) leave.current(current);
      }),
    [subscribe]
  );
}

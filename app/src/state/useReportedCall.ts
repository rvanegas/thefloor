import { useEffect, useRef } from 'react';
import {
  addReportedCallEndListener,
  setReportedCallTitle,
} from '../../modules/reported-call';
import { recordEvent } from '../audio/diagnostics';

/**
 * The *reported call*'s two links back to the channel, held in `App.tsx` beside
 * `useLockScreen` for that hook's reason: presence is not a screen.
 *
 * **What it is shown as.** The channel's *title* — its name, or, for an
 * unnamed channel, who else is in it — which the caller draws with
 * `channelTitleFor`, the lock screen card's own copy. It is passed on whenever
 * it changes, since an unnamed channel's title follows who is in the room, and
 * CallKit shows the newest in Recents, CarPlay and on the Watch.
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
  title: string | null,
  onStepOut: (channelId: string) => void,
  subscribe: (handle: () => void) => () => void = addReportedCallEndListener,
  setTitle: (channelId: string, title: string) => void = setReportedCallTitle
): void {
  const channel = useRef(channelId);
  channel.current = channelId;
  const leave = useRef(onStepOut);
  leave.current = onStepOut;

  useEffect(() => {
    if (channelId && title) setTitle(channelId, title);
  }, [channelId, title, setTitle]);

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

import { useEffect, useState } from 'react';

/**
 * Whether being disconnected has lasted long enough to be worth saying.
 *
 * The socket drops routinely and briefly — on every foreground, because iOS
 * suspends the process and the socket does not survive it, and on any change
 * of network. Saying so the instant it happens produces a warning that
 * resolves itself before it can be read, which teaches people to ignore
 * warnings. So it waits, and a reconnect that beats the delay is never
 * mentioned at all.
 *
 * The timer is armed on the transition *into* being offline and cleared on the
 * way out, which is the part that has to be right. Keying it on the exact
 * status instead would restart the delay on every `connecting` → `closed`
 * flap of the reconnect backoff, and a phone with no route to the server would
 * flap its way to never showing the warning at all.
 */
const NOTICE_DELAY_MS = 2_500;

export function useOfflineNotice(status: 'connecting' | 'open' | 'closed') {
  const offline = status !== 'open';
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!offline) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [offline]);

  return show;
}

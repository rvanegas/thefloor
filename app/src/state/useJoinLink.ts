import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { takeJoin, type Join } from '../ui/handover';

/**
 * The *join link* somebody arrived on, by either of its two roads: the
 * community page's `thefloor://j/<code>` after an install, or the code the page
 * left in the tab for the web app. Spent once there is a session, in
 * `AppProvider`.
 *
 * **`useInviteLink`'s design, applied to a second link**, and its comments
 * carry the reasoning: state rather than a module variable so an arrival can
 * wake the effect that spends it, both `Linking` roads because a cold launch
 * reaches no listener, first one in wins, and no `https://` form until there
 * are universal links. Kept apart rather than folded into that hook because
 * the two are different asks — one is a contact, this is a membership — and
 * a link carrying one must never be read as the other.
 */
export function joinOfUrl(url: string | null): Join | null {
  if (!url) return null;
  const match = /^thefloor:\/\/j\/([^/?#]+)/.exec(url);
  if (!match) return null;
  try {
    const code = decodeURIComponent(match[1]);
    return code ? { code } : null;
  } catch {
    return null;
  }
}

export function useJoinLink(): { join: Join | null; clearJoin: () => void } {
  const [join, setJoin] = useState<Join | null>(null);

  useEffect(() => {
    let cancelled = false;
    setJoin((prev) => prev ?? takeJoin());

    void Linking.getInitialURL()
      .then((url) => {
        if (cancelled) return;
        const arrived = joinOfUrl(url);
        if (arrived) setJoin((prev) => prev ?? arrived);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const arrived = joinOfUrl(url);
      if (arrived) setJoin((prev) => prev ?? arrived);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return { join, clearJoin: () => setJoin(null) };
}

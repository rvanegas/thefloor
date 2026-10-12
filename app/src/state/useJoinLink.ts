import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { forgetJoin, peekJoin, type Join } from '../ui/handover';

/**
 * The *join link* somebody arrived on, by either of its roads: the community
 * link itself, `https://<host>/j/<code>`, which iOS hands to the app as a
 * universal link since 2026-10-11; the code the server left in the tab when
 * that address opened in a browser instead; and `thefloor://j/<code>`, which
 * the community page drew until that day and which pages already open in
 * somebody's browser may still offer. Spent once there is a session, in
 * `AppProvider`.
 *
 * **`useInviteLink`'s design, applied to a second link**, and its comments
 * carry the reasoning: state rather than a module variable so an arrival can
 * wake the effect that spends it, both `Linking` roads because a cold launch
 * reaches no listener, and first one in wins. Kept apart rather than folded
 * into that hook because the two are different asks — one is a contact, this
 * is a membership — and a link carrying one must never be read as the other.
 */
export function joinOfUrl(url: string | null): Join | null {
  if (!url) return null;
  // Any host for the https form: iOS delivers only addresses on a domain the
  // build claims, so the host is already vouched for, and naming it here
  // would be a second place the domain is written down.
  const match = /^(?:thefloor:\/\/|https:\/\/[^/?#]+\/)j\/([^/?#]+)/.exec(url);
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
    setJoin((prev) => prev ?? peekJoin());

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

  return {
    join,
    clearJoin: () => {
      forgetJoin();
      setJoin(null);
    },
  };
}

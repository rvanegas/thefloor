import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { forgetInvite, peekInvite, type Invite } from '../ui/handover';

/**
 * The invitation somebody arrived on, by either of the two roads it can take.
 *
 * **One hook for both, because the thing that spends them is one effect.** A
 * browser leaves the invitation in `sessionStorage` for the tab it hands to —
 * `peekInvite` in `app/src/ui/handover.ts`, written by the server's hand-over
 * page — and a phone gets it as a URL. Those arrive by different mechanisms
 * and mean exactly the same thing, so they are read here and answered once,
 * in `AppProvider`.
 *
 * **The URL is the invite link itself since 2026-10-12**:
 * `https://<host>/i/<username>`, which iOS hands to the app as a universal
 * link, so somebody with the app is a contact on one tap and somebody who
 * installs first taps the same link again after. `thefloor://i/<username>`,
 * which the invite page's *Open in the app* sent until that day, is still
 * read, since a page already open in somebody's browser may still offer it.
 */

/**
 * The pair in the address, or null.
 *
 * **Matched rather than parsed, which is `channelOfUrl`'s rule and its
 * reasoning applies unchanged** — see `useChannelLink.ts`: `URL` is polyfilled
 * unevenly in React Native and splits host from path differently between
 * platforms for a custom scheme, so `thefloor://i/annak/042317` would put `i`
 * in the host on one and in the path on another.
 *
 * **Neither half is checked beyond being non-empty.** The server is the judge
 * of a pin — `Accounts.invitePinState` owns whether one is live, unspent and
 * this account's — and a client that pre-refused anything would be a second
 * copy of that rule, wrong the moment the first one changed. What this refuses
 * is a URL this app did not write, not an invitation it doubts.
 */
export function inviteOfUrl(url: string | null): Invite | null {
  if (!url) return null;
  // The universal link, from any host for `joinOfUrl`'s reason: iOS delivers
  // only addresses on a domain the build claims. **A pin in it is dropped.**
  // Taking a link up by username accepts for any account and is never
  // refused as used, which a spent pin would be, and the invite page has not
  // passed a pin on since it stopped asking for one.
  const web = /^https:\/\/[^/?#]+\/i\/([^/?#]+)/.exec(url);
  if (web) {
    try {
      const username = decodeURIComponent(web[1]);
      return username ? { username } : null;
    } catch {
      return null;
    }
  }
  const match = /^thefloor:\/\/i\/([^/?#]+)(?:\/([^/?#]+))?/.exec(url);
  if (!match) return null;
  try {
    const username = decodeURIComponent(match[1]);
    if (!username) return null;
    // **The pin is optional, and a second segment is the only thing that can
    // be one.** A link is `/i/<username>` now; one that still carries six
    // digits was minted before 2026-09-25 and is passed on unchanged, the
    // server honouring both. See planning/SHIMS.md.
    const pin = match[2] ? decodeURIComponent(match[2]) : '';
    return pin ? { username, pin } : { username };
  } catch {
    // A malformed escape is a URL this app did not write.
    return null;
  }
}

/**
 * Holds an invitation until there is a session to spend it against.
 *
 * **State rather than a variable somebody reads, and that is the whole design
 * question here.** The obvious alternative was to give `handover.ts` a
 * module-level hold so that one `peekInvite` answered both roads — one
 * function, one shape. It does not work, because a module variable cannot tell
 * React that something arrived, so the effect that spends an invitation would
 * only find it if it happened to re-run. Two ordinary arrivals never do:
 *
 * - **Already signed in at launch.** The token is restored before
 *   `getInitialURL` resolves, so the effect fires once, finds nothing, and is
 *   never woken again.
 * - **Signed in, backgrounded, tapped, returned.** The URL arrives on the
 *   listener and the token has not changed, so nothing re-runs at all. This is
 *   the designed walk — install, open, sign in, back to Safari, tap — so it is
 *   the case that must not be the broken one.
 *
 * `useState` fixes both by construction. What `handover.ts` keeps is what it
 * is good at: two documents on one origin handing to each other, which a
 * native deep link is not.
 *
 * **Both `Linking` roads, for the reason `useChannelLink` gives.** A URL
 * tapped while the app is alive arrives on the listener; one tapped from a
 * cold launch is waiting in `getInitialURL` and reaches no listener at all.
 * Reading only the first works in every test and fails for the person whose
 * phone had killed the app — which, after an install, is everybody.
 *
 * **First one in wins.** Every writer goes through `prev ?? …`, so a cold
 * launch carrying both a URL and something in storage settles rather than
 * races. It also means a second URL arriving while one is still unspent is
 * dropped, which is right: the pin in hand is the one somebody is mid-way
 * through accepting.
 */
export function useInviteLink(): {
  invite: Invite | null;
  clearInvite: () => void;
} {
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The browser's road. Read here rather than where it is spent so that
    // there is one holder; `prev ??` so a later read cannot replace what an
    // earlier one found.
    setInvite((prev) => prev ?? peekInvite());

    void Linking.getInitialURL()
      .then((url) => {
        if (cancelled) return;
        const arrived = inviteOfUrl(url);
        if (arrived) setInvite((prev) => prev ?? arrived);
      })
      // Caught for the reason `useChannelLink` catches: this runs at launch,
      // where an unhandled rejection is a failure to start rather than a
      // missed tap.
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const arrived = inviteOfUrl(url);
      if (arrived) setInvite((prev) => prev ?? arrived);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return {
    invite,
    // Cleared *before* the request goes out, from state and from the tab: a
    // pinned invitation is single use, so one still held while a request is in
    // flight is one a re-render can spend twice. A pin-less one would survive
    // that, but spending it once is the point.
    clearInvite: () => {
      forgetInvite();
      setInvite(null);
    },
  };
}

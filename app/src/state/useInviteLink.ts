import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { takeInvite, type Invite } from '../ui/handover';

/**
 * The invitation somebody arrived on, by either of the two roads it can take.
 *
 * **One hook for both, because the thing that spends them is one effect.** A
 * browser leaves the invitation in `sessionStorage` for the tab it hands to —
 * `takeInvite` in `app/src/ui/handover.ts`, written by the invite page itself —
 * and a phone gets it as a URL. Those arrive by different mechanisms and mean
 * exactly the same thing, so they are read here and answered once, in
 * `AppProvider`.
 *
 * **The URL road exists because the install used to lose the invitation.** A
 * trip through the App Store does not carry the address, so somebody who
 * installed rather than accepting in the browser arrived with no relationship
 * and nothing to show for having been asked; the old page's answer was to tell
 * them to accept first, which cost anybody who did both a second sign-in. The
 * page now leads with the install and asks them to come back to the link and
 * press *Open in the app*. This is the other end of that.
 *
 * **`thefloor://i/<username>`, with an optional trailing pin, and no `https://`
 * form.** A universal link
 * would let the return tap land here without the second press, and is deferred
 * — planning/UNIVERSAL-LINKS.md, where a domain change is now the reason it
 * stays deferred. Until one exists, nothing can deliver an `https://` address
 * to this app, so matching one would be answering a string that never arrives.
 * Do not add it speculatively; add it in the commit that claims the domain.
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
 * module-level hold so that one `takeInvite` answered both roads — one
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

    // The browser's road. Taken here rather than where it is spent so that
    // there is one holder — and `takeInvite` is one-shot, so the `prev ??`
    // matters even for this call: a second invocation returns null and must
    // not be allowed to wipe what the first one took.
    setInvite((prev) => prev ?? takeInvite());

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
    // Cleared *before* the request goes out, which is `takeInvite`'s own rule:
    // what this opens is single use, so an invitation still held while a
    // request is in flight is one a re-render can spend twice — and the second
    // attempt reports that the invitation was already used, to the very person
    // who just used it.
    clearInvite: () => setInvite(null),
  };
}

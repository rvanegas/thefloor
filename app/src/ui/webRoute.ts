/**
 * The address of a screen, and the screen at an address.
 *
 * **Pure, and separated from the wiring on purpose.** Nothing here touches
 * `location`, `history` or React, so the mapping can be tested — which matters
 * more than usual, because the half that *does* touch the browser is a few
 * lines that no test in this repository can reach. Getting the table right in
 * something testable leaves only the plumbing unproven.
 *
 * **No address carries an id.** Not an account, not a channel, not a
 * recording. An id reaches this app from a snapshot or from a handover in
 * `sessionStorage`, never from a URL, and since 2026-09-04 not from a
 * notification either. See decisions/DECISIONS.md § *An address names a place
 * and never an id*.
 *
 * Web only. Native has no addresses and wants none.
 */
import type { Detail, List } from './detail';

/**
 * The part of `Detail` an address can name.
 *
 * Three of the six, and the line between them is the id: settings, standings
 * and support are one of a kind each, so naming them names them. A channel and
 * a profile are one of many and would need an id to be told apart, so an
 * address says nothing about them at all — a channel open over the Channels
 * tab is `/channels`, the same as nothing open.
 *
 * That is a loss and it is the *only* one: everything this can say, it can say
 * again on the way back. See `addressOf`.
 */
export type Named = 'none' | 'settings' | 'standings' | 'support';

/**
 * Where you are, in the two parts the app is actually in.
 *
 * **A frame and what is open over it**, which is the shape of the application
 * rather than a route table somebody chose: the tier always holds one of its
 * two lists — that is `list`, and it never goes away — and a detail is opened
 * over it on a phone or beside it in a split, and closed again.
 *
 * It was six flat screens until 2026-09-04, with `home` for the Channels tab,
 * and that shape could not say both things at once: `/settings` named what was
 * open and lost which tab you had left behind, so reloading put you back on
 * Channels. Two axes say both, and neither has to outrank the other.
 */
export interface Address {
  list: List;
  named: Named;
}

/**
 * Where the app is mounted — `/app` or `/beta`, and `''` when a dev server
 * serves it at the root.
 *
 * Inlined at export by `bin/deploy-web`, which already knows the answer
 * because it is the same value it puts in `experiments.baseUrl`. Read from the
 * environment rather than sniffed from `location`, because sniffing would have
 * to know the set of prefixes and would be wrong the first time a third train
 * existed.
 */
export const BASE = (process.env.EXPO_PUBLIC_BASE ?? '').replace(/\/$/, '');

/**
 * The one path each address has. Eight of them, and no trailing slashes.
 *
 * `/channels`, `/contacts`, and `/<either>/settings`, `/standings`,
 * `/support`. The frame is always the first segment, including when something
 * is open over it — which is the whole point of the nesting: the tab you were
 * on is not something opening Settings should cost you.
 */
export function pathOf(address: Address): string {
  const frame = `${BASE}/${address.list}`;
  return address.named === 'none' ? frame : `${frame}/${address.named}`;
}

/**
 * The address a path names, and **the channel list for anything else**.
 *
 * Deliberately forgiving. This runs against whatever somebody has in the
 * address bar — a truncated paste, a link from a version with different names,
 * a path the server's catch-all served the shell for — and none of those is
 * worth an error screen when the list is a correct and useful answer.
 *
 * Two inputs are forgiven on purpose rather than by accident. **The bare base**
 * — `/app`, or `/` on a dev server — is where every door forwards to (`/open`,
 * the landing page, the signed-in redirect), and it means the Channels tab;
 * `pathOf` never produces it, so it is an accepted input rather than half of a
 * round trip. And **`/c/<id>`**, which is what a channel's address was until
 * 2026-09-04: it lands on the list, which is where it would land even if it
 * were parsed, nothing downstream being able to restore the id.
 */
export function addressOfPath(path: string): Address {
  const withoutQuery = path.split(/[?#]/)[0] ?? '';
  const rest = withoutQuery.startsWith(BASE)
    ? withoutQuery.slice(BASE.length)
    : withoutQuery;
  const parts = rest.split('/').filter(Boolean);

  const list: List | null =
    parts[0] === 'channels' ? 'channels' : parts[0] === 'contacts' ? 'contacts' : null;
  if (!list) return { list: 'channels', named: 'none' };

  if (parts.length === 1) return { list, named: 'none' };
  if (parts.length === 2) {
    if (parts[1] === 'settings') return { list, named: 'settings' };
    if (parts[1] === 'standings') return { list, named: 'standings' };
    if (parts[1] === 'support') return { list, named: 'support' };
  }
  return { list, named: 'none' };
}

/**
 * What an address can say about where you are, which is **less than this
 * says** — and less in exactly one way.
 *
 * The frame survives whole. What is open survives when it has a name, and
 * becomes `'none'` when it would have needed an id: a channel and a profile
 * read as the tab they were opened over, which is truthful and is what the
 * other pane is showing.
 *
 * **Why a profile has no address**, since this file used to argue it badly.
 * The old reason was that a link would put an id in the bar for somebody the
 * account may no longer be a contact of by the time it was followed. That does
 * not survive reading the route: `GET /profiles/:id` answers 404 for a profile
 * you may not read *and* for one that does not exist, identically and on
 * purpose, so a stale link leaks nothing and fails no worse than a typo. The
 * reason is the general one — an account id means nothing to a person, a
 * profile is not somewhere you send anybody, and what you would send them is
 * the channel.
 */
export function addressOf(detail: Detail, list: List): Address {
  switch (detail.kind) {
    case 'settings':
      return { list, named: 'settings' };
    case 'standings':
      return { list, named: 'standings' };
    case 'support':
      return { list, named: 'support' };
    case 'channel':
    case 'profile':
    case 'none':
      return { list, named: 'none' };
  }
}

/**
 * What an address asks to be showing.
 *
 * **Every address restores**, which is the property the nesting bought and the
 * reason nothing in the wiring has to normalise what it reads:
 * `addressOf(detailOfAddress(a))` is `a` for all eight. The projection above
 * is lossy on the way out and total on the way back, so an address is never
 * something the app can be handed and fail to honour.
 */
export function detailOfAddress(address: Address): {
  detail: Detail;
  list: List;
} {
  switch (address.named) {
    case 'settings':
      return { detail: { kind: 'settings' }, list: address.list };
    case 'standings':
      return { detail: { kind: 'standings' }, list: address.list };
    case 'support':
      return { detail: { kind: 'support' }, list: address.list };
    case 'none':
      return { detail: { kind: 'none' }, list: address.list };
  }
}

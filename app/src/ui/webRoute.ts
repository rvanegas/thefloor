/**
 * The address of a screen, and the screen at an address.
 *
 * **Pure, and separated from the wiring on purpose.** Nothing here touches
 * `location`, `history` or React, so the mapping can be tested — which matters
 * more than usual, because the half that *does* touch the browser is a few
 * lines that no test in this repository can reach. Getting the table right in
 * something testable leaves only the plumbing unproven.
 *
 * `App.tsx` routes with a channel id and four booleans, resolved in a fixed
 * order. That order is the model: it is what decides which screen is on top
 * when two are notionally open, and `screenOf` states it once rather than
 * letting the URL and the renderer each have an opinion.
 *
 * **Above the breakpoint the order resolves the detail pane, and nothing here
 * changed.** A wide window shows Home beside whatever you have open, and the
 * list is not a screen and has no address — you cannot navigate to it, it is
 * simply there. So the address still names exactly one screen, `/settings` is
 * still Settings, and Home is still the state with nothing set, which on an
 * iPad is a live list on the left and an empty pane on the right.
 *
 * Web only. Native has no addresses and wants none.
 */

export type Screen =
  | { kind: 'home' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'settings' }
  | { kind: 'standings' }
  | { kind: 'support' }
  | { kind: 'contacts' };

/** The navigation state `App.tsx` holds, as one value. */
export interface Nav {
  channelId: string | null;
  settingsOpen: boolean;
  leaderboardOpen: boolean;
  supportOpen: boolean;
  contactsOpen: boolean;
}

export const NOWHERE: Nav = {
  channelId: null,
  settingsOpen: false,
  leaderboardOpen: false,
  supportOpen: false,
  contactsOpen: false,
};

/**
 * Which screen is showing, in `App.tsx`'s own order of precedence.
 *
 * A channel beats everything because it comes first in the chain — and that is
 * not arbitrary: presence is not navigation, so the channel screen is the one
 * you are *in* while the others are things opened over Home. In a split, over
 * the detail pane; Home itself is never what this is choosing between.
 */
export function screenOf(nav: Nav): Screen {
  if (nav.channelId) return { kind: 'channel', channelId: nav.channelId };
  if (nav.settingsOpen) return { kind: 'settings' };
  if (nav.leaderboardOpen) return { kind: 'standings' };
  if (nav.supportOpen) return { kind: 'support' };
  if (nav.contactsOpen) return { kind: 'contacts' };
  return { kind: 'home' };
}

/**
 * The state that shows a screen.
 *
 * Exactly one flag is ever set, which is what makes this a round trip rather
 * than an approximation: `screenOf(navOf(s))` is `s` for every screen.
 */
export function navOf(screen: Screen): Nav {
  switch (screen.kind) {
    case 'channel':
      return { ...NOWHERE, channelId: screen.channelId };
    case 'settings':
      return { ...NOWHERE, settingsOpen: true };
    case 'standings':
      return { ...NOWHERE, leaderboardOpen: true };
    case 'support':
      return { ...NOWHERE, supportOpen: true };
    case 'contacts':
      return { ...NOWHERE, contactsOpen: true };
    case 'home':
      return NOWHERE;
  }
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

/** `/app/c/chan_abc`. Trailing slashes are never produced. */
export function pathOf(screen: Screen): string {
  switch (screen.kind) {
    case 'channel':
      return `${BASE}/c/${encodeURIComponent(screen.channelId)}`;
    case 'settings':
      return `${BASE}/settings`;
    case 'standings':
      return `${BASE}/standings`;
    case 'support':
      return `${BASE}/support`;
    case 'contacts':
      return `${BASE}/contacts`;
    case 'home':
      return BASE || '/';
  }
}

/**
 * The screen an address names, and **Home for anything unrecognised**.
 *
 * Deliberately forgiving. This runs against whatever somebody has in the
 * address bar — a truncated paste, a link from a version with different names,
 * a path the server's catch-all served the shell for — and none of those is
 * worth an error screen when Home is a correct and useful answer.
 */
export function screenOfPath(path: string): Screen {
  const withoutQuery = path.split(/[?#]/)[0] ?? '';
  const rest = withoutQuery.startsWith(BASE)
    ? withoutQuery.slice(BASE.length)
    : withoutQuery;
  const parts = rest.split('/').filter(Boolean);

  if (parts.length === 0) return { kind: 'home' };
  if (parts[0] === 'c' && parts[1]) {
    return { kind: 'channel', channelId: decodeURIComponent(parts[1]) };
  }
  if (parts.length === 1) {
    if (parts[0] === 'settings') return { kind: 'settings' };
    if (parts[0] === 'standings') return { kind: 'standings' };
    if (parts[0] === 'support') return { kind: 'support' };
    if (parts[0] === 'contacts') return { kind: 'contacts' };
  }
  return { kind: 'home' };
}

/**
 * Whether the address that opened this tab meant to *arrive*, not merely look.
 *
 * **A one-shot intent rather than part of the address**, which is why it is a
 * query parameter and why nothing in `pathOf` ever writes one. A channel's
 * address says which room; whether you walked into it is something that
 * happened once, and an address that kept saying so would step you back in
 * every time you pressed Back.
 *
 * It exists for one caller: a guest who has just accepted a contact request
 * and been made a member. They were audible in that room a second ago, so
 * landing outside it and being asked to step in would be the app forgetting
 * what it had just watched them do. `tapToStepIn` is not consulted — that
 * setting is about a list of rooms where a tap is as likely to be curiosity as
 * intent, and this is not a tap on a list.
 */
export function wantsEntry(search: string): boolean {
  return new URLSearchParams(search).get('enter') === '1';
}

/** Whether two screens are the same place, so history is not pushed twice. */
export function sameScreen(a: Screen, b: Screen): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'channel' && b.kind === 'channel') {
    return a.channelId === b.channelId;
  }
  return true;
}

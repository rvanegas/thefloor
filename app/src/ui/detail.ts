/**
 * The one thing the detail pane is showing.
 *
 * **A value, where this used to be a precedence chain.** `App.tsx` held a
 * channel id and four booleans and resolved them in a fixed order, which
 * answers *which of several open things is on top* — and that is not the
 * question. The question is *what did you last ask for*, and a chain cannot
 * answer it: tapping a channel while a profile was open did nothing visible,
 * because profile outranked channel and nothing had cleared it. Three call
 * sites cleared other state by hand to work around exactly that, and the ones
 * that forgot were the faults.
 *
 * Assigning one value makes overriding structural. There is no order to get
 * right, no state left set behind what is showing, and no handler that has to
 * remember what else might be open.
 *
 * **The contact list is deliberately not in here.** It is the pane on the
 * left, and below the breakpoint it is what that pane becomes when there is
 * only one — see `App.tsx` — so it is a property of the list rather than of
 * the detail.
 *
 * Pure, and separated from `App.tsx` for the reason `webRoute.ts` is: the
 * mapping between this and an address is a table worth testing, and the
 * component around it is not reachable by any test in this repository.
 */
import { NOWHERE, screenOf, type Nav } from './webRoute';

export type Detail =
  | { kind: 'none' }
  | { kind: 'channel'; channelId: string }
  | { kind: 'profile'; id: string; name: string }
  | { kind: 'settings' }
  | { kind: 'standings' }
  | { kind: 'support' };

/** Nothing open, which on a phone means the list and in a split an empty pane. */
export const NO_DETAIL: Detail = { kind: 'none' };

/**
 * The address state for what is open, which is `Nav` because the browser's
 * half of this was already written against it.
 *
 * **A profile has no address and never had one.** It is reached from a card in
 * a list rather than from a link, and giving it one would put an id in the bar
 * for a person the account may no longer be a contact of by the time somebody
 * follows it. So it maps to the same `Nav` as nothing at all, which is what
 * shipped before this type existed — the address then names the list beside
 * it, which is truthful and is what the other pane is showing.
 */
export function navOfDetail(detail: Detail, contactsOpen: boolean): Nav {
  const base = { ...NOWHERE, contactsOpen };
  switch (detail.kind) {
    case 'channel':
      return { ...base, channelId: detail.channelId };
    case 'settings':
      return { ...base, settingsOpen: true };
    case 'standings':
      return { ...base, leaderboardOpen: true };
    case 'support':
      return { ...base, supportOpen: true };
    case 'profile':
    case 'none':
      return base;
  }
}

/**
 * What an address asks to be showing, and whether the list beside it is the
 * contact list.
 *
 * `screenOf` rather than a second chain: the browser's order of precedence is
 * stated once, in the file that owns addresses, and this reads it. An address
 * only ever sets one flag anyway, so the order is a formality here — but a
 * second copy of it is how the two ends start to disagree.
 */
export function detailOfNav(nav: Nav): {
  detail: Detail;
  contactsOpen: boolean;
} {
  const screen = screenOf(nav);
  switch (screen.kind) {
    case 'channel':
      return {
        detail: { kind: 'channel', channelId: screen.channelId },
        contactsOpen: false,
      };
    case 'settings':
      return { detail: { kind: 'settings' }, contactsOpen: false };
    case 'standings':
      return { detail: { kind: 'standings' }, contactsOpen: false };
    case 'support':
      return { detail: { kind: 'support' }, contactsOpen: false };
    case 'contacts':
      return { detail: NO_DETAIL, contactsOpen: true };
    case 'home':
      return { detail: NO_DETAIL, contactsOpen: false };
  }
}

/** The channel whose screen is showing, or none — read in four places. */
export function channelOf(detail: Detail): string | null {
  return detail.kind === 'channel' ? detail.channelId : null;
}

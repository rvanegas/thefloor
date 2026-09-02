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
 * **Which list is showing is deliberately not in here.** That is `List`
 * below: the tier holds two peers and one of them is in its body, which is a
 * property of the frame the whole application sits in rather than of anything
 * somebody opened. Opened things are what this type is for.
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

/** Nothing open, which on a phone means the tier and in a split an empty pane. */
export const NO_DETAIL: Detail = { kind: 'none' };

/**
 * Which of the tier's two lists is in its body.
 *
 * **Two peers, not a root and a child**, which is the whole of what the name
 * change on 2026-09-01 says. This was `contactsOpen`, a boolean, back when the
 * channel list was the app's root and the contacts were a screen you opened
 * over it; nothing about the pair justified which way round that was. `'home'`
 * would name the tier that contains both, which is not what this chooses
 * between. See planning/decisions/DECISIONS.md § *The tier above both lists*.
 *
 * The address needs no new axis for it, which is the one place the iPad split
 * and the tier fit together rather than fight: `/` is the Channels tab and
 * `/contacts` the other, exactly as before, and `webRoute.ts` is untouched.
 */
export type List = 'channels' | 'contacts';

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
export function navOfDetail(detail: Detail, list: List): Nav {
  const base = { ...NOWHERE, contactsOpen: list === 'contacts' };
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
 * What an address asks to be showing, and which list the tier is showing.
 *
 * `screenOf` rather than a second chain: the browser's order of precedence is
 * stated once, in the file that owns addresses, and this reads it. An address
 * only ever sets one flag anyway, so the order is a formality here — but a
 * second copy of it is how the two ends start to disagree.
 */
export function detailOfNav(nav: Nav): {
  detail: Detail;
  list: List;
} {
  const screen = screenOf(nav);
  switch (screen.kind) {
    case 'channel':
      return {
        detail: { kind: 'channel', channelId: screen.channelId },
        list: 'channels',
      };
    case 'settings':
      return { detail: { kind: 'settings' }, list: 'channels' };
    case 'standings':
      return { detail: { kind: 'standings' }, list: 'channels' };
    case 'support':
      return { detail: { kind: 'support' }, list: 'channels' };
    case 'contacts':
      return { detail: NO_DETAIL, list: 'contacts' };
    case 'home':
      return { detail: NO_DETAIL, list: 'channels' };
  }
}

/** The channel whose screen is showing, or none — read in four places. */
export function channelOf(detail: Detail): string | null {
  return detail.kind === 'channel' ? detail.channelId : null;
}

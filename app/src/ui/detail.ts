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
 * **The address is not this file's business**, since 2026-09-04. `webRoute.ts`
 * imports these two types and owns the projection onto an address, which is
 * the right way round: what the app shows is the primary thing, and what a URL
 * can say about it is a view of that. It read the other way for three days and
 * put a `Nav` between them.
 *
 * Pure, and separated from `App.tsx` because a value with this many cases is
 * worth testing and the component around it is not reachable by any test in
 * this repository.
 */
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
 * **It is the first half of every address**, which is the shape the addresses
 * took on 2026-09-04: `/channels` and `/contacts` are the two frames, and
 * anything an address can name beyond them hangs off one of the two. Nothing
 * here needs to know that; `webRoute.ts` does.
 */
export type List = 'channels' | 'contacts';

/** The channel whose screen is showing, or none — read in four places. */
export function channelOf(detail: Detail): string | null {
  return detail.kind === 'channel' ? detail.channelId : null;
}

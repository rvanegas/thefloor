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
  /**
   * `edit` opens your own profile already editing, and is the state it was
   * opened in rather than a mode kept from out here — see ProfileView. It
   * never reaches an address: `webRoute.ts` cannot name a profile at all,
   * which is the same reason none of the ids here do.
   */
  | { kind: 'profile'; id: string; name: string; edit?: boolean }
  | { kind: 'settings' }
  | { kind: 'standings' }
  | { kind: 'support' }
  /**
   * Asking The Floor a question, and reading the answers. Reached from the
   * foot of the tier, beside Chip in, and addressable — it is a place, one of
   * a kind, and a link to it is a useful thing to be able to hand somebody.
   */
  | { kind: 'help' }
  /**
   * The audio bench, reached from Home for a `debug` account and from nowhere
   * else. Temporary by construction: it exists to answer whether a capturing
   * session can mix with another app, and goes when that has an answer.
   *
   * It reaches no address — `webRoute.ts` does not name it — for the same
   * reason a profile does not: it is not a place anybody should arrive at from
   * a link.
   */
  | { kind: 'audiolab' }
  /**
   * Why notifications matter, shown before the system is allowed to ask. It is
   * opened from the banner on the tier and by the app itself when the moment
   * has come — see `state/notificationAsk.ts` — and it is the one thing here
   * that can appear without anybody having tapped anything.
   */
  | { kind: 'notifications' };

/** Nothing open, which on a phone means the tier and in a split an empty pane. */
export const NO_DETAIL: Detail = { kind: 'none' };

/**
 * Which of the tier's bodies is showing.
 *
 * **Peers, not a root and a child**, which is the whole of what the name
 * change on 2026-09-01 says. This was `contactsOpen`, a boolean, back when the
 * channel list was the app's root and the contacts were a screen you opened
 * over it; nothing about the pair justified which way round that was. `'home'`
 * would name the tier that contains both, which is not what this chooses
 * between. See planning/decisions/DECISIONS.md § *The tier above both lists*.
 *
 * **`'support'` is the third, and it is not a list.** The name stayed because
 * what this type chooses between is which body the tier is showing, and that
 * question is the same whether the body enumerates people or not. Help and
 * Chip in used to be the tail of whichever list was up, below everything
 * somebody had come to do; they are about the application rather than about
 * either list, and a tab is what says so without making them any louder.
 *
 * **It is the first half of every address**, which is the shape the addresses
 * took on 2026-09-04: `/channels`, `/contacts` and `/support` are the frames,
 * and anything an address can name beyond them hangs off one of them. Nothing
 * here needs to know that; `webRoute.ts` does.
 */
export type List = 'channels' | 'contacts' | 'support';

/** The channel whose screen is showing, or none — read in four places. */
export function channelOf(detail: Detail): string | null {
  return detail.kind === 'channel' ? detail.channelId : null;
}

import type { NearbyWhen } from '../../../core/types';

/**
 * The five answers to *when can you come in*, as this app offers them — on
 * your own People card while you are nearby, and three of them on a ping's
 * notification.
 *
 * **Choices rather than `NearbyWhen`s**, because two of them are the same
 * kind: *20 min* and *1 hr* are both `at`, and which one somebody tapped is
 * what the chooser shows as chosen. `now` is plain *Nearby*, with no *when*
 * at all — the answer that withdraws the others.
 */
export type NearbyChoice = 'now' | 'soon' | 'in20' | 'in60' | 'flow';

export const NEARBY_CHOICES: readonly NearbyChoice[] = [
  'now',
  'soon',
  'in20',
  'in60',
  'flow',
];

/**
 * The *when* a choice sends, against the server's clock — `now` being
 * `serverNow()`, so a phone whose own clock is off does not promise twenty
 * minutes and arrive as eighteen. Null for `now`, which sends none.
 */
export function whenFor(choice: NearbyChoice, now: number): NearbyWhen | null {
  switch (choice) {
    case 'now':
      return null;
    case 'soon':
      return { kind: 'soon' };
    case 'flow':
      return { kind: 'flow' };
    case 'in20':
      return { kind: 'at', at: now + 20 * 60_000 };
    case 'in60':
      return { kind: 'at', at: now + 60 * 60_000 };
  }
}

/**
 * Which choice a *when* on the snapshot reads as, or null for neither of the
 * timed two — the chooser then shows no answer, which STYLE.md § *Segmented*
 * allows a `choice` and which is the honest reading of a time this device
 * did not pick.
 *
 * `picked` is the timed choice this device last made here; a time is matched
 * to it rather than guessed from the distance left, which shrinks.
 */
export function choiceFor(
  when: NearbyWhen | null,
  picked: NearbyChoice | null
): NearbyChoice | null {
  if (when === null) return 'now';
  if (when.kind === 'soon') return 'soon';
  if (when.kind === 'flow') return 'flow';
  return picked === 'in20' || picked === 'in60' ? picked : null;
}

/**
 * The prefix on a notification action's identifier, which carries the choice
 * after it: `nearby:in20`. A prefix rather than the bare word so that nothing
 * else iOS hands back — the default tap, a dismissal — can be mistaken for an
 * answer.
 */
export const NEARBY_ACTION_PREFIX = 'nearby:';

/** The choice a notification action carried, or null for any other response. */
export function choiceOfAction(actionIdentifier: string): NearbyChoice | null {
  if (!actionIdentifier.startsWith(NEARBY_ACTION_PREFIX)) return null;
  const choice = actionIdentifier.slice(NEARBY_ACTION_PREFIX.length);
  return (NEARBY_CHOICES as readonly string[]).includes(choice)
    ? (choice as NearbyChoice)
    : null;
}

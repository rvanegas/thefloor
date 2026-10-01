/**
 * Which accounts may trade a session for one another, without a code.
 *
 * The set is the developer's own accounts — a real one and the test rigs —
 * named by sign-in address in `SWITCH_ACCOUNT_IDENTIFIERS`. Holding a session
 * for any one of them is treated as holding one for all of them, which is
 * exactly what it is when the same person owns every inbox: the switch saves
 * a sign-out, a code and a sign-in, and proves nothing a code would not.
 *
 * **That equivalence is the whole of the security argument, so anything that
 * breaks it is refused here rather than trusted to configuration.** The App
 * Review accounts are the case that matters: their sign-in is published in the
 * review notes, so a review address in the set would hand anybody who reads
 * those notes a session on every other account in it. They are dropped
 * however the set is written, and said so at startup.
 *
 * Unset or empty is off, and is what every box but the developer's runs.
 */

function normalize(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * The configured set, less anything that must never be in it. Compared the
 * way the database compares identifiers — trimmed and case-insensitively.
 *
 * Fewer than two left is nothing at all: a set of one has nowhere to switch to.
 */
export function switchableSet(
  configured: string[],
  review?: { identifier: string; contact?: string }
): { allowed: string[]; refused: string[] } {
  const banned = [review?.identifier, review?.contact]
    .filter((value): value is string => !!value)
    .map(normalize);
  const allowed: string[] = [];
  const refused: string[] = [];
  for (const raw of configured) {
    const identifier = raw.trim();
    if (!identifier) continue;
    if (banned.includes(normalize(identifier))) {
      refused.push(identifier);
      continue;
    }
    if (!allowed.some((kept) => normalize(kept) === normalize(identifier))) {
      allowed.push(identifier);
    }
  }
  return { allowed: allowed.length >= 2 ? allowed : [], refused };
}

/**
 * Where somebody signed in as `identifier` may switch to: everybody else in
 * the set when they are in it, and nobody when they are not.
 */
export function switchTargets(identifier: string, set: string[]): string[] {
  const self = normalize(identifier);
  if (!set.some((member) => normalize(member) === self)) return [];
  return set.filter((member) => normalize(member) !== self);
}

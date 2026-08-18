import { readFileSync } from 'node:fs';

/**
 * What this server is, and what it has promised to keep talking to.
 *
 * Two facts that look unrelated and are the same question from opposite ends:
 * which code is running here, and which clients that code owes an answer to.
 */

/**
 * The oldest iOS build this server still answers correctly.
 *
 * It exists to make one decision decidable. The wire is changed in two steps —
 * teach the server the old shape as well as the new, deploy that, ship the
 * client, and remove the old shape a release later — and the third step has
 * never had a rule saying when it is safe. This is the rule: **a compatibility
 * shim may be deleted once this floor has passed the build that needed it, and
 * not before.** Anything else is a guess about whose phone still has what.
 *
 * A **declaration rather than an enforcement**, and the difference matters.
 * Nothing on the wire carries a build number — the app sends no version header
 * and the server records none — so this cannot be checked against reality, and
 * every claim in the deploy history that build N went on working was reasoned
 * rather than measured. Making it measurable is in BACKLOG.md and is the thing
 * that would give this number a source other than judgement.
 *
 * **Raising it now takes installed apps off the air.** As of 2026-08-17 the
 * client acts on this number: an app whose build is below it replaces itself
 * with a screen saying to update and disconnects, so what used to cost only
 * the right to delete a shim now ends sessions on phones. Read `oldestBuild`
 * and `silentBuilds` on `/healthz` before moving it, and note that every build
 * before 37 is silent — raising the floor past those expires installs nobody
 * can see. See planning/DECISIONS.md.
 *
 * Raising it is the release decision that costs something. Build numbers rise
 * on upload; this rises only when the builds below it are gone from every
 * phone that matters, which after a public release means waiting rather than
 * deciding.
 *
 * 36 because that is the first submitted build and nothing has ever been
 * public. Every earlier build is a TestFlight install on the author's own
 * devices, updatable on demand, and TestFlight expires them in 90 days anyway.
 * The moment 36 is released this number stops being free to move.
 */
export const MIN_SUPPORTED_BUILD = 36;

/**
 * The header an iOS build uses to say which build it is, mirrored as a
 * `?build=` query parameter on the websocket because React Native's WebSocket
 * carries no custom headers portably.
 *
 * Additive and optional, which is the safe half of the two-step: a build that
 * predates it sends nothing and is answered exactly as before. Shipped in
 * build 37. See planning/BACKLOG.md for the shape and planning/DECISIONS.md
 * for why the floor above needed a source other than judgement.
 */
export const BUILD_HEADER = 'x-thefloor-build';

/**
 * What a caller claims its build is, from a header or a query parameter.
 *
 * **Never refuses.** Anything unparseable is read as no claim at all rather
 * than as a bad request, and that is deliberate: this is diagnostic metadata
 * about a caller that has already authenticated, and a field whose whole
 * purpose is to *observe* the installed population must not be able to lock
 * part of that population out. A client that garbles it goes back to being
 * counted the way every pre-37 build is — silent, and therefore old.
 */
export function claimedBuild(
  raw: string | string[] | null | undefined
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface Deployed {
  /** Short sha of the commit that was synced, `-dirty` if the tree was not clean. */
  commit: string;
  /** Branch it was synced from, for when the sha alone is not recognisable. */
  branch: string;
  /** When bin/deploy stamped it, ISO 8601. */
  at: string;
}

/**
 * What `bin/deploy` recorded about the sync that put this code here.
 *
 * `bin/deploy` rsyncs the working tree rather than a git ref, deliberately, so
 * that it works from a dirty tree — which means nothing about what is running
 * is recoverable from the box itself. Every "verified against production
 * afterwards" note ever written names a behaviour and no revision. This is the
 * missing half.
 *
 * Null when the file is absent, which is every local run and is not an error:
 * a checkout is its own answer to the question.
 */
export function deployed(): Deployed | null {
  // Resolved against the working directory, which the systemd unit and the npm
  // scripts alike set to this package — the same convention as .env and the
  // default DB_PATH.
  try {
    return JSON.parse(readFileSync('./deployed.json', 'utf8')) as Deployed;
  } catch {
    return null;
  }
}

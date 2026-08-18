/**
 * Whether this install is too old for the server it is talking to.
 *
 * `MIN_SUPPORTED_BUILD` on the server is the oldest build it still answers
 * correctly, and until now it was a declaration nothing acted on: a build
 * below it went on making requests and got whatever the current wire happened
 * to give it, which is a confused screen rather than an error. This is the
 * other half — the client asks what the floor is, compares it with its own
 * build, and stops rather than misbehaving quietly.
 *
 * **Two absences, both read as "not expired", and neither is an oversight.**
 * A client that cannot say which build it is (`appBuild()` returns null on a
 * platform that will not answer — see build.ts) must not be locked out on a
 * guess; and a `/healthz` that could not be reached, or that answered without
 * a `minBuild`, says nothing about this install. The failure mode of getting
 * this wrong is not symmetric: refusing to run is total and the user cannot
 * argue with it, while running one release too long is what the app did for
 * its whole life until now.
 */
export interface HealthReport {
  ok: boolean;
  /** The server's compatibility floor. */
  minBuild?: number | null;
  /** Where to get a newer build, when the server has been told. */
  updateUrl?: string | null;
}

/**
 * The rule, on its own so it can be tested without a server or a phone.
 *
 * Strictly *below* the floor: `MIN_SUPPORTED_BUILD` names the oldest build
 * still supported, not the first unsupported one, so a client equal to it is
 * the last one that works rather than the first one that does not.
 */
export function mustUpdate(
  build: number | null,
  minBuild: number | null | undefined
): boolean {
  if (build === null) return false;
  if (typeof minBuild !== 'number' || !Number.isFinite(minBuild)) return false;
  return build < minBuild;
}

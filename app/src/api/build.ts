import * as Application from 'expo-application';

/**
 * Which build of the app this is, reported to the server on every call.
 *
 * It exists to make one decision decidable, and only one: **when a
 * compatibility shim may be deleted.** `MIN_SUPPORTED_BUILD` in the server's
 * release.ts declares the oldest build still owed an answer, and until now
 * nothing could check that declaration against reality — the app sent no
 * version and the server recorded none, so every claim that build N was still
 * out there was reasoned rather than observed. See planning/BACKLOG.md.
 *
 * **Read from the installed binary rather than from `app.json`.**
 * `nativeBuildVersion` is `CFBundleVersion` as it was signed, which is the
 * number TestFlight shows and the number the population actually has. The
 * config is what somebody intended at prebuild time, and the two can disagree:
 * the export step re-signs and Xcode's automatic build-number management has
 * been observed bumping `CFBundleVersion` while doing it. A field meant to
 * answer "what is really installed" should not be able to inherit that.
 *
 * Costs no new native module. `expo-application` was already in the build,
 * pulled in by `expo-notifications` and linked as the `EXApplication` pod, so
 * this adds a declared dependency rather than a prebuild — which matters,
 * `prebuild --clean` being the thing that drops the signing team.
 */

/**
 * Never throws, and reports nothing rather than guessing — the same contract
 * as `deviceRegion`, for the same reason. The server treats an absent build as
 * "older than the header", which is the safe reading; a build that lied about
 * itself, or a crash on a screen nobody could otherwise reach, would both be
 * worse than saying nothing.
 */
function readBuild(): number | null {
  try {
    const native = Application.nativeBuildVersion;
    if (!native) return null;
    // iOS `CFBundleVersion` is a dotted string in general and a plain integer
    // here, this project having only ever used the simple form. Anything that
    // does not parse whole is not a build number we know how to compare.
    const parsed = Number(native);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolved once. The value cannot change while the process lives — a new build
 * is a new process — and the alternative is a native bridge read on every
 * request for an answer that is a constant.
 */
const build = readBuild();

/** The build number, or null when the platform will not say. */
export function appBuild(): number | null {
  return build;
}

/**
 * The header carrying it. Named for this project rather than something generic
 * so that a proxy or a shared host cannot collide with it.
 *
 * Sent on every HTTP call and mirrored as a query parameter on the websocket,
 * which is where a client that is merely *connected* — rather than actively
 * asking for things — is visible from. Somebody sitting in a channel for an
 * hour makes almost no HTTP requests, and an answer that went stale for
 * exactly the people who are using the app would be the wrong way round.
 */
export const BUILD_HEADER = 'x-thefloor-build';

/**
 * The header naming which kind of client this is, and what this one puts in
 * it: nothing.
 *
 * **Null on purpose, so native sends no such header at all.** The server reads
 * absence as native, which it must — every build already installed predates
 * this field and can never be taught to send it, so absence has to describe
 * the population that already exists. Sending it from here would add a header
 * to every call to state the default, and would still not change how a single
 * shipped build is counted.
 *
 * It exists in this file only so that `http.ts` and `socket.ts` can be written
 * once for both platforms; `build.web.ts` is the sibling that answers `'web'`.
 */
export const CLIENT_HEADER = 'x-thefloor-client';
export const CLIENT_KIND: string | null = null;

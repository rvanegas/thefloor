import { ApiError } from '../api/http';
import type { Strings } from '../i18n';

/**
 * Why an invite link could not be taken up, as the accept route names it.
 *
 * **A copy of the server's `InviteRefusal` in `server/src/accounts.ts`, less
 * `locked`**, which the route sends as `unknown` because the two share a
 * sentence on purpose. The app does not import server code, and the list is
 * checked rather than trusted: a code added there and not here reaches a
 * reader as the server's own English sentence, which is what every refusal
 * was before 2026-09-30 and is a fallback rather than a fault.
 */
const INVITE_REFUSALS = ['unknown', 'used', 'expired', 'self', 'too_many'] as const;

export type InviteRefusal = (typeof INVITE_REFUSALS)[number];

function isInviteRefusal(code: string | undefined): code is InviteRefusal {
  return (INVITE_REFUSALS as readonly (string | undefined)[]).includes(code);
}

/**
 * The sentence a failed acceptance puts on screen, in the reader's language
 * where the server said which refusal it was.
 *
 * Three roads, most specific first: a code this app knows is said from the
 * catalogue; any other refusal is the server's sentence, which is English and
 * is all an older server sends; anything that never reached the server is the
 * catalogue's own *could not accept*.
 */
export function inviteRefusalMessage(
  error: unknown,
  words: Strings['provider']
): string {
  if (!(error instanceof ApiError)) return words.couldNotAcceptInvitation();
  if (isInviteRefusal(error.code)) return words.inviteRefused(error.code);
  return error.message;
}

import type { AccountSettings } from '../../core/settings';

/**
 * The account settings as they go out, with the two names builds already on
 * phones know still in them.
 *
 * `tapToStepIn` and `controlCards` were turned over on 2026-09-07 so that
 * every boolean setting defaults to false — see `DEFAULT_ACCOUNT_SETTINGS` in
 * core/settings.ts. That is a wire change, and a wire change reaches the box
 * in a minute and a phone in a week: build 158 and everything before it reads
 * those two names and nothing else, so a server that stopped sending them
 * would hand every installed app a tap that no longer steps in and a channel
 * screen with no cards, silently, from the moment it restarted. **This is the
 * ordinary two-step** — send both names, ship the client that reads the new
 * ones, delete this when the floor has passed the first build that does. See
 * AGENTS.md § *Never ship a wire change to a server before the client can
 * speak it*.
 *
 * The old names are the negation, which is the whole of what the rename did.
 * Written here rather than at each of the three places settings go out — the
 * hello, the settings event, and the answer to `POST /me/settings` — because
 * a client that learnt one shape from the hello and another from the event
 * would be the same bug in a harder place to find.
 */
export function settingsForWire(settings: AccountSettings): AccountSettings & {
  tapToStepIn: boolean;
  controlCards: boolean;
} {
  return {
    ...settings,
    tapToStepIn: !settings.tapToLook,
    controlCards: !settings.hideControlCards,
  };
}

/**
 * Reads a `POST /me/settings` body's two renamed fields under either name.
 *
 * The mirror of the function above and deleted with it. An old build sends
 * `tapToStepIn: false` to mean the tap should only look, and this is where
 * that becomes `tapToLook: true`; a current build sends the new name and this
 * passes it through. When a body carries both — which nothing sends, but a
 * body is whatever arrives — the new name wins, on the grounds that it is the
 * one the sender knew was current.
 *
 * Answers `undefined` for a field nobody mentioned and `null` for one that
 * was mentioned as something other than a boolean, which the caller turns
 * into the 400 it would have sent anyway.
 */
export function booleanUnderEitherName(
  body: Record<string, unknown> | undefined,
  current: string,
  legacy: string,
  legacyIsNegated: boolean,
): boolean | null | undefined {
  const raw = body?.[current] !== undefined ? body?.[current] : undefined;
  if (raw !== undefined) return typeof raw === 'boolean' ? raw : null;
  const old = body?.[legacy];
  if (old === undefined) return undefined;
  if (typeof old !== 'boolean') return null;
  return legacyIsNegated ? !old : old;
}

/**
 * Whether a conversation is happening: you, in a channel, with somebody else
 * in it.
 *
 * Pure and separate from `AppProvider` for the reason `introduction.ts` and
 * `notificationAsk.ts` are separate from their hooks: this is a policy with
 * more cases than it looks like, it is read off every channel snapshot the
 * client holds, and the provider around it is awkward to reach from a test.
 *
 * **What it is asked is *can somebody hear you*, and that is the only question
 * it answers.** Two things are read off it and both are about that moment:
 * `conversedAt`, which ticks the introduction's *step in with somebody* rung,
 * and `useNotificationAsk`, which latches the first conversation as the moment
 * worth asking for notifications on. Neither is about stepping in.
 */

/** What this needs of a channel, which is who is in the room. */
export interface Occupied {
  present: readonly string[];
  /**
   * The guests in the room. Optional on the wire, and membership of it means
   * *present* — `core/types.ts` — so counting keys is counting people who can
   * hear you, not seats that exist.
   */
  guests?: Record<string, unknown>;
}

/**
 * Somebody else is in this channel and so are you.
 *
 * **A guest counts, since 2026-09-13.** It counted members alone, which left
 * a conversation held entirely with a guest reading as silence — on a ladder
 * whose third rung is *bring in a guest*, and under a row whose whole claim is
 * that this is the moment people can hear you. A guest hears you. See
 * `decisions/2026-09-13-a-rung-says-what-ticks-it.md`.
 */
export function isConversing(channel: Occupied, me: string): boolean {
  if (!channel.present.includes(me)) return false;
  return (
    channel.present.length > 1 || Object.keys(channel.guests ?? {}).length > 0
  );
}

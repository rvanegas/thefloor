/**
 * How loudly one channel is allowed to interrupt one person.
 *
 * Here rather than in the server because it is a rule, and because both ends
 * need it for different halves of the same question: the server chooses what
 * to send, and the app describes to somebody what they have chosen. A screen
 * that explains the setting from its own table is one that can disagree with
 * what the phone then does, and the disagreement is invisible until somebody
 * complains that a setting lied to them.
 */

/**
 * The three notifications this system sends, named as `push.ts` names them.
 *
 * There were four until 2026-08-22. `started` — somebody opened a channel with
 * you — was folded into `invited`, having ended the day differing from it in
 * nothing a rule could see: same collapse key, same thread, same lifetime,
 * same alert at every level, swept by neither. What was left was one sentence,
 * and `invited`'s sentence covers both cases, since a channel is never named
 * at creation and "Invited you to a channel" is what a new one is.
 */
export type NotificationKind = 'invited' | 'arrived' | 'pinged';

/**
 * How much of a channel's activity is worth being interrupted for.
 *
 * Per channel and per person, which is the only scope at which the question
 * has an answer: the same volume of traffic is welcome from the conversation
 * somebody is waiting on and unwelcome from the one they are in for
 * completeness. A single account-wide switch would force one answer onto both.
 */
export type NotificationLevel = 'low' | 'medium' | 'high';

/**
 * What a notification does when it arrives.
 *
 * Three states rather than a boolean, because iOS distinguishes *quiet* from
 * *unobtrusive* and the difference is the whole of `low`:
 *
 * - `audible` — the alert tone and the vibration. `aps.sound` is present.
 * - `silent` — a banner, the lock screen, no sound. The sound key is omitted.
 * - `passive` — filed without lighting anything up. `interruption-level` is
 *   `passive`, which is a value APNs takes from anybody; the two rungs *above*
 *   the default are the ones that need entitlements, and neither is used here.
 */
export type NotificationAlert = 'passive' | 'silent' | 'audible';

/**
 * What somebody gets who has never touched the setting.
 *
 * `medium` is the arrangement these notifications were built with: the ones a
 * channel sends about itself arrive silently, and the one a person composed
 * makes a sound.
 */
export const DEFAULT_NOTIFICATION_LEVEL: NotificationLevel = 'medium';

export const NOTIFICATION_LEVELS: readonly NotificationLevel[] = [
  'low',
  'medium',
  'high',
];

/**
 * How one notification arrives, for somebody who has set one level.
 *
 * The table is small enough to read and is deliberately written out rather
 * than computed, because the interesting part is not the arithmetic:
 *
 * | | invited | arrived | pinged |
 * | --- | --- | --- | --- |
 * | `low` | passive | passive | **passive** |
 * | `medium` | silent | silent | **audible** |
 * | `high` | **audible** | **audible** | audible |
 *
 * **`low` takes the ping down with everything else**, and that is the one
 * entry not dictated by the brief, which said only that a ping goes passive
 * there. The alternative — the three staying `silent` while the ping drops to
 * `passive` — would make being asked for by name *less* obtrusive than
 * somebody wandering into the room, which is not a state anybody would choose
 * on purpose. Each column is non-decreasing across the rows, so turning the
 * setting up never makes anything quieter, and that is the property worth
 * keeping if the table is ever edited.
 *
 * Nothing here reaches `time-sensitive` or `critical`. Those pierce a Focus
 * mode and the ring switch respectively; somebody who has set either has said
 * something, and no level offered here is an argument against it.
 */
export function alertFor(
  kind: NotificationKind,
  level: NotificationLevel
): NotificationAlert {
  if (level === 'low') return 'passive';
  if (level === 'high') return 'audible';
  return kind === 'pinged' ? 'audible' : 'silent';
}

/**
 * What each level promises, in the words a person reading the setting needs.
 *
 * Phrased as what *arrives*, not as what is suppressed. Somebody choosing
 * `low` is not asking for less software, they are asking to be left alone
 * about this channel — and the sentence has to make clear that the messages
 * still exist and can be gone and read, or the setting reads as an off switch
 * and gets avoided by people who wanted exactly it.
 */
export function describeLevel(level: NotificationLevel): {
  label: string;
  detail: string;
} {
  switch (level) {
    case 'low':
      return {
        label: 'Quiet',
        detail: 'Nothing makes a sound or lights the screen, pings included.',
      };
    case 'high':
      return {
        label: 'Everything',
        detail: 'Arrivals and invitations make a sound, as pings do.',
      };
    default:
      return {
        label: 'Pings only',
        detail: 'A ping makes a sound. Nothing else does.',
      };
  }
}

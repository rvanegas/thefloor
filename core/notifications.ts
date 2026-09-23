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
 * The four notifications this system sends, named as `push.ts` names them.
 *
 * There were four before 2026-08-22 as well, and not the same four.
 * `started` — somebody opened a channel with you — was folded into
 * `invited`, having ended the day differing from it in nothing a rule could
 * see: same collapse key, same thread, same lifetime,
 * same alert at every level, swept by neither. What was left was one sentence,
 * and `invited`'s sentence covers both cases, since a channel is never named
 * at creation and "Invited you to a channel" is what a new one is.
 */
export type NotificationKind = 'invited' | 'arrived' | 'pinged' | 'accepted';

/**
 * `accepted` joined them on 2026-09-13, and is the first that is not about a
 * channel at all.
 *
 * The other three announce something that happened in a room the recipient
 * already belongs to. This one announces that a *person* took up an
 * invitation — followed an invite link, or accepted a contact request — and
 * the pair are now contacts. It names a channel all the same, because
 * becoming contacts creates one for the pair and the three fields this system
 * keys on a channel (the level, the collapse key, the thread) all want a real
 * id rather than a special case.
 */

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
 * The Android notification channel each alert is delivered on.
 *
 * Here for this file's founding reason — both ends need it and must not
 * disagree. The server names a channel in every message it sends; the app
 * creates the channels. A message naming a channel the app never created is
 * **dropped by Android silently**, with no error at either end, which is the
 * failure this shared table exists to make impossible.
 *
 * **Three channels rather than one, because Android puts loudness on the
 * channel and not on the message.** iOS decides per notification — `sound` and
 * `interruption-level` are payload keys — so one APNs topic carries all three
 * alerts. Android has no per-message equivalent: importance belongs to the
 * channel, is fixed when the channel is created, and cannot be raised
 * afterwards even by the app that made it. So the only way to preserve what
 * `alertFor` decides is a channel per outcome.
 *
 * The cost is worth stating, because it is a real divergence rather than a
 * detail: these are three separate rows in Android's system settings, and a
 * person can turn any of them down *there*, independently of the per-channel
 * level this app offers. The server cannot see that they have, so a
 * notification suppressed that way is indistinguishable here from one
 * delivered. iOS has one such switch; Android has four.
 *
 * The ids are the alert names because there is nothing to gain from a second
 * vocabulary, and a mismatch between the two would be exactly the silent drop
 * above.
 */
export const ANDROID_CHANNEL_IDS: Readonly<Record<NotificationAlert, string>> = {
  passive: 'passive',
  silent: 'silent',
  audible: 'audible',
};

/**
 * How one notification arrives, for somebody who has set one level.
 *
 * The table is small enough to read and is deliberately written out rather
 * than computed, because the interesting part is not the arithmetic:
 *
 * | | invited | arrived | accepted | pinged |
 * | --- | --- | --- | --- | --- |
 * | `low` | passive | passive | passive | **passive** |
 * | `medium` | silent | silent | silent | **audible** |
 * | `high` | **audible** | **audible** | **audible** | audible |
 *
 * **`accepted` sits with the quiet ones, and the argument is not that it is
 * unimportant.** It is the one notification that arrives *before* its
 * recipient could have set a level for the channel it names — the channel is
 * created in the same breath — so whatever this column says is what everybody
 * gets, and making the unsettable one the loudest is a decision nobody can
 * undo. It is also, in the brief's own words, an arrival: somebody has turned
 * up, and the rung that governs that is `arrived`'s. A person who wants to
 * hear about it can still say so, in the row rather than the column, by
 * turning that pair's channel up.
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
 * **What each level promises in words is not here, and that is deliberate.**
 * It used to be — `describeLevel`, returning a label and a sentence — and it
 * moved to `app/src/i18n/en.ts` on the internationalization pass. Nothing but
 * the two settings screens ever read it, it had no structure to share, and a
 * function in core is a function core would have to hold in every language
 * the app learns while importing nothing. The *levels* stay here, because
 * which ones exist and what each one does to an alert is a rule the server
 * enforces; the sentences are the app's to say.
 */

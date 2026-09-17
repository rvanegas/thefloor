import { useEffect, useRef } from 'react';
import type { ChannelState, UserId } from '../../../core/types';
import { chime, warmChimes, type ChimeKind } from './chime';

/**
 * Sounds a chime in the room this device is standing in when somebody else
 * steps into it or out of it.
 *
 * **Above the channel screen, like `useSilencedNudge` and `useKnockNudge`, and
 * for the same reason**: presence is not a screen. Walking back to Home leaves
 * you in the conversation, so a cue mounted inside `ChannelView` would go
 * quiet for exactly the people who are not looking — who are the people with
 * no other way to know the room has changed shape.
 *
 * **It is local, and it is not in the media room.** Publishing the chime into
 * LiveKit was designed and rejected: it would need the media participant open
 * whenever anybody is present rather than only when a track is loaded, it
 * would land in the recording stem and therefore in transcripts, and it could
 * not have expressed the one rule the request is clearest about — *the person
 * arriving does not hear their own arrival*. Each device makes its own sound
 * about other people. See
 * `decisions/2026-09-14-the-room-says-who-came-and-went.md`.
 *
 * **Takes `live`**, the channel this device is present in, so "only the people
 * in the room hear it" needs no guard: `liveChannelHere` has already tested
 * `present.includes(me)`.
 *
 * **It takes no loudness, and did for one day.** A ladder of five peaks was an
 * account setting on 2026-09-15 and was withdrawn the same day, a phone having
 * heard all five as much the same; `warmChimes` and `chime` fall back to
 * `CHIME_AMPLITUDE` and the two agree by construction, which is what the
 * native renderer's per-peak cache needs. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 *
 * ## The rule, which is two clauses and replaced three loops
 *
 * There are three rungs somebody can be on in a channel — **present**,
 * **nearby**, and neither, which the roster calls *stepped out*. A snapshot
 * moves people between them, and since 2026-09-17:
 *
 * - **The rung somebody lands on picks the chime.** Present rings `in`,
 *   nearby rings `nearby`, stepped out rings `out`. Where they came *from*
 *   does not enter into it.
 * - **A move sounds only if it crosses `present`** — only if they were
 *   present, or are now. Everything else is somebody rearranging themselves
 *   outside the room, which is not news to the people in it.
 *
 * Four moves sound, and they are the four a listener could act on: `in→out`,
 * `in→nearby`, `out→in`, `nearby→in`. The two that do not are `out→nearby` and
 * `nearby→out`, neither of which changes who is in the room with you.
 *
 * Two further rules hold over any tick:
 *
 * - **You never hear your own movement**, in any direction. It is the part of
 *   the request that is least negotiable and the easiest to lose to a
 *   refactor, since every other rule here is about other people — and it is
 *   the reason this cue is local rather than published into the media room,
 *   which could not have made the distinction at all.
 * - **One chime per kind, all kinds that apply, in a fixed order.** A snapshot
 *   can carry several moves; what the room hears is one sentence about them
 *   rather than a copy of each. Two people leaving and one stepping back to
 *   nearby is **two** chimes — `out` once, then `nearby` — not three.
 *
 * **`out→nearby` used to ring, and that is the substantive loss.** A
 * declaration from outside was the case the third chime was added for on
 * 2026-09-15, and being reachable is a real thing to learn about somebody. It
 * is silent now because it is not a change to *this* room: the people in it
 * are the same people, and a conversation interrupted by news about somebody
 * who was not in it is a conversation interrupted for nothing. It stays on the
 * roster for anybody who looks. See
 * planning/decisions/2026-09-17-the-chime-follows-the-room.md.
 *
 * **It also dissolved a problem rather than solving one.** `nearby→out` cannot
 * be told from a snapshot: `stepOut` clears a declaration identically whether
 * a tap or the attention clock ended it, stamping nothing either way — so a
 * chime there would have had to choose between silence and announcing a
 * decision nobody made. It does not cross `present`, so the rule never asks.
 */
export function usePresenceChime(
  channel: ChannelState | null,
  me: UserId,
  fire: (kind: ChimeKind) => void = chime
): void {
  /**
   * What the room looked like last time, or null before the first look.
   *
   * Null is the "taken as read" state and is `useKnockNudge`'s rule for its
   * reason: stepping into a channel with three people already in it is not the
   * moment those three arrived, and announcing them would be reporting the
   * past.
   */
  const seen = useRef<{
    channelId: string;
    present: readonly UserId[];
    nearby: readonly UserId[];
    lastPresentAt: Partial<Record<UserId, number>>;
  } | null>(null);

  /**
   * Renders the sounds before any of them is wanted.
   *
   * **The cue's whole job is to land at the moment somebody walks in**, and the
   * first play of an unrendered chime is the one that has a WAV written and a
   * system sound created underneath it. Mounting is early and idle; an arrival
   * is neither.
   */
  useEffect(() => {
    warmChimes();
  }, []);

  const channelId = channel?.id ?? null;
  // Joined into strings so the effect re-runs when the room changes shape and
  // not on every snapshot of a busy conversation — `useKnockNudge`'s trick,
  // and it matters more here, where a snapshot arrives for every word spoken.
  const presentKey = (channel?.present ?? []).join(',');
  const nearbyKey = Object.keys(channel?.declaredNearbyAt ?? {})
    .sort()
    .join(',');
  /**
   * The two maps the departure rule reads, held in refs rather than in the
   * dependency list.
   *
   * **`lastPresentAt` moves constantly** — it is refreshed by every
   * `STILL_HERE` from everybody present — so depending on it would re-run this
   * effect several times a minute per person in the room. It is read only at a
   * departure edge, where the roster has changed and the effect is running
   * anyway.
   */
  const waiting = useRef<readonly UserId[]>([]);
  waiting.current = channel?.waiting ?? [];
  const declared = useRef<Partial<Record<UserId, number>>>({});
  declared.current = channel?.declaredNearbyAt ?? {};
  const lastPresentAt = useRef<Partial<Record<UserId, number>>>({});
  lastPresentAt.current = channel?.lastPresentAt ?? {};

  useEffect(() => {
    if (channelId === null) {
      seen.current = null;
      return;
    }

    const present = presentKey ? presentKey.split(',') : [];
    const nearby = nearbyKey ? nearbyKey.split(',') : [];
    const before = seen.current;
    seen.current = {
      channelId,
      present,
      nearby,
      lastPresentAt: lastPresentAt.current,
    };

    // A different channel starts a fresh memory. Nothing about the room you
    // have just walked into happened while you were there.
    if (!before || before.channelId !== channelId) return;

    /**
     * Which rung somebody is on, given the two rosters of a snapshot.
     *
     * The three are exclusive by construction rather than by care here:
     * `ENTER` clears a declaration and the `nearby` exit writes one, so
     * nobody is in `present` and `declaredNearbyAt` at once. See `Exit` in
     * `core/channel.ts`. The rung names are the chime kinds because the rung
     * landed on *is* the chime — that is the rule, not a coincidence worth
     * mapping through a table.
     */
    const rungOf = (
      id: UserId,
      inRoom: readonly UserId[],
      atHand: readonly UserId[]
    ): ChimeKind =>
      inRoom.includes(id) ? 'in' : atHand.includes(id) ? 'nearby' : 'out';

    /**
     * **Everybody who crossed `present`, and nobody else** — the second clause
     * of the rule, written as the thing iterated rather than as a test inside
     * the loop.
     *
     * Somebody in either roster of `present` has `in` at one end of their move
     * by construction, and somebody in neither has it at neither end. So this
     * list *is* the set of moves that sound, and nothing below has to ask.
     * Deduplicated by hand rather than through a `Set`, which keeps the order
     * stable and the iteration plain.
     */
    const crossed = before.present.concat(
      present.filter((id) => !before.present.includes(id))
    );

    /**
     * **One chime per kind, however many people moved.**
     *
     * Two people arriving in the same snapshot is one arrival sound. Two
     * copies of the same 180ms tone laid over each other is not twice as
     * informative, it is mud — and the count is on the roster, which is where
     * somebody goes when the sound has made them look.
     */
    let rising = false;
    let falling = false;
    let nearing = false;

    for (const id of crossed) {
      // You are never told about yourself. You know you walked in.
      if (id === me) continue;
      const from = rungOf(id, before.present, before.nearby);
      const to = rungOf(id, present, nearby);
      if (from === to) continue;

      if (to === 'in') {
        rising = true;
        continue;
      }
      if (to === 'nearby') {
        // Stepping back to nearby is not leaving: they are still one ping
        // away, and what they get is the sound for the rung they landed on.
        nearing = true;
        continue;
      }

      /**
       * **Only a departure somebody chose makes a sound**, and `core/channel.ts`
       * § `Exit` is what makes that answerable from two snapshots. There are
       * four ways to stop being present and they differ in exactly two fields:
       *
       * | | `lastPresentAt` | `waiting` | `declaredNearbyAt` |
       * | --- | --- | --- | --- |
       * | `chosen` — a tap | stamped now | cleared | cleared |
       * | `nearby` — declared | stamped now | added | stamped |
       * | `dropped` — grace ran out | left alone | added | left alone |
       * | `inattentive` — attention ran out | left alone | cleared | cleared |
       *
       * **The stamp is the bit**, and it is the only field that separates the
       * top two from the bottom two: it is written at the moment somebody
       * decides something and left alone when a clock decides instead. So a
       * changed `lastPresentAt` across the departure edge *is* the definition
       * of a deliberate exit, and nothing else here has to be enumerated. The
       * `nearby` row never reaches this branch, having landed on its own rung
       * above.
       *
       * **The `waiting` clause is a second opinion on the one case that can
       * fool the first.** The stamp test compares against the last snapshot
       * this hook saw, and a `dropped` user's final heartbeat could in
       * principle fall between that snapshot and this one, moving the stamp
       * for a departure nobody chose. `dropped` is also the one exit that
       * lands in `waiting` without a declaration, so that is checked directly
       * and costs one comparison.
       *
       * A phone that died in a pocket did not leave the room, and neither did
       * somebody the attention clock retired. A chime for either would be
       * announcing a decision nobody made.
       */
      const chose = lastPresentAt.current[id] !== before.lastPresentAt[id];
      const dropped =
        waiting.current.includes(id) && declared.current[id] === undefined;
      if (!chose || dropped) continue;
      falling = true;
    }

    /**
     * **At most one of each, and in this order.**
     *
     * The order is the order the room would narrate them in, and it is fixed
     * rather than incidental: a snapshot in which somebody steps in while
     * somebody else steps back to nearby has to sound the same way every time,
     * or the pair of sounds is a coin toss rather than a sentence.
     */
    if (rising) fire('in');
    if (falling) fire('out');
    if (nearing) fire('nearby');
  }, [channelId, presentKey, nearbyKey, me, fire]);
}

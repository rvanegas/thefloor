import { useEffect, useRef } from 'react';
import type { ChannelState, UserId } from '../../../core/types';
import { chime } from './chime';

/**
 * Sounds a chime in the room this device is standing in when somebody arrives
 * or leaves.
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
 */
export function usePresenceChime(
  channel: ChannelState | null,
  me: UserId,
  fire: (rising: boolean) => void = chime
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
     * **One chime per direction, however many people moved.**
     *
     * Two people arriving in the same snapshot is one arrival sound. Two
     * copies of the same 180ms tone laid over each other is not twice as
     * informative, it is mud — and the count is on the roster, which is where
     * somebody goes when the sound has made them look.
     */
    let rising = false;
    let falling = false;

    for (const id of present) {
      if (id === me || before.present.includes(id)) continue;
      rising = true;
    }

    for (const id of before.present) {
      if (id === me || present.includes(id)) continue;
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
       * of a deliberate exit, and nothing else here has to be enumerated.
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

    for (const id of nearby) {
      if (id === me || before.nearby.includes(id)) continue;
      /**
       * **A declaration from outside is an arrival; one from inside is not.**
       *
       * Mirrors `server/src/channels.ts`, which makes the same distinction
       * before announcing: somebody present who taps *Be nearby* is stepping
       * out to the rung below, and their departure is already sounding as the
       * falling chime above. Only somebody who was not in the room has
       * arrived at it.
       *
       * Keyed on the id *appearing* in the map and never on its value: the
       * stamp is restamped in place when somebody taps the lit rung, and a
       * renewal is not an arrival.
       */
      if (before.present.includes(id)) continue;
      rising = true;
    }

    if (rising) fire(true);
    if (falling) fire(false);
  }, [channelId, presentKey, nearbyKey, me, fire]);
}

import { isWithheld } from '../../../core/channel';
import { inRoom } from '../../../core/guests';
import type { ChannelState, UserId } from '../../../core/types';

/**
 * Who in the media room is publishing audio, and which of them this device is
 * subscribed to — by identity, which is the account id for a member.
 *
 * **The only account anywhere of what LiveKit actually did with a
 * subscription.** The server states subscriptions and takes the answer on
 * trust; nothing it can query reports who is subscribed to whom. So a
 * statement that was accepted and not applied is visible from this end or
 * from nowhere. See `ClientMessage.channel.unheard`.
 *
 * Read off the room rather than counted from events, so that it cannot drift
 * from what the room holds: both hooks call `readHearing` after anything that
 * could have changed it.
 */
export interface Hearing {
  publishing: string[];
  heard: string[];
}

export const NO_HEARING: Hearing = { publishing: [], heard: [] };

/**
 * The part of a LiveKit room `readHearing` looks at. Declared structurally so
 * that the browser's `livekit-client` room and the phone's satisfy it alike,
 * and a test can hand it a plain object.
 *
 * **Both fields optional, though a real room always has them**, because this
 * is an observer called from inside the audio hooks' connect path and event
 * handlers, and nothing it reads may be able to throw there — a throw after
 * `connected` would land in the connect's catch and report the room failed.
 */
export interface HearableRoom {
  remoteParticipants?: Map<
    string,
    {
      identity: string;
      /** Optional for the reason `remoteParticipants` is. */
      audioTrackPublications?: Map<string, { isSubscribed: boolean }>;
    }
  >;
}

export function readHearing(room: HearableRoom | null): Hearing {
  if (!room) return NO_HEARING;
  const publishing: string[] = [];
  const heard: string[] = [];
  for (const participant of room.remoteParticipants?.values() ?? []) {
    const publications = [...(participant.audioTrackPublications?.values() ?? [])];
    if (publications.length === 0) continue;
    publishing.push(participant.identity);
    if (publications.some((publication) => publication.isSubscribed)) {
      heard.push(participant.identity);
    }
  }
  return { publishing: publishing.sort(), heard: heard.sort() };
}

/** So that a hook can skip a render when nothing it reports has changed. */
export function sameHearing(a: Hearing, b: Hearing): boolean {
  return (
    a.publishing.join(' ') === b.publishing.join(' ') &&
    a.heard.join(' ') === b.heard.join(' ')
  );
}

/**
 * Who this device should be hearing and is not: in the room, publishing, not
 * withheld, and not subscribed to.
 *
 * Only people the channel says are in the room, which leaves out the
 * `media:<channel>` participant a shared track is published as — that has its
 * own failure modes and its own readouts — and anybody the room still lists
 * after the channel has let them go. Nothing while the channel is not active
 * or you are not in it, since then nothing is owed.
 */
export function unheardSpeakers(
  channel: ChannelState | null,
  me: UserId,
  hearing: Hearing
): string[] {
  if (!channel || channel.status !== 'active' || !inRoom(channel, me)) return [];
  const heard = new Set(hearing.heard);
  return hearing.publishing.filter(
    (id) =>
      id !== me &&
      !heard.has(id) &&
      inRoom(channel, id) &&
      !isWithheld(channel, id)
  );
}

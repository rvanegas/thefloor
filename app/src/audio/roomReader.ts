import type { Room } from 'livekit-client';

/**
 * Whether a room participant is the room reader — `room-reader:<channel>`, the
 * server's own, since 2026-11-13. Never somebody the channel says is here, so
 * nothing that counts people sees it; this is for the one thing that acts on
 * it, *Stop*.
 */
export function isRoomReader(identity: string): boolean {
  return identity.startsWith('room-reader:');
}

/**
 * *Stop* on the reading bar, for a reply the room is hearing: the room reader
 * goes quiet **on this device only**, by not receiving its track, and comes
 * back for the next thing it says. Stopping it for the room is not offered —
 * a reply somebody has just asked for is not one person's to silence for the
 * others. Returns what it acted on, for the diagnostics log.
 */
export function quietRoomReader(room: Room | null, hushed: boolean): string[] {
  if (!room) return [];
  const acted: string[] = [];
  try {
    for (const participant of room.remoteParticipants.values()) {
      if (!isRoomReader(participant.identity)) continue;
      for (const publication of participant.audioTrackPublications.values()) {
        publication.setEnabled(!hushed);
        acted.push(`${participant.identity} (${publication.trackSid})`);
      }
    }
  } catch {
    // A room mid-teardown answers nothing; there is nothing left to hush.
  }
  return acted;
}

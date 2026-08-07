import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type TrackPublication,
} from 'livekit-client';
import { AudioSession } from '@livekit/react-native';
import { api } from '../api/http';

/**
 * Joins the session's audio room and publishes the microphone.
 *
 * Deliberately thin: it does not decide who may speak. The floor is enforced
 * server-side by muting the publisher, which a client cannot undo — so this
 * connects, publishes, and reports what happened, and nothing here reasons
 * about eligibility.
 */

export type AudioStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface SessionAudio {
  status: AudioStatus;
  /** Set when status is 'error' or 'denied'. */
  message: string | null;
  /** Whether the server currently has our published track muted. */
  mutedByServer: boolean;
  /** Whether the other participant is publishing audio we can hear. */
  otherAudible: boolean;
}

/**
 * @param sessionId the session to join, or null to stay disconnected
 * @param token     the app's own auth token, used to fetch a join credential
 * @param selfMuted the user's own mute, which is theirs alone and unrelated to
 *                  the floor
 * @param silenced  whether the floor currently silences this user, per the
 *                  server. Enforcement is the server's job — this only decides
 *                  whether to publish again once it lifts.
 */
export function useSessionAudio(
  sessionId: string | null,
  token: string | null,
  selfMuted: boolean,
  silenced: boolean
): SessionAudio {
  const [state, setState] = useState<SessionAudio>({
    status: 'idle',
    message: null,
    mutedByServer: false,
    otherAudible: false,
  });
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!sessionId || !token) return;

    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    const update = (patch: Partial<SessionAudio>) => {
      if (!cancelled) setState((s) => ({ ...s, ...patch }));
    };

    // The server mutes our publication to enforce a floor claim. Surfacing it
    // lets the UI tell the truth about whether the mic is actually live,
    // rather than inferring it from session state that may be a moment behind.
    //
    // TrackMuted/TrackUnmuted fire for remote participants too, so the local
    // one has to be picked out — otherwise the other person self-muting would
    // read as us being silenced.
    const isLocal = (participant: Participant) =>
      participant.identity === room.localParticipant.identity;
    const onMuted = (_pub: TrackPublication, participant: Participant) => {
      if (isLocal(participant)) update({ mutedByServer: true });
    };
    const onUnmuted = (_pub: TrackPublication, participant: Participant) => {
      if (isLocal(participant)) update({ mutedByServer: false });
    };
    const onSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) update({ otherAudible: true });
    };
    const onUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) update({ otherAudible: false });
    };

    room
      .on(RoomEvent.TrackMuted, onMuted)
      .on(RoomEvent.TrackUnmuted, onUnmuted)
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.Disconnected, () => update({ status: 'idle' }));

    (async () => {
      update({ status: 'connecting', message: null });
      try {
        const credential = await api.mediaToken(token, sessionId);
        if (!credential.url) {
          update({
            status: 'unavailable',
            message: 'The server has no audio configured.',
          });
          return;
        }
        if (cancelled) return;

        // Routes audio to the earpiece/speaker and takes the audio focus.
        await AudioSession.startAudioSession();
        await room.connect(credential.url, credential.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(true);
        update({ status: 'connected' });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        // A refused microphone is a normal outcome the user can fix, not a
        // failure of the session, so it is reported distinctly.
        const denied = /permission|NotAllowed|denied/i.test(message);
        update({
          status: denied ? 'denied' : 'error',
          message: denied
            ? 'Microphone access was refused. Enable it in Settings to be heard.'
            : message,
        });
      }
    })();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      room.disconnect().catch(() => {});
      AudioSession.stopAudioSession().catch(() => {});
      roomRef.current = null;
    };
  }, [sessionId, token]);

  /**
   * Keeps the published microphone in step with both reasons it may be off.
   *
   * Self-mute is unilateral and acts directly on the local publication. The
   * floor is the server's decision, enforced by revoking publish permission —
   * but regaining permission does not republish anything, so a release would
   * otherwise leave the user permanently inaudible: silenced correctly, never
   * restored. Publishing again here is what makes the floor temporary.
   */
  useEffect(() => {
    const room = roomRef.current;
    if (!room || state.status !== 'connected') return;
    const shouldPublish = !selfMuted && !silenced;
    room.localParticipant.setMicrophoneEnabled(shouldPublish).catch(() => {});
  }, [selfMuted, silenced, state.status]);

  return state;
}

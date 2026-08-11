import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type TrackPublication,
} from 'livekit-client';
import {
  AudioSession,
  type AppleAudioConfiguration,
} from '@livekit/react-native';
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
  /** How many other participants are publishing audio we can hear. */
  othersAudible: number;
  /**
   * Whether the microphone is actually capturing.
   *
   * False while you are alone in a channel and not recording, which is a state
   * worth reporting rather than leaving to be discovered: the screen otherwise
   * says the microphone is open when it is not.
   */
  micOpen: boolean;
}

/**
 * What the audio session asks of the system when nothing needs capturing.
 *
 * The library's own playout-only policy. `playback` rather than
 * `playAndRecord` is the whole point: taking the session as a call drags a
 * Bluetooth speaker from A2DP down to HFP — mono, roughly 16 kHz — and makes
 * every other app's audio unusable for as long as you are in the channel.
 * `mixWithOthers` is what lets that other app keep playing.
 */
const PLAYBACK_ONLY: AppleAudioConfiguration = {
  audioCategory: 'playback',
  audioCategoryOptions: ['mixWithOthers'],
  audioMode: 'spokenAudio',
};

/** Apple-only; on Android the category model does not apply. */
async function applyPlaybackOnly(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await AudioSession.setAppleAudioConfiguration(PLAYBACK_ONLY).catch(() => {});
}

/**
 * @param channelId the session to join, or null to stay disconnected
 * @param token     the app's own auth token, used to fetch a join credential
 * @param selfMuted the user's own mute, which is theirs alone and unrelated to
 *                  the floor
 * @param micNeeded whether anything is listening: somebody else present, or a
 *                  recording running. Told rather than worked out here — this
 *                  hook has never decided anything about who may speak.
 */
export function useSessionAudio(
  channelId: string | null,
  token: string | null,
  selfMuted: boolean,
  micNeeded: boolean
): SessionAudio {
  const [state, setState] = useState<SessionAudio>({
    status: 'idle',
    message: null,
    mutedByServer: false,
    othersAudible: 0,
    micOpen: false,
  });
  const roomRef = useRef<Room | null>(null);
  /** Same reason as `micNeededRef`: read at connect, acted on below. */
  const selfMutedRef = useRef(selfMuted);
  selfMutedRef.current = selfMuted;
  /**
   * Read through a ref inside the connect effect so that somebody arriving
   * does not tear the room down and rebuild it. The effect below is what acts
   * on a change.
   */
  const micNeededRef = useRef(micNeeded);
  micNeededRef.current = micNeeded;

  useEffect(() => {
    if (!channelId || !token) return;

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
    // Counted by who, not merely whether: with several people, one track
    // arriving or leaving says nothing about the rest.
    const audible = new Set<string>();
    const onSubscribed = (
      track: RemoteTrack,
      _pub: TrackPublication,
      participant: Participant
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      audible.add(participant.identity);
      update({ othersAudible: audible.size });
    };
    const onUnsubscribed = (
      track: RemoteTrack,
      _pub: TrackPublication,
      participant: Participant
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      audible.delete(participant.identity);
      update({ othersAudible: audible.size });
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
        const credential = await api.mediaToken(token, channelId);
        if (!credential.url) {
          update({
            status: 'unavailable',
            message: 'The server has no audio configured.',
          });
          return;
        }
        if (cancelled) return;

        // Playout-only until there is something to capture for. Applied
        // before the session is taken, so it is never briefly a call.
        if (!micNeededRef.current) await applyPlaybackOnly();

        // Started explicitly, despite registerGlobals() also installing
        // automatic management. Leaving it to the automatic path alone meant
        // that after a party left and rejoined, the other side's playback never
        // resumed: subscribed to the new track, reporting healthy, and silent.
        // Taking the session here makes it active before anything is published
        // or subscribed, which is the state remote playback needs.
        await AudioSession.startAudioSession();
        await room.connect(credential.url, credential.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        // Nothing to apply on the way up: the native policy installs the
        // recording configuration when the engine starts capturing.
        const open = micNeededRef.current && !selfMutedRef.current;
        await room.localParticipant.setMicrophoneEnabled(open);
        update({ status: 'connected', micOpen: open });
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
  }, [channelId, token]);

  /**
   * Keeps the published microphone in step with both reasons it may be off.
   *
   * Self-mute is unilateral and acts directly on the local publication. The
   * floor is the server's decision, enforced by revoking publish permission —
   * but regaining permission does not republish anything, so a release would
   * otherwise leave the user permanently inaudible: silenced correctly, never
   * restored. Publishing again here is what makes the floor temporary.
   */
  /**
   * Only self-mute touches the microphone. The floor is enforced by the server
   * withholding this participant from the other one, so a silenced user keeps
   * publishing exactly as before — which is deliberate, and is what keeps their
   * audio session alive so they can still hear and can speak again afterwards.
   */
  useEffect(() => {
    const room = roomRef.current;
    if (!room || state.status !== 'connected') return;
    const open = micNeeded && !selfMuted;
    room.localParticipant
      .setMicrophoneEnabled(open)
      // Handing the session back to `playback` is the half that matters for a
      // speaker: stopping capture does not by itself restore A2DP.
      .then(() => (open ? undefined : applyPlaybackOnly()))
      .catch(() => {});
    setState((s) => (s.micOpen === open ? s : { ...s, micOpen: open }));
  }, [selfMuted, micNeeded, state.status]);

  return state;
}

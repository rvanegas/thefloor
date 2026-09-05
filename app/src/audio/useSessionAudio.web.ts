import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionQuality,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from 'livekit-client';
import { api } from '../api/http';
import { rebindTracks } from './rebind';

/**
 * The browser's session audio, which is the native hook with the iOS half
 * removed rather than a port of it.
 *
 * `useSessionAudio.ts` is 1,125 lines and roughly half of them are
 * `AVAudioSession` management — the `IDLE`/`CALL` category model, the three
 * writers that have to agree about it, the mute-mode workaround, the route
 * diagnostics. None of that has an analogue here: a browser owns its own audio
 * session and gives a page no say in it.
 *
 * What survives is the shape — the three-state microphone intent, the
 * generation-bump reconnect, the event wiring, and the `api.mediaToken()`
 * fetch — and what is added is the browser's own two obligations, both taken
 * from `server/web/guest.ts`, which learnt them the expensive way:
 *
 * - **Subscribing is not hearing.** `livekit-client` subscribes and hands the
 *   track to the application; nothing plays until `attach()`'s element is in
 *   the document. There is no equivalent step in the native client, so nothing
 *   about this is noticeable by analogy.
 * - **A page may not make noise unasked.** `room.startAudio()` satisfies the
 *   autoplay policy, and can fail, in which case the page needs a gesture.
 *
 * SPIKE: written to answer whether the UI ports, not to be the audio layer.
 * It has none of the native hook's instrumentation — no playout polling, no
 * speaking hold, no diagnostics — and `asked` is permanently null.
 */

export type AudioStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  /** Evicted by another of this account's devices. See the native sibling. */
  | 'displaced'
  | 'denied'
  | 'unavailable'
  | 'error';

export type MicIntent = 'capturing' | 'muted' | 'released';

/**
 * Diagnostic only, and inert here.
 *
 * The native shape carries two `AppleAudioConfiguration`s, which is a type from
 * `@livekit/react-native` — a package this bundle must never load. It is
 * declared structurally rather than imported so that `diagnostics.ts` and
 * `AudioDebugPanel.tsx`, which import this type, still compile for web.
 */
export interface AudioIntent {
  selfMuted: boolean;
  micNeeded: boolean;
  hasAudio: boolean;
  othersAudible: number;
  intent: MicIntent;
  session: unknown;
  playout: unknown;
}

export interface SessionAudio {
  status: AudioStatus;
  message: string | null;
  mutedByServer: boolean;
  othersAudible: number;
  speaking: string[];
  failing: string[];
  micOpen: boolean;
  asked: AudioIntent | null;
  reconnect: () => void;
  /**
   * Structural parity with the native hook, which is what `ChannelView`'s
   * imported type is checked against. Real rather than a stub, since the
   * subscription it rebinds is the same livekit-client object on both
   * platforms — but nothing here presses it: the panel that does is iOS-only,
   * and the fault it repairs is an `AVAudioSession` one. See `audio/rebind.ts`.
   */
  resubscribe: () => void;
}

/** Mirrors the native file deliberately, so the two cannot drift. */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

function intentFor(micNeeded: boolean, selfMuted: boolean): MicIntent {
  if (!micNeeded) return 'released';
  return selfMuted ? 'muted' : 'capturing';
}

/**
 * Where subscribed audio elements live.
 *
 * Off-screen rather than hidden: `display: none` is permitted to stop playback
 * in some engines, which is the one failure this element exists to prevent.
 */
function audioSink(): HTMLElement {
  const id = 'thefloor-audio-sink';
  let sink = document.getElementById(id);
  if (!sink) {
    sink = document.createElement('div');
    sink.id = id;
    sink.style.position = 'absolute';
    sink.style.width = '0';
    sink.style.height = '0';
    sink.style.overflow = 'hidden';
    document.body.append(sink);
  }
  return sink;
}

export function useSessionAudio(
  mediaRoom: string | null,
  channelId: string | null,
  token: string | null,
  selfMuted: boolean,
  micNeeded: boolean,
  /**
   * Unused, and kept so the two hooks take the same arguments — `App.tsx`
   * calls one name and metro decides which file that is, so a signature that
   * drifted would be a type error on one platform and a silently shifted
   * argument on the other. What it is *for* is the iOS audio session, and the
   * connect effect below says why it must not be read here.
   */
  hasAudio: boolean
): SessionAudio {
  const [state, setState] = useState<SessionAudio>({
    status: 'idle',
    message: null,
    mutedByServer: false,
    othersAudible: 0,
    speaking: [],
    failing: [],
    micOpen: false,
    asked: null,
    reconnect: () => {},
    resubscribe: () => {},
  });

  const roomRef = useRef<Room | null>(null);
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const patch = useCallback((next: Partial<SessionAudio>) => {
    setState((previous) => ({ ...previous, ...next }));
  }, []);

  const reconnect = useCallback(() => {
    setGeneration((n) => n + 1);
  }, []);

  // Connect, and rebuild whenever the room name or the generation changes.
  //
  // **`hasAudio` is not consulted here, and used to be, which is the
  // 2026-09-04 fix.** This read `|| !hasAudio` and carried `hasAudio` in its
  // dependencies, so the browser both refused to connect and tore down a live
  // room whenever the channel reported no audio of its own. That is a
  // session-category rule doing a connection's job: the native sibling gates on
  // `mediaRoom`, `channelId` and `token` and nothing else, and spends
  // `hasAudio` only on choosing `IDLE` against `CALL` — a distinction a browser
  // does not have, which is how a value with no remaining purpose in this file
  // came to decide the one thing it must not.
  //
  // What it cost was the whole of shared playback for one person. Alone in a
  // channel the old `anyMicrophoneOpen` rule was false by design —
  // `microphoneNeeded` has nothing to capture for — so the tab never joined the
  // room, never subscribed
  // to the `media:<channel>` participant the server publishes the track as, and
  // played nothing, while the transport ran and the Play button stayed enabled
  // because `canControlPlayback` rightly permits a lone member. A second person
  // opening a microphone flipped the value and the sound arrived, which is what
  // made a bug about a predicate look like a rule about company.
  useEffect(() => {
    if (!mediaRoom || !channelId || !token) {
      patch({ status: 'idle', message: null, speaking: [], failing: [] });
      return;
    }

    let cancelled = false;
    const room = new Room();
    roomRef.current = room;
    const sink = audioSink();

    const readSpeakers = (speakers: Participant[]) => {
      if (cancelled) return;
      patch({ speaking: speakers.map((p) => p.identity) });
    };

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.autoplay = true;
      sink.append(element);
      if (!cancelled) patch({ othersAudible: countAudible(room) });
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      for (const element of track.detach()) element.remove();
      if (!cancelled) patch({ othersAudible: countAudible(room) });
    });

    room.on(RoomEvent.ActiveSpeakersChanged, readSpeakers);

    // The floor is enforced server-side by muting our publication, so this is
    // how the client learns it has been silenced. Ours only.
    const readLocalMute = () => {
      if (cancelled) return;
      const published = [...room.localParticipant.audioTrackPublications.values()];
      patch({ mutedByServer: published.some((p) => p.isMuted) });
    };
    room.on(RoomEvent.TrackMuted, readLocalMute);
    room.on(RoomEvent.TrackUnmuted, readLocalMute);

    room.on(
      RoomEvent.ConnectionQualityChanged,
      (quality: ConnectionQuality, participant: Participant) => {
        if (cancelled) return;
        setState((previous) => {
          const failing = new Set(previous.failing);
          if (quality === ConnectionQuality.Lost) failing.add(participant.identity);
          else failing.delete(participant.identity);
          return { ...previous, failing: [...failing] };
        });
      }
    );

    room.on(RoomEvent.Disconnected, (reason) => {
      if (cancelled) return;
      sink.textContent = '';
      // The eviction that must not be retried, and the browser is where it
      // stops being a rarity: two tabs on one origin share a token, so this
      // is what a second tab of the same channel does to the first. The
      // native hook carries the full reasoning; the rule is that the evicted
      // side goes quiet instead of taking the room back.
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
        patch({ status: 'displaced', speaking: [], failing: [] });
        return;
      }
      patch({ status: 'reconnecting', speaking: [], failing: [] });
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attemptRef.current,
        RECONNECT_MAX_MS
      );
      attemptRef.current += 1;
      retryRef.current = setTimeout(() => setGeneration((n) => n + 1), delay);
    });

    void (async () => {
      patch({ status: 'connecting', message: null });
      try {
        const credential = await api.mediaToken(tokenRef.current!, channelIdRef.current!);
        if (cancelled) return;
        if (!credential.url) {
          patch({ status: 'unavailable', message: 'No media server configured.' });
          return;
        }
        await room.connect(credential.url, credential.token);
        if (cancelled) return;
        attemptRef.current = 0;
        patch({ status: 'connected', othersAudible: countAudible(room) });
        // Autoplay: attempted immediately, and it may simply be refused.
        try {
          await room.startAudio();
        } catch {
          // A gesture is needed. The spike does not yet offer the button
          // guest.html has; noted as a finding rather than papered over.
        }
      } catch (error) {
        if (cancelled) return;
        patch({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      sink.textContent = '';
      void room.disconnect();
      roomRef.current = null;
    };
  }, [mediaRoom, channelId, token, generation, patch]);

  // The microphone follows the intent, which is the native hook's three-state
  // model unchanged: released means unpublished, muted means published and
  // silent, capturing means open.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || state.status !== 'connected') return;
    const intent = intentFor(micNeeded, selfMuted);
    let cancelled = false;

    void (async () => {
      try {
        if (intent === 'released') {
          await room.localParticipant.setMicrophoneEnabled(false);
          if (!cancelled) patch({ micOpen: false });
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        const published = [...room.localParticipant.audioTrackPublications.values()];
        for (const publication of published) {
          if (intent === 'muted') await publication.track?.mute();
          else await publication.track?.unmute();
        }
        if (!cancelled) patch({ micOpen: intent === 'capturing' });
      } catch (error) {
        if (cancelled) return;
        // A refused microphone is a decision by a person, not a fault.
        patch({
          status: 'denied',
          micOpen: false,
          message:
            'Your browser would not give this page a microphone. Check its permissions.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [micNeeded, selfMuted, state.status, patch]);

  const resubscribe = useCallback(() => {
    rebindTracks(roomRef.current, null);
  }, []);

  return { ...state, reconnect, resubscribe };
}

/** Never throws, on the same reasoning as the native file's version. */
function countAudible(room: Room): number {
  try {
    let total = 0;
    for (const participant of room.remoteParticipants.values()) {
      total += participant.audioTrackPublications.size;
    }
    return total;
  } catch {
    return 0;
  }
}

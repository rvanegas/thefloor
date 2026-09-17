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
import { sample, startWatch } from '../../../core/capture';
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
 *   autoplay policy, and can fail, in which case the page needs a gesture —
 *   which is `playbackBlocked` and `allowPlayback` below.
 * - **A granted microphone is not a working one.** Nothing in WebRTC reports a
 *   capture that yields silence, so the only way to know is to listen to what
 *   was published: `watchCapture` below, counting by `core/capture.ts`.
 *
 * Written as a spike — to answer whether the UI ports, not to be the audio
 * layer — and it still has none of the native hook's instrumentation: no
 * playout polling, no speaking hold, no route diagnostics, `asked` permanently
 * null. None of that is missed, being iOS apparatus for iOS faults. The two
 * above were the other kind of gap and were closed on 2026-09-17; both are
 * ports of `server/web/guest.ts`, which learnt them first and paid for each in
 * a defect.
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
  /**
   * Whether the browser is refusing to let this page make sound.
   *
   * **A refused autoplay is not a fault and cannot be retried out of.** Every
   * engine reserves the right to decline playback to a page nobody has
   * interacted with, and the only cure is a real gesture — so this is a state
   * the interface has to draw a control for, rather than something the hook
   * can resolve on its own. Until 2026-09-17 the refusal was caught and
   * dropped, which left somebody hearing nothing under a screen that said the
   * audio was connected.
   *
   * Asked as an event rather than once: a tab restored from the background can
   * become blocked long after a connection that was fine, and `guest.ts`
   * watches `AudioPlaybackStatusChanged` for exactly that. False while
   * disconnected, on the same reasoning as `speaking` — there is nothing to
   * play and a button offering to play it is a lie.
   *
   * Always false on iOS, where the native hook owns an audio session instead.
   */
  playbackBlocked: boolean;
  /**
   * Whether the microphone this page was granted appears to be carrying
   * nothing.
   *
   * **A question, not a verdict**, and `core/capture.ts` carries the whole
   * account: on the web every step of the path can succeed and still produce
   * silence, with no event anywhere to report it. Somebody in a quiet room
   * reads the same way, so what the screen says is what was observed.
   *
   * Settled per microphone rather than continuously — one sample above the
   * floor ends the question and the meter stops. False again whenever the
   * track is released, since the next one is a new question.
   *
   * Always false on iOS: the fault is a `WKWebView` that owns somebody else's
   * audio session, and the installed app is never inside one.
   */
  micSilent: boolean;
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
  /**
   * Asks the browser again to let this page make sound, from inside whatever
   * gesture called it.
   *
   * It must be wired to something a person presses, and the press is the whole
   * point: calling this from an effect asks the same question that was already
   * refused. `guest.html`'s `#unmute-page` is the shape it is drawn as there.
   *
   * A no-op on iOS.
   */
  allowPlayback: () => void;
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
    playbackBlocked: false,
    micSilent: false,
    asked: null,
    reconnect: () => {},
    resubscribe: () => {},
    allowPlayback: () => {},
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

  /**
   * Asks the browser to play, and records its answer either way.
   *
   * Written to read `roomRef` rather than to close over a room, so that the
   * button the interface draws survives a reconnection without being rebound.
   */
  const allowPlayback = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    void (async () => {
      try {
        await room.startAudio();
      } catch {
        // Refused again, which the patch below is about to say.
      }
      patch({ playbackBlocked: !room.canPlaybackAudio });
    })();
  }, [patch]);

  /** The running meter, and the track it is a question about. */
  const meterRef = useRef<{ stop: () => void } | null>(null);
  const watchedRef = useRef<MediaStreamTrack | null>(null);

  const stopCapture = useCallback(() => {
    meterRef.current?.stop();
    meterRef.current = null;
    watchedRef.current = null;
  }, []);

  /**
   * Starts listening to a newly published microphone, and to each one only
   * once.
   *
   * **Keyed on the track rather than on the intent**, because this effect runs
   * again on every mute and unmute and re-arming there would restart the count
   * each time — which on somebody who mutes between sentences is a meter that
   * can never reach its verdict. A mute is not a new microphone; a republish
   * is.
   */
  const armCapture = useCallback(
    (track: Capturing) => {
      if (watchedRef.current === track.mediaStreamTrack) return;
      stopCapture();
      patch({ micSilent: false });
      watchedRef.current = track.mediaStreamTrack;
      meterRef.current = watchCapture(track, (silent) => patch({ micSilent: silent }));
    },
    [patch, stopCapture]
  );

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
      stopCapture();
      patch({
        status: 'idle',
        message: null,
        speaking: [],
        failing: [],
        playbackBlocked: false,
        micSilent: false,
      });
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

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _pub: unknown, participant: Participant) => {
        for (const element of track.detach()) element.remove();
        if (cancelled) return;
        patch({ othersAudible: countAudible(room) });
        if (track.kind !== Track.Kind.Audio) return;
        // **And they stop being somebody this tab knows anything about.** The
        // SFU scopes its speaker updates to what a listener is subscribed to,
        // so the reports stop with the subscription and nothing further can
        // ever take them out of the set. Every floor claim does exactly this,
        // withholding being unsubscription. See the phone's copy of this hook,
        // and `ChannelView.speakingWhileWithheld` for what says who is talking
        // once nobody can hear them.
        setState((previous) =>
          previous.speaking.includes(participant.identity)
            ? {
                ...previous,
                speaking: previous.speaking.filter(
                  (id) => id !== participant.identity
                ),
              }
            : previous
        );
      }
    );

    room.on(RoomEvent.ActiveSpeakersChanged, readSpeakers);

    // The browser's own opinion about whether this page may make noise, which
    // it may change at any time — a tab restored from the background, a policy
    // that did not apply when the page loaded. Watched rather than asked once,
    // so the control appears whenever the answer becomes no.
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (cancelled) return;
      patch({ playbackBlocked: !room.canPlaybackAudio });
    });

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
      // Neither question is about this room any more: nothing is playing, and
      // the microphone goes with the publication.
      stopCapture();
      patch({ playbackBlocked: false, micSilent: false });
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
      // `micSilent` clears here rather than in the teardown: a rebuilt room
      // publishes a new microphone, so the old verdict is about a track
      // nothing will ever hear again, and leaving it up would carry a notice
      // across a reconnection that answers it.
      patch({ status: 'connecting', message: null, micSilent: false });
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
        // Autoplay: attempted immediately, and it may simply be refused. The
        // gesture that got somebody here — a tap on a channel — is several
        // seconds and a round trip ago, which may or may not still count, so
        // this is tried and then reported rather than assumed either way.
        try {
          await room.startAudio();
        } catch {
          // Refused. `allowPlayback` is the second chance and it needs a
          // press; the interface draws one while `playbackBlocked` holds.
        }
        if (!cancelled) patch({ playbackBlocked: !room.canPlaybackAudio });
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
      stopCapture();
      void room.disconnect();
      roomRef.current = null;
    };
  }, [mediaRoom, channelId, token, generation, patch, stopCapture]);

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
          stopCapture();
          if (!cancelled) patch({ micOpen: false, micSilent: false });
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        const published = [...room.localParticipant.audioTrackPublications.values()];
        for (const publication of published) {
          if (intent === 'muted') await publication.track?.mute();
          else await publication.track?.unmute();
        }
        // Whatever is published is what the room will hear, so it is what the
        // meter asks about — including while muted, which it counts as no
        // reading rather than as quiet.
        const track = published[0]?.track;
        if (track && !cancelled) armCapture(track);
        if (!cancelled) patch({ micOpen: intent === 'capturing' });
      } catch (error) {
        if (cancelled) return;
        stopCapture();
        // A refused microphone is a decision by a person, not a fault.
        patch({
          status: 'denied',
          micOpen: false,
          micSilent: false,
          message:
            'Your browser would not give this page a microphone. Check its permissions.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [micNeeded, selfMuted, state.status, patch, armCapture, stopCapture]);

  const resubscribe = useCallback(() => {
    rebindTracks(roomRef.current, null);
  }, []);

  return { ...state, reconnect, resubscribe, allowPlayback };
}

/** What the meter needs of a track, which every local audio track satisfies. */
interface Capturing {
  mediaStreamTrack: MediaStreamTrack;
  isMuted: boolean;
}

/**
 * Listens to what the microphone is publishing, and reports when it is
 * nothing.
 *
 * The counting is `core/capture.ts` and the account of the failure is there;
 * what is here is the half that cannot be pure. Four samples a second, which
 * is what `PATIENCE` is eight seconds of.
 *
 * **The analyser is connected to nothing downstream** — connecting it to the
 * destination is how you build an echo — and the samples never leave this
 * function. It stops itself the moment the question is settled either way:
 * an `AudioContext` per open microphone is worth paying for an answer and not
 * worth paying to keep confirming one.
 *
 * Null when the engine has no `AudioContext` at all, which is not a failure to
 * report — a browser that cannot measure the microphone has said nothing about
 * it, and `micSilent` stays false.
 */
function watchCapture(
  track: Capturing,
  verdict: (silent: boolean) => void
): { stop: () => void } | null {
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();
  void context.resume();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context
    .createMediaStreamSource(new MediaStream([track.mediaStreamTrack]))
    .connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let watch = startWatch();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    // Swallowed: closing a context twice rejects, and a meter that has settled
    // itself is routinely stopped again by its owner.
    void context.close().catch(() => {});
  };

  timer = setInterval(() => {
    // A suspended context and a muted track are both silence that means
    // nothing about the microphone, so they are not counted rather than being
    // counted as quiet.
    let peak: number | null = null;
    if (context.state === 'running' && !track.isMuted) {
      analyser.getFloatTimeDomainData(samples);
      peak = 0;
      for (const level of samples) peak = Math.max(peak, Math.abs(level));
    }
    watch = sample(watch, peak);
    if (watch.verdict === 'waiting') return;
    verdict(watch.verdict === 'silent');
    stop();
  }, 250);

  return { stop };
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

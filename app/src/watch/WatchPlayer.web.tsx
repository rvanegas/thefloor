import { useEffect, useRef, useState } from 'react';
import type { WatchState } from '../../../core/types';
import type { PlayerState } from '../../../core/watch';
import { useFollow, type PlayerPort } from './drive';
import { useKeepAwake } from './keepAwake';

/**
 * The film, in the web app, in the tab the channel is already open in.
 *
 * **The Floor still carries no video.** This is YouTube's own IFrame player,
 * unmodified and unobscured; nothing here fetches, decodes, stores or
 * republishes a frame, and what travels through this application is still a
 * position and a clock. What has changed since 2026-08-23 is only which window
 * the player is in — and on the web that costs no native module, no rebuild
 * and no review.
 *
 * The API script is loaded once per document and shared. Two players in one
 * tab cannot happen today; loading it twice would break the one that can.
 */
const API_SRC = 'https://www.youtube.com/iframe_api';

/** YouTube's numbers, which core must not know about. */
const STATES: Record<number, PlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'unstarted',
};

interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: unknown) => YouTubePlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Resolves once YouTube's API is on the page, loading it the first time. */
function iframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  const existing = document.querySelector(`script[src="${API_SRC}"]`);
  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (existing) return;
    const script = document.createElement('script');
    script.src = API_SRC;
    document.head.appendChild(script);
  });
}

export function WatchPlayer({
  watch,
  channelId,
  onDuration,
}: {
  watch: WatchState;
  channelId: string;
  /**
   * How long the video is, the first time this player knows. The channel
   * learns it from whoever loads first; see `learnDuration`.
   */
  onDuration: (durationMs: number) => void;
}): React.ReactElement {
  const mount = useRef<HTMLDivElement | null>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const [port, setPort] = useState<PlayerPort | null>(null);
  const told = useRef(false);
  const videoId = watch.party?.videoId ?? null;

  useKeepAwake(`watch:${channelId}`, watch.status === 'playing');

  useEffect(() => {
    if (!videoId) return;
    let dead = false;
    told.current = false;

    void iframeApi().then(() => {
      if (dead || !mount.current || !window.YT) return;
      // **Cued rather than loaded**, which is the documented difference and the
      // one that matters here: a party that is paused must come up showing its
      // first frame and its title, not playing. `loadVideoById` would start it,
      // and the transport would then pause it a tick later — a burst of sound
      // on somebody else's evening.
      const made = new window.YT.Player(mount.current, {
        videoId,
        playerVars: {
          // Required for iOS Safari to play in the page rather than taking
          // over the screen, and harmless everywhere else.
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          // **The picture is not a control** — see the native page, which
          // carries the whole of why. The transport is the app's own row.
          controls: 0,
          disablekb: 1,
        },
        events: {
          onReady: () => {
            if (dead) return;
            player.current = made;
            setPort({
              read: () => {
                const p = player.current;
                if (!p) return null;
                const state = STATES[p.getPlayerState()] ?? 'unstarted';
                const seconds = p.getCurrentTime?.();
                // **The advert's own length, when one is running**, which is
                // what `showingTheFilm` reads it for — not a second opinion
                // about the film's.
                const length = p.getDuration?.();
                return {
                  state,
                  positionMs:
                    typeof seconds === 'number' ? seconds * 1000 : null,
                  durationMs:
                    typeof length === 'number' && length > 0
                      ? length * 1000
                      : null,
                };
              },
              play: () => player.current?.playVideo(),
              pause: () => player.current?.pauseVideo(),
              seek: (ms) => player.current?.seekTo(ms / 1000, true),
            });
          },
          onStateChange: () => {
            // The duration is not known at ready and turns up whenever the
            // player learns it, which is why this is read here rather than
            // once. Said once per party — the channel keeps the first answer.
            const p = player.current;
            if (!p || told.current) return;
            const seconds = p.getDuration?.();
            if (typeof seconds === 'number' && seconds > 0) {
              told.current = true;
              onDuration(Math.round(seconds * 1000));
            }
          },
        },
      });
    });

    return () => {
      dead = true;
      setPort(null);
      try {
        player.current?.destroy();
      } catch {
        // A player torn down with the page under it. Nothing to say.
      }
      player.current = null;
    };
    // `onDuration` deliberately absent: it is rebuilt on every render of the
    // screen above, and listing it would tear the player down mid-film.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useFollow(watch, port, true);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: '#000',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/*
        **Inert, not hidden, for a screen that may not drive.** YouTube's bar
        is inside the frame and cannot be taken off it without taking the
        picture too, so the frame stops answering instead — the same thing the
        greyed buttons in the channel say, said by the player. Nothing is
        drawn over it and nothing about it changes: it is still YouTube's own,
        visible and unobscured. `controls` would have been the other way, and
        it is fixed when the embed is built, so the floor moving mid-party
        would have reloaded the film to take the bar away.
      */}
      <div
        style={{
          width: '100%',
          height: '100%',
          // Inert for everybody, the bar having gone: there is nothing on
          // the picture to press, so a frame that answers a finger can only
          // do something nobody asked for. See the native page.
          pointerEvents: 'none',
        }}
      >
        {/*
          The mount is a child rather than this element itself: `YT.Player`
          replaces the node it is given with its iframe, so anything styled
          on that node is gone the moment the player is built.
        */}
        <div ref={mount} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

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
  /**
   * What the embed is showing, which includes its name.
   *
   * **Optional because it is undocumented.** It has been on the IFrame
   * player for years and is not in YouTube's reference, so it is declared as
   * a method that may not be there and read through `?.` — an embed without
   * it names nothing, which is the state every party was in before
   * 2026-09-20.
   */
  getVideoData?: () => { title?: string; video_id?: string };
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
}

/**
 * What the embed says it is showing, or null when it will not say.
 *
 * **Undocumented, so it is asked for behind a guard and never depended on.**
 * `getVideoData` has been on the IFrame player for years and is not in
 * YouTube's reference; an embed without it returns null here, and both callers
 * fall back to what they did before there was an id to read.
 */
function videoData(
  player: YouTubePlayer
): { title?: string; video_id?: string } | null {
  try {
    return player.getVideoData?.() ?? null;
  } catch {
    return null;
  }
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
  onFilm,
  onRefusal: _onRefusal,
  fill = false,
}: {
  watch: WatchState;
  channelId: string;
  /**
   * How long the video is, the first time this player knows. The channel
   * learns it from whoever loads first; see `learnDuration`.
   */
  /** See the native player: how long the film runs, and what it is called. */
  onFilm: (durationMs: number, title: string | null) => void;
  /**
   * Taken and never called, this player having no `onError` of its own: a
   * refusal in a browser shows as YouTube's own message inside the frame and
   * nothing above it is told. Declared so the two players take the same props
   * and the screen above does not have to know which one it has — the
   * expanded picture simply has one fewer automatic way out here than it has
   * on a phone. Worth wiring up the day the web player learns to hear
   * `onError`.
   */
  onRefusal?: (message: string | null) => void;
  /** Fill the space given rather than being a 16:9 card. See WatchPlayer.tsx. */
  fill?: boolean;
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
                  // Which video is in the frame, which during a pre-roll is
                  // the advert's. See `showingTheFilm`.
                  videoId: videoData(p)?.video_id ?? null,
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
              const data = videoData(p);
              /*
                **Not from an advert**, which is the whole of the fix that
                WatchPlayer.tsx carries the account of: the party keeps the
                first length it is told and a pre-roll is the first thing any
                player can measure, so a thirty-second spot became the film's
                length for the rest of the evening.
              */
              if (
                data?.video_id != null && data.video_id !== videoId
              ) {
                return;
              }
              told.current = true;
              // The name rides with the length, off the player rather than
              // out of a request — `getVideoData` is the embed describing
              // what it already has. Optional on the object as well as in the
              // action, being undocumented.
              onFilm(Math.round(seconds * 1000), data?.title ?? null);
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
    // `onFilm` deliberately absent: it is rebuilt on every render of the
    // screen above, and listing it would tear the player down mid-film.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useFollow(watch, port, true);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        ...(fill
          ? { height: '100%', borderRadius: 0 }
          : { aspectRatio: '16 / 9', borderRadius: 12 }),
        background: '#000',
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

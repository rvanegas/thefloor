import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WatchState } from '../../../core/types';
import type { PlayerState } from '../../../core/watch';
import { useFollow, type PlayerPort } from './drive';
import { useKeepAwake } from './keepAwake';

/**
 * The film, on a phone, inside the app.
 *
 * **The Floor still carries no video**, and this is the change that most looks
 * like it does. What is inside the WebView is YouTube's own IFrame player,
 * unmodified, unobscured and playing its own audio with its own picture;
 * nothing here fetches, decodes, stores or republishes a frame, and what
 * travels through this application is still a position and a clock. The App
 * Review note that says the app never *shows* a frame stops being true and has
 * to be rewritten — see planning/WATCH-IN-APP.md § *App Review*.
 *
 * **The rule lives in core and the reading crosses a bridge.** The page inside
 * posts what the player is doing every quarter second and takes commands back;
 * `followInstructions` runs out here in TypeScript, where the web player and
 * the follower page run it too. Putting the decision inside the page would
 * have meant a third copy of the arithmetic with no way to share it, this
 * being a string rather than a module.
 *
 * `react-native-webview` is a native module, so this arrives with a rebuild —
 * the thing the 2026-08-23 design deferred it for. It is autolinked and needs
 * no config plugin.
 */

/** Twice the follow tick, so a reading is never the stale half of one. */
const REPORT_MS = 250;

/**
 * The page, which is a player and a postbox and nothing else.
 *
 * A template string for `watch-page.ts`'s reasons — no build step between a
 * fresh checkout and a working player, and nothing for a bundler to lose — but
 * far smaller than that one, because every decision it used to make is made
 * outside it now.
 */
function page(videoId: string): string {
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html,body{margin:0;background:#000;height:100%;overflow:hidden}
  #p{width:100%;height:100%}
</style></head>
<body><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
(function(){
  var player = null;
  var post = function (payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  };
  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('p', {
      videoId: ${JSON.stringify(videoId)},
      playerVars: {
        // Without this iOS takes the video full screen the moment it plays,
        // which puts the channel behind a system player nobody can drive.
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        // Nothing may start by itself: the transport says when, and a page
        // that began playing on load would be a burst of somebody else's film.
        autoplay: 0
      },
      events: {
        onReady: function () { post({ t: 'ready' }); },
        onStateChange: function () { report(); }
      }
    });
  };
  function report() {
    if (!player || !player.getPlayerState) return;
    var seconds = player.getCurrentTime ? player.getCurrentTime() : null;
    var length = player.getDuration ? player.getDuration() : 0;
    post({
      t: 'reading',
      state: player.getPlayerState(),
      positionMs: typeof seconds === 'number' ? seconds * 1000 : null,
      durationMs: length > 0 ? Math.round(length * 1000) : null
    });
  }
  setInterval(report, ${REPORT_MS});
  // Commands arrive as messages rather than as injected calls, so that one
  // channel carries both directions and a command sent before the player
  // exists is dropped here rather than throwing inside the host.
  document.addEventListener('message', handle);
  window.addEventListener('message', handle);
  function handle(event) {
    if (!player) return;
    var command;
    try { command = JSON.parse(event.data); } catch (e) { return; }
    if (command.do === 'play' && player.playVideo) player.playVideo();
    else if (command.do === 'pause' && player.pauseVideo) player.pauseVideo();
    else if (command.do === 'seek' && player.seekTo) {
      player.seekTo(command.positionMs / 1000, true);
    }
  }
})();
</script></body></html>`;
}

/** YouTube's numbers, mapped at the edge so core never meets one. */
const STATES: Record<number, PlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'unstarted',
};

export function WatchPlayer({
  watch,
  channelId,
  onDuration,
}: {
  watch: WatchState;
  channelId: string;
  onDuration: (durationMs: number) => void;
}): React.ReactElement | null {
  const view = useRef<WebView | null>(null);
  const reading = useRef<{
    state: PlayerState;
    positionMs: number | null;
  } | null>(null);
  const told = useRef(false);
  const [ready, setReady] = useState(false);
  const videoId = watch.party?.videoId ?? null;

  useKeepAwake(`watch:${channelId}`, watch.status === 'playing');

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: {
        t?: string;
        state?: number;
        positionMs?: number | null;
        durationMs?: number | null;
      };
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (payload.t === 'ready') {
        setReady(true);
        return;
      }
      if (payload.t !== 'reading') return;
      reading.current = {
        state: STATES[payload.state ?? -1] ?? 'unstarted',
        positionMs: payload.positionMs ?? null,
      };
      if (!told.current && payload.durationMs) {
        told.current = true;
        onDuration(payload.durationMs);
      }
    },
    [onDuration]
  );

  const port = useMemo<PlayerPort | null>(() => {
    if (!ready) return null;
    const command = (payload: unknown) =>
      view.current?.postMessage(JSON.stringify(payload));
    return {
      read: () => reading.current,
      play: () => command({ do: 'play' }),
      pause: () => command({ do: 'pause' }),
      seek: (positionMs: number) => command({ do: 'seek', positionMs }),
    };
  }, [ready]);

  useFollow(watch, port, true);

  if (!videoId) return null;

  return (
    <View style={styles.frame}>
      <WebView
        ref={view}
        // Keyed on the video so swapping films rebuilds the page rather than
        // navigating it. A party's film changing is rare and a fresh player is
        // the honest way to meet it.
        key={videoId}
        source={{ html: page(videoId), baseUrl: 'https://www.youtube.com' }}
        onMessage={onMessage}
        // Without this iOS refuses to play anything in the page at all.
        allowsInlineMediaPlayback
        // The transport decides when a film starts, so the page must be
        // allowed to start it without a tap of its own.
        mediaPlaybackRequiresUserAction={false}
        // Nothing in this page scrolls, and a bouncing video is a video that
        // looks broken.
        scrollEnabled={false}
        bounces={false}
        // Nothing here needs a back stack, a file picker or a third party's
        // cookies beyond the player's own.
        allowsBackForwardNavigationGestures={false}
        javaScriptEnabled
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  web: { flex: 1, backgroundColor: '#000' },
});

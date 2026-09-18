import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WatchState } from '../../../core/types';
import type { PlayerReading, PlayerState } from '../../../core/watch';
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
 * Who the page says it is, and it may not be YouTube.
 *
 * `loadHTMLString` gives the document whatever origin this base carries, and
 * the IFrame API sends that origin to the embed. **Both ends of the range fail
 * and they fail differently**: no base at all leaves an opaque origin and the
 * embed answers error 153, and `https://www.youtube.com` — which reads like
 * the safe choice and is what this shipped with — makes the page claim to be
 * YouTube embedding itself, which answers error 152. A real origin that is not
 * YouTube's is the only thing that plays.
 *
 * Measured rather than reasoned: a WKWebView harness loading this exact page
 * under each base, on 2026-09-17. The trailing slash matters to nothing here
 * but is what the origin is derived from, so it stays.
 *
 * It is this app's own host rather than `API_URL`, deliberately: what the
 * embed checks is who the page claims to be, not who it talks to, and a
 * session pointed at a LAN server in development must not become a page with a
 * plain-http identity that YouTube then judges on its own terms.
 */
const PAGE_ORIGIN = 'https://thefloor.rvanegas.co/';

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
  #frame,#p{width:100%;height:100%}
</style></head>
<body><div id="frame"><div id="p"></div></div>
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
        // **The picture is not a control.** YouTube's own bar is an input
        // surface on the player the channel drives as an output surface, and
        // the API never says which of the two caused a state change — so a
        // follower watching this player could not tell a thumb from the echo
        // of its own command. Four days of arrangements to separate them
        // each traded a misread against a swallowed press. Taking the bar
        // away removes the question. The transport is the app's own row.
        controls: 0,
        // The same surface reached by a key rather than a finger.
        disablekb: 1,
        // Nothing may start by itself: the transport says when, and a page
        // that began playing on load would be a burst of somebody else's film.
        autoplay: 0
      },
      events: {
        onReady: function () { post({ t: 'ready' }); },
        onStateChange: function () { report(); },
        // A player that refuses says so once and then sits there black. Left
        // unreported it looks exactly like a player that is merely slow, which
        // is how error 152 survived a release.
        onError: function (event) { post({ t: 'error', code: event.data }); }
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
    var command;
    try { command = JSON.parse(event.data); } catch (e) { return; }
    // Before the player rather than after it: whether the frame answers a
    // finger is a fact about the document, and is settled while the embed is
    // still loading.
    if (command.do === 'interactive') {
      // **Inert for everybody, the bar having gone.** There is nothing on the
      // picture to press any more, so a frame that answers a finger can only
      // do something nobody asked for — a tap toggling play is not documented
      // either way, and belt and braces costs nothing now that no control is
      // being taken away. The one exception is a refusal, where the only
      // thing left in the frame is YouTube's own explanation and the way out
      // it offers.
      var frame = document.getElementById('frame');
      if (frame) frame.style.pointerEvents = command.on ? 'auto' : 'none';
      return;
    }
    if (!player) return;
    if (command.do === 'play' && player.playVideo) player.playVideo();
    else if (command.do === 'pause' && player.pauseVideo) player.pauseVideo();
    else if (command.do === 'seek' && player.seekTo) {
      player.seekTo(command.positionMs / 1000, true);
    }
  }
})();
</script></body></html>`;
}

/**
 * What a refusal means, in the words of somebody watching rather than YouTube's.
 *
 * The codes that survive the origin being right are the owner's: a video that
 * may not be played outside YouTube, or one that is no longer there. 152 and
 * 153 are this page's own fault and are named as such — see `PAGE_ORIGIN` —
 * because the next person to see one needs to be sent there and not to the
 * video's owner.
 */
function refusal(code: number): string {
  if (code === 101 || code === 150) {
    return 'The owner of this video does not allow it to play outside YouTube.';
  }
  if (code === 100) return 'This video is gone — deleted, or private.';
  if (code === 2) return 'That link is not a video YouTube knows.';
  if (code === 152 || code === 153) {
    return `YouTube refused this player (${code}) — the app is at fault, not the video.`;
  }
  return `YouTube could not play this video (${code}).`;
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
  const reading = useRef<PlayerReading | null>(null);
  const told = useRef(false);
  const [ready, setReady] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const videoId = watch.party?.videoId ?? null;

  useKeepAwake(`watch:${channelId}`, watch.status === 'playing');

  // The WebView is keyed on the video, so a party changing film rebuilds the
  // page — but this component is not rebuilt with it, and everything it knows
  // was about the last one: a player that is ready, a refusal that was that
  // video's, and a duration already reported. Changing film is rare enough
  // that this was never seen; it would have shown as a new video the channel
  // never learned the length of.
  useEffect(() => {
    setReady(false);
    setRefused(null);
    reading.current = null;
    told.current = false;
  }, [videoId]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: {
        t?: string;
        state?: number;
        code?: number;
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
      if (payload.t === 'error') {
        setRefused(refusal(payload.code ?? 0));
        return;
      }
      if (payload.t !== 'reading') return;
      reading.current = {
        state: STATES[payload.state ?? -1] ?? 'unstarted',
        positionMs: payload.positionMs ?? null,
        // **The advert's own length, when one is running**, which is what
        // `showingTheFilm` reads it for — not a second opinion about the
        // film. See `learnDuration` for why the party keeps only the first.
        durationMs: payload.durationMs ?? null,
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

  /*
    **Whether the frame answers a finger, said to the page rather than drawn
    over it.**

    It cannot be a player parameter: `controls` is fixed when the embed is
    built, and the floor moves mid-party — somebody stepping in to say
    something would otherwise reload everybody else's film to take the bar
    away from them. A command costs nothing and lands in the same tick.

    A refused video is interactive whatever the floor says, because the only
    thing left in the frame is YouTube's own explanation and the way out it
    offers, and making that unpressable for everybody but the floor-holder
    would be taking away an escape rather than a control.
  */
  useEffect(() => {
    if (!ready) return;
    view.current?.postMessage(
      JSON.stringify({ do: 'interactive', on: refused !== null })
    );
  }, [ready, refused]);

  if (!videoId) return null;

  return (
    <View style={styles.frame}>
      <WebView
        ref={view}
        // Keyed on the video so swapping films rebuilds the page rather than
        // navigating it. A party's film changing is rare and a fresh player is
        // the honest way to meet it.
        key={videoId}
        source={{ html: page(videoId), baseUrl: PAGE_ORIGIN }}
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
        // **The card is a player, not a browser.** YouTube's own refusal
        // screen offers a *Watch video on YouTube* button, and left to itself
        // the WebView follows it — which turns an inch of the channel into a
        // mobile YouTube page, chrome and all, still inside the Watch tab.
        // Anything below the top frame is the embed doing its own work and is
        // allowed; a top-frame navigation away from the page is taken as the
        // request to leave that it is, and handed to whatever opens YouTube
        // links on this phone.
        onShouldStartLoadWithRequest={(request) => {
          if (!request.isTopFrame) return true;
          if (request.url === PAGE_ORIGIN || request.url === 'about:blank') {
            return true;
          }
          void Linking.openURL(request.url).catch(() => {});
          return false;
        }}
        style={styles.web}
      />
      {refused ? (
        // Over the player rather than instead of it: the frame underneath is
        // YouTube's own message, which says the same thing in its own words
        // and offers the way out. This says which of those two readings it is.
        <View style={styles.refusal}>
          <Text style={styles.refusalText}>{refused}</Text>
        </View>
      ) : null}
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
  // Pinned to the bottom of the frame so YouTube's own explanation, which sits
  // in the middle of it, is still readable above this one.
  refusal: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  refusalText: { color: '#fff', fontSize: 13, lineHeight: 18 },
});

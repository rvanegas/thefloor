import { WATCH_DRIFT_MS } from '../../core/constants';

/**
 * A value embedded in a `<script>` block, safely.
 *
 * Not `escapeHtml`. Inside a script element the parser is looking for one
 * thing — the literal `</script` — and HTML entities mean nothing there, so
 * the function that is right for an attribute is precisely wrong here.
 * `JSON.stringify` handles the JavaScript half; escaping `<` handles the HTML
 * half, and the result is still valid JSON to the parser that reads it.
 *
 * Channel ids cannot contain a `<` today. This is here so that the rule is
 * about the position rather than about today's ids.
 */
function inScript(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The screen half of a watch party: a page that follows a channel's transport
 * and drives YouTube's own player.
 *
 * A template string rather than a file on disk, unlike the guest page. That
 * one is a React application with a build step and a bundle; this is one
 * player, one socket and about a hundred lines of arithmetic, and keeping it
 * here buys three things — no runtime path resolution, no `npm run build:web`
 * standing between a fresh checkout and a working page, and nothing for a
 * `--delete` rsync to leave behind.
 *
 * It shares nothing with `html.ts`'s `page()` except the escaping. That helper
 * wraps documents — prose in a column, no script — and this is an interface
 * whose whole content is a video that has to fill the window.
 *
 * **The Floor carries no video.** This page loads the real YouTube player,
 * visible and unobscured, and everything that arrives from the server is a
 * clock: a status, a position, and the moment the current run began. Nothing
 * is fetched, decoded, published or stored by us, which is what makes the
 * feature legitimate and also why a channel running one refuses to record.
 */
export function watchPage(options: {
  /** The channel this page follows. In the path, so the socket knows it early. */
  channelId: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Watching together · The Floor</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0b0b0d; color: #f4f4f5;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; height: 100vh;
  }
  #stage { flex: 1; position: relative; background: #000; }
  #player, #player iframe { position: absolute; inset: 0; width: 100%; height: 100%; }
  #status {
    padding: 0.75rem 1rem; font-size: 0.9rem; color: #a1a1aa;
    display: flex; justify-content: space-between; gap: 1rem;
    border-top: 1px solid #27272a;
  }
  #status strong { color: #f4f4f5; font-weight: 600; }
  /*
    min-width: 0 is what makes the ellipsis below work at all: a flex item
    will not shrink past its content otherwise, so a long video title would
    push the controls off the right of the window rather than truncate.
  */
  #left { display: flex; flex-direction: column; min-width: 0; }
  #title {
    color: #f4f4f5; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #title:empty { display: none; }
  #channel { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #channel:empty { display: none; }
  #right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
  #copy, #fullscreen {
    font: inherit; font-size: 0.85rem; color: #f4f4f5; cursor: pointer;
    background: #27272a; border: 1px solid #3f3f46; border-radius: 0.35rem;
    padding: 0.3rem 0.7rem;
  }
  #copy:hover, #fullscreen:hover { background: #3f3f46; }
  #copy:disabled { opacity: 0.5; cursor: default; }
  /*
    Both hidden until the API each needs is known to exist — see
    fullscreenSupported and the clipboard check. A control that does nothing is
    worse than no control: iPhone Safari has no element fullscreen, and a page
    served over plain http has no clipboard.
  */
  #copy[hidden], #fullscreen[hidden] { display: none; }
  /*
    Fullscreen is taken on the root element rather than on the stage, so the
    status line survives it. That line is the only evidence on this screen that
    the page is still following the channel — a video filling the display with
    no indication of whether it is still in step would be the wrong trade.

    The rules below are defensive. The root element being fullscreen means the
    viewport is the display, which is what height: 100vh on the body already
    assumes; browsers vary in what they do to a fullscreened root, so this
    states it rather than relying on the default.
  */
  :root:fullscreen body { height: 100vh; }
  :root:-webkit-full-screen body { height: 100vh; }
  /*
    The gate. Browsers will not start audio without a gesture, so the page
    cannot simply begin — and a player that silently refuses to start is the
    worst version of this, since the transport says playing and the screen
    does not. One tap, said plainly, covering the stage until it is taken.
  */
  #gate {
    position: absolute; inset: 0; z-index: 2; display: flex;
    flex-direction: column; align-items: center; justify-content: center;
    gap: 0.5rem; background: #0b0b0dee; text-align: center; padding: 2rem;
    border: 0; color: inherit; font: inherit; cursor: pointer; width: 100%;
  }
  #gate span { font-size: 1.25rem; font-weight: 600; }
  #gate small { color: #a1a1aa; }
  /* Held to a readable measure, this one being a sentence rather than a label. */
  #gate .advice { max-width: 26rem; margin-top: 0.75rem; color: #d4d4d8; }
  #gate[hidden] { display: none; }
</style>
</head>
<body>
<div id="stage">
  <div id="player"></div>
  <button id="gate" type="button">
    <span>Tap to join the watch party</span>
    <small>Your browser will not start a video on its own.</small>
    <!--
      The headphone line, on the gate because the gate is the last moment
      before this screen makes any sound — which is exactly when it can still
      be acted on. Told to the screen as well as to the phone, since the person
      reading this is often not the person holding the phone that will do the
      transmitting.
    -->
    <small class="advice">Wear headphones — an open microphone nearby will
    send this audio back into the channel, and everybody will hear it twice.</small>
  </button>
</div>
<div id="status">
  <!--
    What is being watched and where, which is the half of the footer that says
    *which* party this screen is following. It matters most with two pages
    open: before this, two channels watching two videos gave two identical
    footers.
  -->
  <span id="left">
    <span id="title"></span>
    <span id="channel"></span>
  </span>
  <span id="right">
    <span id="what">Connecting…</span>
    <span id="where"></span>
    <button id="copy" type="button" hidden>Copy link</button>
    <button id="fullscreen" type="button" hidden>Full screen</button>
  </span>
</div>
<script>
(function () {
  'use strict';

  var CHANNEL_ID = ${inScript(options.channelId)};
  var DRIFT_MS = ${WATCH_DRIFT_MS};

  /*
    The credential comes out of the fragment and stays there.

    A fragment is never sent to a server: it reaches no access log, no
    Referer header and no proxy. So the link can be pasted into a chat window
    with the same exposure a channel id has, and the only thing that ever sees
    the token is this script, which sends it exactly once, to the socket.
  */
  var token = location.hash.slice(1);
  var what = document.getElementById('what');
  var where = document.getElementById('where');
  var gate = document.getElementById('gate');
  var titleEl = document.getElementById('title');
  var channelEl = document.getElementById('channel');
  var copyButton = document.getElementById('copy');

  function say(text) { what.textContent = text; }

  if (!token) {
    say('This link is missing its key. Ask for a new one.');
    return;
  }

  /* What the server last told us, and what our clock says its clock says. */
  var watch = null;
  var offset = 0;
  var player = null;
  var ready = false;
  var started = false;
  var reportedDuration = false;

  /*
    The same derivation core/watch.ts makes, and it has to be: the phone's
    readout and this page's correction are answers to one question, and a page
    with its own arithmetic would drift from the transport it is following.
    Kept in step by being three lines rather than by being imported — this
    script is served as a string and has no module system.
  */
  function positionMs() {
    if (!watch) return 0;
    if (watch.status !== 'playing' || watch.startedAt === null) {
      return watch.positionMs;
    }
    var elapsed = watch.positionMs + (Date.now() + offset - watch.startedAt);
    var length = watch.party && watch.party.durationMs;
    return length ? Math.min(elapsed, length) : elapsed;
  }

  /*
    The video's title, read off the player rather than fetched.

    Nothing on this server ever asks YouTube anything — that is the whole
    premise of the feature — so the title comes from the same place the
    duration does: the player already showing the video. Unlike the duration it
    is **not** sent to the channel, because nothing there needs it. Every
    follower is watching the same video and will read the same title off its
    own player, so putting it in the snapshot would be a wire field, a
    migration and a restore rule to carry a string each page already has.

    getVideoData is not in YouTube's published method list, though it has been
    stable for years and is what every player on the web uses for this. Guarded
    accordingly: if it ever goes, the title is blank and the footer loses a
    line it never promised.
  */
  function paintTitle() {
    if (!player || !player.getVideoData) return;
    var data;
    try {
      data = player.getVideoData();
    } catch (error) {
      return;
    }
    titleEl.textContent = (data && data.title) || '';
  }

  function mmss(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // --- The socket ---------------------------------------------------------

  var socket = null;
  var attempt = 0;

  function connect() {
    var scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(
      scheme + '://' + location.host + '/ws?token=' + encodeURIComponent(token)
    );

    socket.onopen = function () {
      attempt = 0;
      socket.send(JSON.stringify({ type: 'watch.channel', channelId: CHANNEL_ID }));
    };

    socket.onmessage = function (event) {
      var message;
      try { message = JSON.parse(event.data); } catch (error) { return; }

      if (message.type === 'hello') {
        offset = message.serverNow - Date.now();
        return;
      }
      if (message.type === 'pong') {
        offset = message.serverNow - Date.now();
        return;
      }
      if (message.type === 'error') {
        say(message.message);
        return;
      }
      if (message.type === 'channel.gone') {
        say('That channel is gone.');
        return;
      }
      if (message.type !== 'channel') return;

      /*
        Every snapshot carries the server's clock, and this is what it is for:
        the transport is a position plus a start time in the server's terms,
        and a device an hour fast would seek an hour into every video.
      */
      offset = message.view.serverNow - Date.now();
      /*
        The channel's own name, when it has one.

        Unnamed channels show nothing rather than falling back to the roster,
        and the reason is the screen this runs on. The app describes an unnamed
        channel by who is in it, which is right for a phone in somebody's hand
        and wrong for a laptop propped up in a room: it would put the names of
        everybody in the conversation on a display other people can see. A
        blank line costs the reader nothing — they know which channel they
        opened.
      */
      channelEl.textContent = message.view.channel.name || '';
      apply(message.view.channel.watch);
    };

    socket.onclose = function () {
      /*
        The same backoff the app uses, and the same reason: a server restart
        drops every socket at once, and a page that retried immediately would
        spend the restart hammering a port nothing is listening on. Capped at
        ten seconds, so a deploy costs a page at most that.
      */
      attempt += 1;
      var wait = Math.min(500 * Math.pow(2, attempt), 10000);
      say('Reconnecting…');
      setTimeout(connect, wait);
    };
  }

  setInterval(function () {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, 15000);

  // --- The player ---------------------------------------------------------

  window.onYouTubeIframeAPIReady = function () {
    if (!watch || !watch.party) return;
    build(watch.party.videoId);
  };

  function build(videoId) {
    if (player) return;
    player = new YT.Player('player', {
      videoId: videoId,
      playerVars: {
        /*
          The player's own controls are off, and that is the product rather
          than a simplification: the phone is the remote. A page that could
          scrub would be a second authority over a shared transport, and the
          two would disagree the moment anybody used it.
        */
        controls: 0,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: function () {
          ready = true;
          paintTitle();
          follow();
        },
        onStateChange: function () {
          // The title arrives with the metadata rather than at ready, so it is
          // painted on every state change until it lands.
          paintTitle();
          /*
            Reported once, when the player first knows. This is the one fact
            the channel learns from a client rather than deciding — nothing on
            this server ever asks YouTube anything — and the reducer keeps the
            first answer, so a second follower saying something different
            changes nothing.
          */
          if (reportedDuration || !player.getDuration) return;
          var seconds = player.getDuration();
          if (!seconds) return;
          reportedDuration = true;
          if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify({
              type: 'channel.action',
              channelId: CHANNEL_ID,
              action: { type: 'WATCH_READY', durationMs: Math.round(seconds * 1000) },
            }));
          }
        },
        onError: function () {
          say('That video will not play here.');
        },
      },
    });
  }

  function apply(next) {
    var was = watch;
    watch = next;
    paintCopy();

    if (!watch || !watch.party) {
      titleEl.textContent = '';
      if (player && player.stopVideo) player.stopVideo();
      say('Nothing is playing. Start something from the app.');
      where.textContent = '';
      return;
    }

    /*
      A new video swapped into the player that is already here — which is what
      makes the link worth keeping: it is bound to the channel rather than to
      anything being watched, so a second link pasted an hour later arrives on
      the same screens.

      **cueVideoById, never loadVideoById.** The two differ in exactly one
      respect and it is the one that matters here: load plays what it loads,
      cue does not. A party always begins paused — startParty says so — so
      loading would start every open screen playing a video the transport says
      is stopped, and follow() a moment later would yank it back. A burst of
      somebody else's film on a laptop across the room, unasked.

      Cueing leaves the page with **no way to start a video on its own**, which
      is the same rule the missing control bar enforces: the phone is the
      remote. Playback begins in follow() and nowhere else, so a snapshot
      that changes the video *and* says playing — possible if a page missed the
      pause between them — still plays, one line later, because the channel
      said to and not because the player felt like it.
    */
    if (player && was && was.party && was.party.videoId !== watch.party.videoId) {
      reportedDuration = false;
      // Cleared rather than left showing the previous video's title while the
      // new one loads, which would be a footer confidently naming the wrong
      // thing for a second or two.
      titleEl.textContent = '';
      if (player.cueVideoById) player.cueVideoById(watch.party.videoId);
    } else if (!player && window.YT && YT.Player) {
      build(watch.party.videoId);
    }
    follow();
  }

  /*
    Bring the player into line with the transport, in that order: what it
    should be doing, and then where it should be.

    Nothing happens until the gate has been taken. A page whose owner has not
    tapped yet cannot start audio, and calling playVideo into that refusal
    leaves the player in a state it does not report — so the page waits,
    saying so, and catches up the moment it is allowed to.
  */
  function follow() {
    if (!watch || !watch.party) return;
    var at = positionMs();
    where.textContent = mmss(at) +
      (watch.party.durationMs ? ' / ' + mmss(watch.party.durationMs) : '');

    if (!ready) return;
    if (!started) {
      say(watch.status === 'playing' ? 'Playing — tap to join in' : 'Paused');
      return;
    }

    if (watch.failure) {
      say(watch.failure);
    } else {
      say(watch.status === 'playing' ? 'Playing' : 'Paused');
    }

    if (watch.status === 'playing') {
      correct(at);
      if (player.getPlayerState() !== YT.PlayerState.PLAYING) player.playVideo();
    } else if (player.getPlayerState() === YT.PlayerState.PLAYING) {
      player.pauseVideo();
      correct(at);
    }
  }

  /*
    A seek, but only when the drift is worse than the stutter that fixes it.

    Correcting continuously would be the obvious thing and is the wrong one: a
    seek is a visible jump and an audible one, and two people half a second
    apart are watching the same film while two people jumping every four
    seconds are not. WATCH_DRIFT_MS is where that trade was set, and it lives
    in core/constants.ts because it describes the shared clock rather than this
    page.
  */
  function correct(at) {
    if (!player.getCurrentTime) return;
    var here = player.getCurrentTime() * 1000;
    if (Math.abs(here - at) > DRIFT_MS) player.seekTo(at / 1000, true);
  }

  /* Twice a second, which is well inside the tolerance above: what this
     catches is a player that stalled to buffer, which no snapshot reports. */
  setInterval(follow, 500);

  gate.addEventListener('click', function () {
    started = true;
    gate.hidden = true;
    follow();
  });

  // --- Copy the video's link ----------------------------------------------
  //
  // The URL as it was pasted, which the channel keeps for exactly this: the
  // party carries the link as given rather than a reconstruction, so what
  // lands on the clipboard is what somebody chose to share.
  //
  // Worth having on this screen rather than only on the phone because this is
  // the screen the video is on. Somebody watching on a laptop who wants to
  // send it to a friend, or open it in their own tab afterwards, is here and
  // not there.

  var copyTimer = null;

  function paintCopy() {
    // Nothing to copy until there is a party, and a button that copies the
    // empty string is worse than one that is plainly unavailable.
    copyButton.disabled = !watch || !watch.party;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    copyButton.hidden = false;
    paintCopy();
    copyButton.addEventListener('click', function () {
      if (!watch || !watch.party) return;
      navigator.clipboard.writeText(watch.party.url).then(
        function () {
          // Said on the button itself, which is where somebody is looking at
          // the moment they press it. Two seconds, then back — long enough to
          // read and short enough that a second copy is not confused with the
          // first one's acknowledgement.
          copyButton.textContent = 'Copied';
          if (copyTimer) clearTimeout(copyTimer);
          copyTimer = setTimeout(function () {
            copyButton.textContent = 'Copy link';
          }, 2000);
        },
        function () {
          // A refusal by the browser, which nothing here can fix. Said rather
          // than swallowed: a button that appears to do nothing reads as
          // broken, and the reader can still select the URL from the app.
          copyButton.textContent = 'Copy failed';
          if (copyTimer) clearTimeout(copyTimer);
          copyTimer = setTimeout(function () {
            copyButton.textContent = 'Copy link';
          }, 2000);
        }
      );
    });
  }

  // --- Full screen --------------------------------------------------------
  //
  // Taken on our own root element, never on YouTube's player, and the
  // distinction is the whole reason this works at all. The player's own
  // controls are off — see playerVars above — so its fullscreen button does
  // not exist, and handing it back would hand back scrubbing with it. Putting
  // *our* element fullscreen leaves the iframe exactly as it is: controls-less,
  // driven by the channel, with the phone still the remote. The video simply
  // fills the display.
  //
  // The button lives in the status bar rather than being a double-click on the
  // video, because a cross-origin iframe swallows pointer events: a click on
  // the player area never reaches this page. Our own chrome is the only
  // surface here that can be clicked.

  var fsButton = document.getElementById('fullscreen');
  var fsRoot = document.documentElement;

  function fsRequest() {
    return fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
  }

  function fsExit() {
    return document.exitFullscreen || document.webkitExitFullscreen;
  }

  function inFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  /*
    Feature-detected rather than assumed, and the case it is detecting is a
    real one: iPhone Safari has no element fullscreen at all — only a genuine
    <video> can go fullscreen there, and ours is inside a cross-origin iframe
    nothing on this page can reach into. iPad and desktop are fine. The button
    is hidden rather than disabled, since a permanently dead control invites
    somebody to work out what they did wrong.
  */
  function fullscreenSupported() {
    return !!fsRequest();
  }

  function paintFullscreenButton() {
    fsButton.textContent = inFullscreen() ? 'Exit full screen' : 'Full screen';
  }

  if (fullscreenSupported()) {
    fsButton.hidden = false;
    fsButton.addEventListener('click', function () {
      /*
        Both calls can reject — a browser may refuse fullscreen for reasons
        this page cannot see, and an unhandled rejection in a click handler is
        a console error nobody is looking at. Caught and dropped: the button
        not working is self-evident on screen, and there is nothing useful to
        say about it that the viewer cannot already see.
      */
      try {
        var run = inFullscreen()
          ? fsExit().call(document)
          : fsRequest().call(fsRoot);
        if (run && run.catch) run.catch(function () {});
      } catch (error) {
        /* As above. */
      }
    });

    /*
      Listened for rather than toggled on click, because fullscreen ends by
      routes this page never hears about as a click — Escape, the window
      manager, another tab taking the display. A label kept in step by the
      click handler alone would sit there saying "Exit full screen" on a window
      that had left it minutes ago.
    */
    document.addEventListener('fullscreenchange', paintFullscreenButton);
    document.addEventListener('webkitfullscreenchange', paintFullscreenButton);
    paintFullscreenButton();
  }

  var api = document.createElement('script');
  api.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(api);

  connect();
})();
</script>
</body>
</html>
`;
}

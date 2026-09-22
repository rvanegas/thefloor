import React from 'react';
import { API_URL } from '../api/config';

/**
 * The Podcasts tab's body, in a browser: the same `/podcasts` page, in an
 * `<iframe>`.
 *
 * The argument for showing the page rather than a rendering of it is the
 * native file's — `PodcastsView.tsx` — and it is not repeated here. What is
 * different is only the mechanism, and two things about it:
 *
 * **It needs no `onShouldStartLoadWithRequest`.** A browser already knows what
 * to do with a `mailto:` and with a link to somewhere else; the native frame
 * has to be told because it is not a browser.
 *
 * **So `staysInside` has no counterpart here, and one link is worse off for
 * it.** The native frame keeps the directory and a channel's page and sends
 * everything else out, because a frame has no back button; this one cannot,
 * an iframe's navigation being its own. Following the colophon to the landing
 * page therefore leaves somebody looking at it inside the tab, with the tab
 * strip as the way out. Known, and not worth the machinery it would take to
 * police — the same-origin frame could be watched and reset on every load, and
 * that is a lot of apparatus for one link on a page nobody arrives at by
 * accident.
 *
 * **Same origin, always.** The web app is served by this same server under
 * `/app` or `/beta`, so the frame is same-origin in every deployment and the
 * one case where it is not — a dev bundler on another port, talking to a
 * server on 8787 — is a development install whose worst outcome is a frame the
 * browser refuses to draw. Nothing here reads into the frame or writes out of
 * it, so there is nothing for an origin to be in the way of.
 */
export function PodcastsView() {
  return (
    <iframe
      src={`${API_URL}/podcasts`}
      title="Published conversations"
      style={{
        // `flex` rather than `height: 100%`: the tab hands its body whatever
        // is left of the pane through a flex column, and a percentage height
        // inside one resolves against a parent that has not been given a
        // height of its own.
        flex: 1,
        width: '100%',
        border: 'none',
        // The page brings its own ground; this is only what shows before it
        // has painted.
        background: 'transparent',
      }}
    />
  );
}

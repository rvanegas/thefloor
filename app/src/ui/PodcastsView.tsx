import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL } from '../api/config';
import { colors, spacing, type } from './theme';

/**
 * The Podcasts tab's body: the server's own `/podcasts` page, in a frame.
 *
 * **The page rather than a rendering of it**, which is the decision this file
 * is. `/podcasts` is a document the server already serves to anybody — every
 * channel that has made itself public, with its cover, its name and how many
 * recordings are on it — and it is the same document a stranger with the link
 * sees. Drawing a native list beside it would mean a second implementation of
 * a list nobody in this app owns, kept in step by hand with a page that can
 * change on a deploy a minute after this build was frozen. The one this app
 * shows and the one the web shows cannot disagree if there is only one.
 *
 * **What is inside is this server's own document and carries no script** —
 * see `server/src/directory-page.ts`, which says so for its own reasons. So
 * the frame is not a browser: it is a page of the application that happens to
 * be rendered by the server rather than by React, and following a channel's
 * row to `/c/<id>` stays inside it because that page is the same kind of
 * thing.
 *
 * **Two pages stay and everything else leaves**, which is narrower than *this
 * server stays* and is narrower on purpose. A frame has no back button: what
 * stays inside it has to be somewhere the page itself offers a way out of, and
 * the directory and a channel's public page each link to the other. The
 * landing page does not — it is the marketing site, it links onward, and
 * somebody who tapped the colophon would be stranded on it with only the tab
 * strip to escape with. So it opens in the browser, where it belongs, along
 * with the `mailto:` at the foot of the page and anything a future edit adds.
 *
 * The web app draws an `<iframe>` instead and argues the same thing; see
 * `PodcastsView.web.tsx`.
 */
export function PodcastsView() {
  const uri = `${API_URL}/podcasts`;

  // The one state that is not a page. `API_URL` is empty only on a native
  // build with no `EXPO_PUBLIC_API_URL`, which is a misconfigured development
  // install rather than anything a user reaches — but a blank frame says
  // nothing at all, and every other screen in this app says what is wrong.
  if (!API_URL) {
    return (
      <View style={styles.empty}>
        <Text style={type.muted}>No server is configured, so there is
        nothing to list.</Text>
      </View>
    );
  }

  return (
    <WebView
      style={styles.web}
      source={{ uri }}
      // The page is a document: nothing on it needs to be pinched, and letting
      // it be is how a tab ends up at a zoom somebody cannot undo.
      scalesPageToFit={false}
      // Draws the ground the page will paint over, so a slow load is the app's
      // background rather than a white flash on a dark screen.
      containerStyle={styles.web}
      onShouldStartLoadWithRequest={(request) => {
        if (staysInside(request.url)) return true;
        void Linking.openURL(request.url);
        return false;
      }}
    />
  );
}

/**
 * Whether an address is one of the two pages this frame is for: the directory
 * itself, and a channel's public page.
 *
 * Exported so a test can pin the set without rendering anything, this being a
 * rule rather than a detail of the view — see `podcasts.test.tsx`.
 */
export function staysInside(url: string): boolean {
  if (!API_URL || !url.startsWith(`${API_URL}/`)) return false;
  // The query and the fragment are nobody's business here; neither page takes
  // one, and a link that grew one would still be the same page.
  const path = url.slice(API_URL.length).split(/[?#]/)[0] ?? '';
  return path === '/podcasts' || path.startsWith('/c/');
}

const styles = StyleSheet.create({
  /** Fills whatever the tab left it; see `HomeView`'s `fill` content style. */
  web: { flex: 1, backgroundColor: colors.bg },
  empty: { padding: spacing(2.5) },
});

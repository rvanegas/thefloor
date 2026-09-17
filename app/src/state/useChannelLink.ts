import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

/**
 * A tap on the lock screen card, which arrives as a URL.
 *
 * `thefloor://channel/<id>`, written by the widget extension's `widgetURL` —
 * the only way a Live Activity can say *open the app at this*. It is a
 * separate road from `onNotificationTap` and deliberately not folded into it:
 * one is a payload this app sent to APNs and reads back, the other is a string
 * the extension composed, and the two can fail in different ways.
 *
 * **Both directions, for the reason the notification path needs both.** A card
 * tapped while the app is alive arrives on the listener; one tapped from a
 * cold launch is waiting in `getInitialURL` and reaches no listener at all.
 * Reading only the first is how a feature works in every test and fails for
 * the person whose phone had killed the app.
 *
 * The scheme is `thefloor`, registered in `app.json`. Anything else, and any
 * `thefloor://` URL that is not a channel, is ignored rather than guessed at:
 * the only other thing this app's scheme carries is an invite link, which has
 * its own handling and must not be answered by opening a channel named after
 * its pin.
 */
export function channelOfUrl(url: string | null): string | null {
  if (!url) return null;
  // Matched rather than parsed. `URL` is polyfilled unevenly in React Native
  // and its `host`/`pathname` split for custom schemes differs between
  // platforms — `thefloor://channel/abc` puts `channel` in the host on one and
  // in the path on another. A regular expression sidesteps the question.
  const match = /^thefloor:\/\/channel\/([^/?#]+)/.exec(url);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return id.length > 0 ? id : null;
  } catch {
    // A malformed escape is a URL this app did not write.
    return null;
  }
}

export function useChannelLink(): {
  linked: string | null;
  clearLink: () => void;
} {
  const [linked, setLinked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Linking.getInitialURL()
      .then((url) => {
        if (cancelled) return;
        const id = channelOfUrl(url);
        if (id) setLinked(id);
      })
      // Caught for the reason `onNotificationTap` catches: this runs at
      // launch, where an unhandled rejection is a failure to start rather than
      // a missed tap.
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const id = channelOfUrl(url);
      if (id) setLinked(id);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return { linked, clearLink: () => setLinked(null) };
}

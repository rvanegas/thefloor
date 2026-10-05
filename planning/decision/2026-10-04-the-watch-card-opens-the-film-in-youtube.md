# The watch card opens the film in YouTube

*Copy video link* became *Open in YouTube*, asked for directly. The copy was a
step everybody followed with the same paste into the same app, so the button
now does the paste: `Linking.openURL` on `https://www.youtube.com/watch?v=<id>`,
which iOS routes to the YouTube app as a universal link and to Safari where the
app is not installed, and which a browser opens in a tab.

This walks back half of 2026-08-23's *the hand-off goes* (commit `78d83656`),
whose rule was that the card holds controls that drive the channel and nothing
that merely leaves it. The half it keeps is the reason that rule was written:
**no `t=`.** "Open on this phone" started the film at the party's second and so
implied it would stay there, which an outside player cannot. This one opens the
film from its start, as a link would, and promises nothing about the party.

The link is built from `videoId` rather than `WatchParty.url`, so what reaches
the OS is always a `youtube.com` URL whatever form was pasted. The clipboard
state the copy needed (`watchCopied`, `copyLabel`) went with it.

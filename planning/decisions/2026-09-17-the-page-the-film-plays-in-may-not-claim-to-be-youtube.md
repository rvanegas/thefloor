# The page the film plays in may not claim to be YouTube

Build 227's watch player came up black on a phone: YouTube's own card, *This
video is unavailable*, *Error code: 152 - 4*, and a *Watch video on YouTube*
button. Play did nothing, because there was nothing to play. Tapping the button
turned the Watch tab into a mobile YouTube page — chrome, search box, *Open
App* — playing inside an inch of the channel with its own mute button.

**The cause was one line: `baseUrl: 'https://www.youtube.com'`.**
`loadHTMLString` gives the document whatever origin its base carries, and the
IFrame API passes that origin to the embed. A page at `www.youtube.com`
embedding a YouTube player is YouTube embedding itself, and the embed refuses
it with 152. It reads like the safe, obvious choice — it is what
`react-native-youtube-iframe` has shipped for years — and it is the one value
that cannot work.

**Measured, not reasoned.** A sixty-line WKWebView harness on the Mac loaded
the app's exact page under each base and printed what the player said:

| base | origin | result |
| --- | --- | --- |
| `https://www.youtube.com/` | `https://www.youtube.com` | error 152 |
| none | `null` (opaque) | error 153 |
| `https://thefloor.rvanegas.co/` | that | ready, plays, seeks |
| `https://localhost/` | that | ready, plays, seeks |

So both ends of the range fail and they fail differently: there must be an
origin, and it must not be YouTube's. The page now claims
`https://thefloor.rvanegas.co/`, which is this app's own host — deliberately
not `API_URL`, since what the embed judges is who the page says it is and not
who it talks to, and a session pointed at a LAN server in development must not
become a page with a plain-http identity for YouTube to form its own opinion
about.

**Two things followed from how long it took to see.**

- **The player now reports refusals.** `onError` was not wired at all, so every
  failure looked identical from the code's side: the page loaded, the player
  was built, `onReady` fired, readings arrived, and the only symptom was a
  frame that never moved. It posts the code now, and the card carries a line in
  the app's own words along the bottom of the frame — which of 101/150 (the
  owner does not allow it off YouTube), 100 (gone), and 152/153 (our fault,
  said as such) it was.
- **The card is a player, not a browser.** `onShouldStartLoadWithRequest`
  allows anything below the top frame, which is the embed doing its own work,
  and refuses a top-frame navigation away — handing the URL to `Linking`
  instead, which is what somebody tapping *Watch video on YouTube* is asking
  for. That tap leaves the app and costs the microphone, and it is still the
  only route to a video whose owner forbids embedding.

The reset on `videoId` changing went in beside them: the WebView is keyed on
the video but the component is not, so a party changing film kept the last
one's `ready`, its refusal, and a `told` flag that would have stopped the
channel ever learning the new video's duration.

`app/src/watch/__tests__/player.test.tsx` pins the two props, because neither
is visible from inside the code and both cost a rebuild and a phone to see.

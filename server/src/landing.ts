/**
 * The page somebody who has never heard of this lands on.
 *
 * `/` is the one address a person types or is sent, and until now this server
 * had nothing there. The web app lives at `/app` rather than at the root
 * precisely so this page can exist — and for a second, structural reason: the
 * single-page catch-all serves `index.html` for every unknown path under its
 * prefix, and a catch-all at the root would have to enumerate every API route
 * to avoid swallowing one. It would be wrong again the next time a route was
 * added. See planning/decisions/DECISIONS.md § *Three variants of deploy*.
 *
 * **Server-rendered, like `/privacy` and `/support`, rather than the web
 * bundle.** Shipping 400 KB of React to show a paragraph and three links to
 * somebody who is not a user is the wrong trade, and the pattern is already
 * here: `page()` in `html.ts` carries the viewport meta and a
 * `color-scheme: light dark` palette, so this is a fourth page rather than a
 * new kind of thing.
 *
 * **The App Store is the primary call to action**, because the phone is the
 * referential install and the browser is a convenience —
 * planning/decisions/DECISIONS.md § *The web app is a secondary interface*. A
 * stranger should be sent to the App Store, not into a web client they cannot
 * be notified through.
 *
 * **Rewritten 2026-09-14, and the old text was wrong rather than merely thin.**
 * It said the app is one where *one person speaks at a time* — which describes
 * a different application. Conversation here is open by default and the floor
 * is a claim somebody makes when they need to finish a thought;
 * planning/PROPOSITION.md says so in terms, planning/LISTING.md lists the
 * sentence among the things the listing must not say, and
 * planning/ROADMAP.md § *Say the same thing everywhere* is the entry that
 * found it on this page and in support.ts. Both are corrected.
 *
 * **And nothing outside the store listing said that nothing rings** — the one
 * claim that separates this from every other voice app and the one a person
 * cannot discover from a screenshot. It is now the first heading here.
 *
 * **Nothing on this page redirects**, since 2026-09-14. A script used to send
 * anybody holding a token to `/open` before paint, with `?stay` as the escape
 * hatch that let a signed-in person read the page at all. The preference at
 * the prompt is that somebody signed in sees this page like everybody else, so
 * both are gone. **The browser link is the compensation** and is why it moved
 * to the top, above the argument rather than to the foot: a returning visitor
 * who used to arrive in the app is now one tap away from it, and a tap they
 * have to scroll past six claims to find is not one tap. It is deliberately
 * quiet — small and muted — because it is furniture for the minority who are
 * signed in, and must not be the first thing a stranger reads. `webAppReady`
 * still gates it, for the reason it always did.
 *
 * **The copy's source of truth is planning/LISTING.md**, not this file: the
 * headings are that document's argument in the order it makes it.
 *
 * **The first two paragraphs are that document's two openers, and their order
 * was wrong until 2026-09-14.** The promotional text led and the description's
 * first line followed, which put two openings back to back — the page said
 * what it was four times before saying anything, counting the standfirst, and
 * buried *It waits for you*, which is the shortest and strongest line here.
 * They are the listing's own order now: the promise, then the explanation.
 * **The promotional text is written to stand alone in its own field**, so it
 * cannot also be the thing that opens a page that already has a standfirst. Change it there first,
 * or the two surfaces drift and the store's is the one under review.
 * planning/MARKETING.md § *The funnel is upside down* says why this page is the
 * middle of the funnel rather than the top.
 *
 * **The two claims are one principle, and the page says so since 2026-09-14.**
 * *Nothing rings* and *take the floor* read as two features and are not:
 * planning/PROPOSITION.md § *Non-interruption is one principle at three
 * scales* has them as consent at different ranges, and says the floor's
 * motivation is the ring's one level in — the overtalking that degrades a
 * debate is intrusion, and the fix is a boundary rather than a moderator. A
 * page that lists them separately has described two conveniences instead of
 * one argument, which is the ground this app loses on.
 *
 * **The claim is non-intrusion and never silence, and the caption under the
 * lock screen said silence for a day.** It read *nothing here made a sound*,
 * which is false twice over: a notification makes a notification sound, and
 * `push.ts` is explicit that at the default level the automatic ones arrive
 * without one while **a ping is the one that makes a noise**. So the very
 * notification the picture is about is the audible one.
 *
 * **The slide is easy and will happen again**, because *nothing rings* sounds
 * like *nothing sounds*. It is not: what is refused is the alarm — the
 * escalation that pierces a Focus mode or the silent switch, and the
 * expectation of an answer in the next four seconds. An ordinary sound that
 * the recipient chose, and can turn off per channel and per kind, is the
 * opposite of that rather than a weaker version of it. Check any sentence here
 * about sound against `push.ts` before shipping it.
 *
 * **The lock screen under the first claim is the one image here that carries
 * a non-event.** A phone that does not ring cannot be photographed, so it is
 * photographed by comparison instead: The Floor's notification is the same
 * shape as the activity reminder beneath it, and the only thing on the screen
 * saying *ring* belongs to another app. The two Floor notifications in it are
 * a sequence rather than chatter — somebody stepped in, then asked — and the
 * six minutes between them is inside `WAITING_WINDOW_MS`, so the frame shows a
 * request that is still answerable rather than one that has lapsed. Earlier
 * captures were thirty minutes old and showed the opposite.
 *
 * **Every claim on it is checkable against the shipped build**, on the
 * listing's own rule — nothing about open channels, alarm-by-permission or
 * anything else unbuilt. The quarter-hour sentence and the answer-with-the-
 * screen-off sentence are both newer than the page they are on and were lies
 * before builds 145–159.
 */

import { escapeHtml, page, socialCard } from './html';

/**
 * The page's own CSS, layered on top of `page()`'s document chrome.
 *
 * **Additive only**, which is the rule `html.ts` states for this hook. What is
 * here is a lede, a call to action and a set of claim headings — the three
 * things a marketing page has that a document does not — and nothing that
 * redefines `body`, `h1` or the palette.
 *
 * **This page is pinned to light**, unlike the other three, because the two
 * screenshots in it are light captures with no dark counterpart — the
 * reasoning is on `colorScheme` in html.ts. So the colours here may assume a
 * light ground, which is the one liberty this stylesheet has that a document's
 * would not.
 */
const STYLE = `
  .mark { width: 2.5rem; height: 2.5rem; display: block; border-radius: 0.5rem; }
  .lede { font-size: 1.25rem; line-height: 1.5; margin: 1.5rem 0; }
  .claim { font-size: 1.1rem; margin-top: 2.25rem; margin-bottom: 0.4rem; }
  .cta { margin: 2.5rem 0 2rem; }
  .cta a {
    display: inline-block; padding: 0.7rem 1.4rem; border-radius: 0.6rem;
    background: #5B6478; color: #fff; text-decoration: none; font-weight: 600;
  }
  .cta .aside { display: block; margin-top: 0.6rem; font-size: 0.9rem; opacity: 0.75; }
  .more { margin-top: 3rem; font-size: 0.95rem; opacity: 0.85; }
  .browser { font-size: 0.9rem; opacity: 0.7; margin: 1rem 0 0; }
  figure { margin: 1.25rem 0 0; }
  figure img {
    display: block; width: 100%; max-width: 20rem; height: auto;
    border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 0.75rem;
  }
  figcaption { margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.75; max-width: 20rem; }
`;

/**
 * The brand mark, inline rather than served.
 *
 * It is two paths and 182 bytes on disk — `the-floor-icon.svg` at the
 * repository root, which is the source of truth for it. Inlining avoids adding
 * a static route to a server that deliberately has none, and avoids a second
 * request for a decoration. **If the icon changes, change it there and here**;
 * there is no build step linking the two and a comment is the only thread.
 */
const MARK = `<svg class="mark" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The Floor">
<path d="M0,0 L1024,0 L0,1024 Z" fill="#F2A93B"/>
<path d="M1024,0 L1024,1024 L0,1024 Z" fill="#5B6478"/>
</svg>`;

export function landingPage(options: {
  /** From APP_STORE_URL. Absent on a box that has not been told. */
  appStoreUrl?: string;
  /** Where this server is reachable, for the link preview. See socialCard. */
  origin?: string;
  /**
   * Whether *any* train has been deployed — that is, whether there is a web
   * app on this box at all.
   *
   * **Both the link and the redirect hang off this, and the redirect is the
   * one that matters.** The two trains ship separately and the stable one is
   * expected to lag: it is cut from `released`, so it cannot exist until a
   * release contains the web app. In between this page is live and there may
   * be nothing to send anybody to — and sending somebody who is merely signed
   * in to a 503 is worse than offering them nothing, because they did not ask
   * to go there. It asked about stable alone until 2026-08-30, which withheld
   * the browser from a box that was serving beta perfectly well.
   *
   * Checked per request rather than at boot, because `bin/deploy-web` adds the
   * bundle without restarting anything — which is deliberate, a restart
   * costing presence — so a value cached at startup would be wrong for exactly
   * as long as it mattered.
   */
  webAppReady: boolean;
}): string {
  // Offered only when there is something to open. A link to a 503 is worse
  // than no link — the same graceful absence `supportPage` makes for a contact
  // address, and the App Store link below for an unset URL.
  const browser = options.webAppReady
    ? `<p class="browser"><strong>Already have an account?</strong>
<a href="/open">Open The Floor in this browser.</a> It needs a microphone and
nothing else &mdash; though the app on a phone is the one that can reach you
when you are not looking at it.</p>`
    : '';

  // Omitted rather than rendered dead, on the same reasoning: this is the
  // page's main call to action and a dead one is worse than none.
  const store = options.appStoreUrl
    ? `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">Free. No advertising. The same app whether or not you ever chip in.</span></p>`
    : '';

  return page({
    title: 'The Floor',
    heading: 'The Floor',
    standfirst: 'Group voice on your own time',
    social: socialCard(options.origin, {
      title: 'The Floor',
      // The promotional text, which planning/LISTING.md writes to be
      // *repeatable by a recommender* — exactly the job a chat preview does.
      description:
        'It’s a group chat, but voice. A channel is a place you drop into ' +
        'rather than a call you answer: you arrive when it suits you, and ' +
        'whoever is there is there.',
      path: '/',
      imageAlt: 'The Floor — it’s a group chat, but voice. Nothing rings.',
    }),
    // Light whatever the reader's setting, because the two screenshots below
    // are light and have no dark counterpart — see `colorScheme` in html.ts.
    colorScheme: 'light',
    style: STYLE,
    body: `${MARK}

<p class="lede">The Floor is for talking with people you already know.
It waits for you.</p>

<p>It&rsquo;s a group chat, but voice. A channel is a place you drop into
rather than a call you answer: you arrive when it suits you, and whoever is
there is there.</p>

${browser}

<h2 class="claim">Nothing rings</h2>
<p>When somebody wants you, you get a notification &mdash; the ordinary kind,
waiting in line with all the others. Your ringer stays yours, your Focus mode
holds, and the answer keeps until you have a moment for it. There is no
telephone call here to answer or decline.</p>

<figure>
<img src="/assets/lockscreen.webp" width="750" height="1624" loading="lazy"
alt="A phone's lock screen. One notification reads &quot;Morning Standup
&mdash; Beth Frankish: We're waiting for you&quot;, sent just now. Below it,
among the older notifications, an earlier one reads &quot;Beth Frankish stepped
in&quot; six minutes ago, and beneath that an activity reminder from another
app.">
<figcaption>Beth stepped in six minutes ago without a sound. Asking for you
makes one &mdash; the ordinary notification sound, the same as anything else on
this screen. It is not a ring, and it waits.</figcaption>
</figure>

<h2 class="claim">A channel is a place, not a call</h2>
<p>It holds up to six people, keeps its name between conversations, and is
still there tomorrow. You can see where everybody is before you say anything:
the list says which channels have somebody in them right now, and how long ago
somebody was last in the others. A channel nobody is using empties itself after
a quarter of an hour, so one that says somebody is there means it.</p>

<figure>
<img src="/assets/home.webp" width="750" height="1624" loading="lazy"
alt="The Floor's channel list. A channel called Weekly Convo reads &quot;Nobody
else is here yet&quot;, a contact called Sam Rivera reads &quot;Nearby &middot;
1 present&quot;, and under Your Channels a second entry reads &quot;A month
ago&quot;.">
<figcaption>Who is there now, who is nearby, and how long ago anybody last
was &mdash; before you say anything.</figcaption>
</figure>

<h2 class="claim">If it&rsquo;s empty, step in anyway</h2>
<p>Ping whoever you wanted and they get a notification saying you are there.
Then put the phone down &mdash; stepping in does not take the device over, so
whatever you were playing keeps playing. When they arrive you hear them, and
you can answer, with the screen off and the phone still in your pocket.</p>

<h2 class="claim">Take the floor to finish a thought</h2>
<p>Conversation is open: everyone can speak. When one person needs to be heard
properly they take the floor, and every other microphone stays quiet until they
give it back. It is enforced on the audio rather than asked of people
politely.</p>

<p>It is the same idea as the notification, one level in. Being talked over is
an intrusion too, and the answer here is a boundary rather than somebody
keeping order &mdash; there are no moderators in a channel, and nothing to
appeal to.</p>

<figure>
<img src="/assets/floor.webp" width="750" height="1624" loading="lazy"
alt="A channel roster. The first person is marked &quot;Present &middot; has
the floor&quot;; the second is marked only &quot;Present&quot;. The control at
the foot of the screen reads Release.">
<figcaption>Whoever holds it is named on the roster, and the control says
Release rather than Mute &mdash; it is something you give back.</figcaption>
</figure>

<h2 class="claim">Nobody here is a stranger</h2>
<p>Everything in The Floor is your people and the channels you share with them.
Everybody is here by mutual agreement &mdash; they accepted a request from you,
you accepted theirs, or they opened a link you sent that seats exactly one
person. There is no directory and no way to search for anybody.</p>

<h2 class="claim">Keep the bits worth keeping</h2>
<p>Record a conversation when it is worth it. Every voice is captured on its own
track, so what you get back is clear rather than a scramble. Play it into the
channel afterwards and listen together, export it, or delete it &mdash; anyone
in the channel can, not only whoever started it.</p>

${store}

<div class="more">
<h2 class="claim">More</h2>
<p><a href="/support">Support</a> &mdash; how it works, and how to reach a person.<br>
<a href="/privacy">Privacy</a> &mdash; what is stored, why, and for how long.</p>
</div>
`,
  });
}

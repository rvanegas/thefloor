/**
 * The page an invite link opens: somebody you know, asking you here by name.
 *
 * **The one place in this application where a stranger is told a fact about a
 * user**, and the whole design is about narrowing that. The address is
 * `/i/<username>/<pin>`, so the display name is drawn only for a request that
 * carries a pin which is live, unspent and belongs to that username; every
 * other request is answered with a page that names nobody. Guessing at the pin
 * is counted against the account and stops — see `Accounts.invitePinState`.
 *
 * **Server-rendered, like `landing.ts`, and for a second reason on top of its
 * one.** The bundle is the wrong thing to send somebody who may not be a user
 * — that argument is landing.ts's — and here the page also has both halves of
 * the answer in its own URL, so there is nothing to fetch before it can speak.
 * A reader with no JavaScript gets the whole page and every fact on it.
 *
 * **It inverts the landing page's call to action, deliberately.** There the
 * App Store comes first, because the phone is the referential install and a
 * stranger should be sent to it. Here the browser comes first, because this
 * link is the invitation: a trip through the App Store loses it — the address
 * does not survive an install — and somebody who takes that route arrives with
 * no relationship and nothing to show for having been asked. So the browser is
 * the way to *accept*, and the app is the second step, offered underneath and
 * again from inside the app once they are in.
 *
 * **Both routes are named and costed on the page, since 2026-09-22.** The
 * order above was already right and the page still read as one call to action
 * with an afterthought under it: *accept in this browser*, then *then put it
 * on your phone*, with no statement of what either one gets you. Somebody
 * asked here by name is choosing between two different things — a browser
 * they can be signed into and talking in a minute from now, and an install
 * that costs a couple of steps and is the only one people can actually reach
 * them through — and a page that does not say so has them choosing by
 * whichever link looks more official. So each has a heading, and the phone's
 * two advantages are the two the browser structurally cannot have:
 *
 * - **Notifications.** A browser cannot send one, *installed (web app)*
 *   included — `installNotice.ts` in the app is the same fact said to
 *   somebody who is already in, and its wording is the source for the
 *   sentence here. What that costs is other people's ability to find you,
 *   which is not a cost the person choosing pays.
 * - **A sign-in that lasts.** The phone keeps the token in the keychain,
 *   which outlives even deleting the app — see `INSTALL_KEYS` in
 *   `app/src/state/storage.ts`. A browser keeps it in `localStorage`, so
 *   clearing site data or accepting in a private window is signing out.
 *
 * **Neither claim may grow.** Anything about what a browser cannot do is
 * checkable against the shipped web app, on landing.ts's own rule, and the
 * two above are the whole list: everything else the browser gives up is a
 * convenience the chooser pays for themselves.
 */

import { escapeHtml, page, socialCard } from './html';
import type { InviteRefusal } from './accounts';

/**
 * **This page said the two wrong things longer than any other, and was on
 * nobody's list.** Until 2026-09-14 both bodies below opened *The Floor is a
 * small application … one person speaks at a time* — the first false since the
 * app stopped being small, the second describing a different application
 * altogether, since conversation is open by default and the floor is a claim
 * somebody makes to finish a thought.
 *
 * **planning/ROADMAP.md § *Say the same thing everywhere* named landing.ts and
 * support.ts and stopped there.** It missed this file, in two places — which
 * matters more than either of the two it found: planning/MARKETING.md argues
 * that the invite page is the *top of the funnel*, since somebody opening one
 * has been asked by name, where a listing has to persuade from cold. The
 * wrongest copy was on the most-converting page.
 *
 * **The lesson is about how the list was made, not about this file.** It was
 * assembled by grepping for a phrase somebody remembered; two of four hits
 * were found because those were the files being read at the time. Grep the
 * whole of `server/src` for any sentence that introduces the app before
 * believing a list of where it appears.
 */

/**
 * The key the app takes the invitation out of, and the shape it expects.
 *
 * Repeated here rather than imported, exactly as `landing.ts` repeats
 * `thefloor.token`: nothing in this server may import from `app/`, so a
 * comment naming the other end is the only link the two can have. The other
 * end is `takeInvite` in `app/src/ui/handover.ts`.
 *
 * `sessionStorage` rather than `localStorage`, which is `handover.ts`'s own
 * rule and right for the same reason: an invitation belongs to the visit that
 * is accepting it, not to this browser for ever. Somebody who opens a link and
 * wanders off has not accepted anything.
 */
const INVITE_KEY = 'thefloor.invite';

/**
 * The link preview for both bodies below, and **it deliberately names nobody.**
 *
 * This page is the one place in the application where a stranger is told a
 * fact about a user, and the whole design above is about narrowing that to
 * somebody holding a live, unspent pin. A link preview is read by a wider
 * audience than the page is: everybody in the group thread the link was pasted
 * into, everybody a forward reaches, and the preview caches of Telegram, Slack
 * and the rest, several of which never re-fetch. So the disclosure stays on
 * the page, where the person who clicked is the one reading it.
 *
 * **This is a tightening rather than a new rule.** The `<title>` here has
 * always carried the display name, and a crawler with no `og:title` falls back
 * to `<title>` — so the name has been appearing in chat previews all along.
 * Setting an `og:title` that omits it is what stops that.
 *
 * One card for both bodies, refusal included: a crawler and the person who
 * clicks can get different states — a pin spent in between, most obviously —
 * and a preview that announced a refusal the reader will not see is worse than
 * one that says what the address is for.
 */
const CARD = {
  title: 'You’re invited to The Floor',
  description:
    'Somebody you know has invited you. It’s a group chat, but voice: you ' +
    'drop into a channel rather than answer a call, and nothing rings.',
  // No `path`: this page's address carries a live pin. See socialCard.
  imageAlt: 'The Floor — it’s a group chat, but voice. Nothing rings.',
};

export interface InvitePageOptions {
  /** The username in the link, as it was typed into the address. */
  username: string;
  /** Where this server is reachable, for the link preview. See socialCard. */
  origin?: string;
  /** The pin in the link. Never shown; carried to the app. */
  pin: string;
  /**
   * The inviter's display name — given only when the pin checked out, which is
   * what keeps this page from answering "who is @annak" for anybody who asks.
   */
  displayName?: string;
  /** Why there is no name, when there is none. */
  refusal?: InviteRefusal;
  /** From APP_STORE_URL. Absent on a box that has not been told. */
  appStoreUrl?: string;
  /** Whether there is a web app on this box at all; see `landing.ts`. */
  webAppReady: boolean;
}

/**
 * What each refusal says, in the second person and without a diagnosis nobody
 * can act on.
 *
 * `unknown` and `locked` deliberately give the same sentence. They are
 * different states — one is a pin that never existed, the other is an account
 * that has stopped answering after too many wrong ones — and telling them
 * apart would hand a guesser the one thing worth knowing: whether to keep
 * going. Somebody with a genuine link reads "check the link" either way and is
 * not misled, since a locked window passes.
 */
function refusalText(refusal: InviteRefusal): { heading: string; body: string } {
  switch (refusal) {
    case 'used':
      return {
        heading: 'This invitation has already been used',
        body: `An invite link works once. Ask whoever sent it for another one —
they can make a new link in a moment.`,
      };
    case 'expired':
      return {
        heading: 'This invitation has expired',
        body: `Invite links last thirty days. Ask whoever sent it for a fresh
one.`,
      };
    case 'self':
      // Reachable only from the app, which is where a signed-in owner's own
      // link resolves; the page itself has no idea who is reading it.
      return {
        heading: 'This is your own invitation',
        body: `Send it to somebody else, and they will be added to your
contacts when they open it.`,
      };
    default:
      return {
        heading: 'This invitation cannot be opened',
        body: `Check that the whole link was copied — the last part of it is
what matters. If it keeps failing, ask whoever sent it for another.`,
      };
  }
}

/**
 * The one-sentence form, for the app rather than for a page.
 *
 * The same words as the page's heading, and shared rather than written twice
 * because they are the same refusal reaching a person by two routes — somebody
 * who opened the link in a browser, and somebody whose app redeemed it a
 * moment after they signed in. Two spellings of "already used" would be two
 * things to keep true.
 */
export function inviteRefusalText(refusal: InviteRefusal): string {
  return `${refusalText(refusal).heading}.`;
}

/**
 * Accepting, which is a link that upgrades itself.
 *
 * The anchor points at `/open` on its own, so a reader with no JavaScript still
 * gets into the app — they simply arrive without the invitation, which is the
 * honest degradation: nothing is silently half-done, and they can be added the
 * ordinary way. With JavaScript the click stores the invitation first and the
 * app redeems it as soon as there is a session.
 *
 * `/open` rather than a train, which is the rule `open.ts` owns and the mistake
 * that produced two 503s in two days.
 */
function acceptScript(username: string, pin: string): string {
  // JSON.stringify, not the escaper above: this is a JavaScript string
  // literal rather than markup, and the two are escaped differently. Both
  // values are already narrow — a username is letters, digits and
  // underscores, a pin is six digits — so this is belt and braces.
  const invite = JSON.stringify(JSON.stringify({ username, pin }));
  return `
<script>
(function () {
  var link = document.getElementById('accept');
  if (!link) return;
  link.addEventListener('click', function () {
    try { sessionStorage.setItem(${JSON.stringify(INVITE_KEY)}, ${invite}); } catch (e) {}
  });
})();
</script>`;
}

export function invitePage(options: InvitePageOptions): string {
  const store = options.appStoreUrl
    ? `<p><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a></p>`
    : '';

  // No name, so no invitation to accept: the page is an explanation and two
  // ways out. Nothing here says whose link it was, including in the title.
  if (!options.displayName || options.refusal) {
    const said = refusalText(options.refusal ?? 'unknown');
    return page({
      title: 'The Floor',
      heading: 'The Floor',
      standfirst: said.heading,
      social: socialCard(options.origin, CARD),
      head: REFERRER,
      body: `<p>${said.body}</p>

<h2>In the meantime</h2>
<p>The Floor is for talking with people you already know. A conversation
lives in a channel that stays there between calls, and nothing about it rings:
when somebody wants you, you get an ordinary notification that waits its
turn.</p>
${store}
<p><a href="/">More about The Floor</a></p>
`,
    });
  }

  const name = escapeHtml(options.displayName);

  // The accept path is offered only where there is something to open, the way
  // `landing.ts` withholds its browser link: a box can quite normally be
  // serving no web app at all, and sending somebody mid-acceptance to a 503 is
  // worse than telling them to use their phone. That branch is a guard rather
  // than a route anybody is expected to take — a box serving neither train is
  // a fresh one or a local checkout — so nothing in it should read as the
  // ordinary way in.
  //
  // **The browser is the shorter path and the page now says so.** The pin is
  // in the address, so `acceptScript` carries the invitation across the
  // sign-in and it is spent without anybody typing anything: one tap and an
  // emailed code. That was stated here only as a warning about the App Store
  // detour, at the foot, which is the same fact told from the losing end.
  const accept = options.webAppReady
    ? `<h2>Accept in this browser</h2>
<p><strong><a id="accept" href="/open">Accept and open The Floor in this
browser</a></strong> — nothing to install. You sign in with your email address
and a code it sends you, which is also how the account gets made, and ${name}
is in your contacts from that moment. It needs a microphone and nothing else,
and you can be in a conversation almost immediately.</p>
<p>It is the shorter way in as well as the quicker one: the invitation is in
this link, so accepting it is that tap and signing in. There is nothing to
type in, and nothing to come back and find.</p>`
    : `<h2>Accepting</h2>
<p>Install the app below and sign in, and tell ${name} you are there — this
server has no browser version to accept in.</p>`;

  // Second, and said as a choice rather than an afterthought: the two things
  // below are what the extra steps buy, and they are the two a browser cannot
  // have however good it gets. See the note at the top of this file before
  // adding a third.
  const phone = `<h2>${options.webAppReady ? 'Then put it on your phone' : 'Put it on your phone'}</h2>
<p>A few minutes more — downloading it, installing it, then signing in with
your email address and a code — and two things the browser cannot do:</p>
<ul>
<li><strong>People can reach you.</strong> A browser cannot notify you, so
nobody can find you there unless you happen to be looking at the tab. The app
gets a notification — the ordinary kind, that waits its turn.</li>
<li><strong>It stays signed in.</strong> Your phone keeps the sign-in itself,
so it is there whenever you come back. A browser keeps it in that browser:
clearing your site data, or accepting in a private window, means signing in
again.</li>
</ul>
${options.webAppReady ? `<p>Accept here first all the same. This link does not survive a trip through
the App Store — install before accepting and you arrive with no invitation and
nothing to show for having been asked — and the app offers the install again
once you are in.</p>` : ''}`;

  return page({
    title: `${options.displayName} invited you to The Floor`,
    heading: 'The Floor',
    standfirst: `${options.displayName} invited you`,
    // Names nobody, unlike the title above it — see CARD.
    social: socialCard(options.origin, CARD),
    head: REFERRER,
    body: `<p>The Floor is for talking with people you already know. A
conversation lives in a channel that stays there between calls — somewhere you
go back to rather than a call you place — and nothing about it rings: when
somebody wants you, you get an ordinary notification that waits its turn.
Everyone in a channel can speak; taking the floor is what one person does when
they need to finish a thought.</p>

<p>Nobody can reach you unless you have both agreed. There is no directory and
no search for strangers.</p>

${accept}

${phone}
${store}

<p><a href="/privacy">Privacy</a> — what is stored, why, and for how long.</p>
${options.webAppReady ? acceptScript(options.username, options.pin) : ''}
`,
  });
}

/**
 * Keeps the pin out of the next request's `Referer`.
 *
 * This page's own address is the credential — a click on the App Store link
 * would otherwise hand Apple the invitation, and a click on anything else
 * hands it to whoever that is. It is the one page here with a secret in its
 * URL, which is why the policy is on this page rather than in `page()` for
 * everybody.
 */
const REFERRER = '<meta name="referrer" content="no-referrer">';

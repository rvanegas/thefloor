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
 */

import { escapeHtml, page } from './html';
import type { InviteRefusal } from './accounts';

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

export interface InvitePageOptions {
  /** The username in the link, as it was typed into the address. */
  username: string;
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
      head: REFERRER,
      body: `<p>${said.body}</p>

<h2>In the meantime</h2>
<p>The Floor is a small application for talking with people you know. One
person speaks at a time, and a conversation lives in a channel that stays there
between calls.</p>
${store}
<p><a href="/">More about The Floor</a></p>
`,
    });
  }

  const name = escapeHtml(options.displayName);

  // The accept path is offered only where there is something to open, the way
  // `landing.ts` withholds its browser link: a box can quite normally be
  // serving no web app at all, and sending somebody mid-acceptance to a 503 is
  // worse than telling them to use their phone.
  const accept = options.webAppReady
    ? `<p><strong><a id="accept" href="/open">Accept and open The Floor in this
browser</a></strong> — it needs a microphone and nothing else. ${name} will be
in your contacts as soon as you sign in.</p>`
    : `<p>Install the app below and sign in, and tell ${name} you are there —
this server has no browser version to accept in.</p>`;

  return page({
    title: `${options.displayName} invited you to The Floor`,
    heading: 'The Floor',
    standfirst: `${options.displayName} invited you`,
    head: REFERRER,
    body: `<p>The Floor is a small application for talking with people you
know. One person speaks at a time, by taking the floor, and a conversation
lives in a channel that stays there between calls — so it is somewhere you go
back to rather than a call you place.</p>

<p>Nobody can reach you unless you have both agreed. There is no directory and
no search for strangers.</p>

${accept}

<h2>Then put it on your phone</h2>
<p>The browser is a convenience. The app on a phone is the one that can reach
you when you are not looking at it, which is the whole point of being somewhere
people can find you.</p>
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

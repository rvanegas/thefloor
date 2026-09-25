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
 * **One call to action, and it is the install. Reversed on 2026-09-25.** This
 * page led with the browser from 2026-09-06, and from 2026-09-22 it named and
 * costed both routes under two headings — some three hundred and fifty words
 * asking somebody who had been invited *by name* to first choose between a
 * browser and an install. Both of those are gone and the reasoning with them.
 * The page a person opens after being asked for should ask them for one thing.
 *
 * **What the old arrangement actually cost was a second sign-in, which is why
 * it went.** Its advice was to accept here and install afterwards; anybody who
 * took it and then ended up where this application wants them — on a phone,
 * where they can be reached — typed their email address and a mailed code
 * twice. That is the defect. The five headings were what dressed it up as a
 * choice, and the choice was never even: a browser cannot be notified, so
 * somebody who stops at one is barely in the application at all.
 *
 * **The install keeps the invitation now, by way of the return tap.** A trip
 * through the App Store does not carry the address, so this used to be the
 * route that arrived with no relationship — the warning at the foot of the old
 * page. The answer is to come back to this link and press *Open in the app*:
 * the pin travels over `thefloor://i/<username>/<pin>`, the app holds it across
 * the one sign-in and spends it after, and the inviter is a contact with a
 * channel before the first screen is drawn. See `useInviteLink.ts`.
 *
 * **It is two taps and the copy says so rather than hiding it.** A universal
 * link would make the return land in the app on its own; that is deferred, and
 * planning/UNIVERSAL-LINKS.md now carries the domain move as the reason it
 * stays deferred. So the second tap is the mechanism rather than a fallback,
 * and is written as the second step of the one call to action.
 *
 * **Nothing here may detect an install, and the copy is what stands in for
 * it.** `thefloor://` fails ugly on a phone without the app — Safari answers
 * that the address is invalid — and no script on this page can find out in
 * advance whether it would. So *Open in the app* is never offered as an
 * alternative to installing: somebody reading these blocks in order has either
 * just installed or already had it. A `localStorage` marker set by a click on
 * the store button was the alternative, and it buys emphasis rather than
 * correctness — it is absent in a private window and on a return through
 * another browser, so the copy has to stand alone regardless. The guest page's
 * button carries the same custom-scheme argument at greater length; see
 * `server/web/guest.ts`, and do not restate it here.
 *
 * **The browser is demoted and not removed, and the route still works.** One
 * quiet line, and it is load-bearing for four populations this page cannot tell
 * apart: a desktop visitor, an Android phone (never built — see
 * `backlog/android-has-never-been-built-or-run.md`), a box with no
 * `APP_STORE_URL`, and anybody who has told iOS to keep this domain in Safari,
 * which it remembers. Accepting that way is unchanged: `acceptScript` hands the
 * pin to the tab and the app spends it after the sign-in, the same walk by the
 * other road.
 *
 * **The prose budget is one sentence on each body, and it is a rule rather than
 * a result.** This page has accreted twice. The sentence is the promotional
 * text, whose source of truth is planning/LISTING.md — change it there first,
 * or this page and the store listing drift and the listing's copy is the one
 * under review. There is now no claim here at all about what a browser cannot
 * do, which is the cheapest possible way to keep landing.ts's rule that any
 * such claim must be checkable against the shipped web app.
 */

import { CTA_STYLE, MARK, escapeHtml, page, socialCard } from './html';
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

/**
 * The two rules `CTA_STYLE` does not carry, because only this page wants them.
 *
 * `.lede` and the button furniture are shared — see `CTA_STYLE` in html.ts,
 * and the warning there that nothing in it may assume a light ground, which is
 * why this page can use it at all.
 */
const STYLE = `${CTA_STYLE}
  .ends { font-size: 0.9rem; opacity: 0.7; margin: 2rem 0 0; }
`;

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
 *
 * **`aside` is the next step, and is separate from `body` because it is not
 * the same sentence for everybody.** It sits under the button, where the named
 * page puts what to do after installing. `self` is why it cannot be one shared
 * line: three of these are answered by asking the sender again, and the fourth
 * *is* the sender. Keeping them together also stopped `body` repeating it —
 * *used* said "ask whoever sent it for another one" and the button would have
 * said so again underneath.
 */
function refusalText(refusal: InviteRefusal): {
  heading: string;
  body: string;
  aside: string;
} {
  switch (refusal) {
    case 'used':
      return {
        heading: 'This invitation has already been used',
        body: 'An invite link works once.',
        aside: 'Ask whoever sent it for a fresh link — it takes them a moment.',
      };
    case 'expired':
      return {
        heading: 'This invitation has expired',
        body: 'Invite links last thirty days.',
        aside: 'Ask whoever sent it for a fresh link — it takes them a moment.',
      };
    case 'self':
      // Reachable only from the app, which is where a signed-in owner's own
      // link resolves; the page itself has no idea who is reading it.
      return {
        heading: 'This is your own invitation',
        body: 'Send it to somebody else, and they are in your contacts as soon as they open it.',
        aside: 'You can make another at any time, under Contacts.',
      };
    default:
      return {
        heading: 'This invitation cannot be opened',
        body: 'Check that the whole link was copied — the last part of it is what matters.',
        aside: 'If it keeps failing, ask whoever sent it for another.',
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
 * Accepting in the browser, which is a link that upgrades itself.
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

/**
 * The store button, or the browser standing in for it.
 *
 * **Never rendered dead**, which is the rule `landing.ts` and `supportPage`
 * already follow for the same setting: a box with no `APP_STORE_URL` is a
 * local checkout or a fresh one, and an `href=""` is worse than an absence.
 * So the single call to action is the install where there is one to offer and
 * the browser where there is not — one button either way, which is the whole
 * point of the page and has to survive a box that cannot make the first
 * choice.
 *
 * Returns the empty string only where there is neither, which is a guard
 * rather than a route anybody takes; the caller says what to do instead.
 */
function callToAction(options: InvitePageOptions, aside: string): string {
  if (options.appStoreUrl) {
    return `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">${aside}</span></p>`;
  }
  if (options.webAppReady) {
    return `<p class="cta"><a id="accept" href="/open">Accept in this browser</a>
<span class="aside">Free. It needs a microphone and nothing else.</span></p>`;
  }
  return '';
}

export function invitePage(options: InvitePageOptions): string {
  // Whether anything on this page writes the invitation into the tab. True
  // exactly when an anchor with this id was drawn — the promoted button above
  // or the demoted line below — so that the script and its target cannot fall
  // out of step. See acceptScript.
  const accepting = options.webAppReady;

  // No name, so no invitation to accept: the page is an explanation and a way
  // out. Nothing here says whose link it was, including in the title.
  if (!options.displayName || options.refusal) {
    const said = refusalText(options.refusal ?? 'unknown');
    // The promotional sentence is deliberately absent. A refusal and a pitch
    // are two openings, and the refusal is what this reader came for.
    return page({
      title: 'The Floor',
      heading: 'The Floor',
      standfirst: said.heading,
      social: socialCard(options.origin, CARD),
      head: REFERRER,
      style: STYLE,
      body: `${MARK}

<p>${said.body}</p>

${callToAction(options, said.aside)}
<p class="ends"><a href="/">More about The Floor</a> · <a href="/privacy">Privacy</a></p>
`,
    });
  }

  const name = escapeHtml(options.displayName);

  // The aside is the second step of the one call to action, and on this page it
  // is what the install buys: the invitation is spent by the app the moment
  // there is a session, so the person arrives with a contact and a channel
  // rather than an empty Home. A box with no store link says the same thing
  // about the browser instead — see callToAction.
  const aside = `Free. ${name} is in your contacts as soon as you sign in.`;

  // Offered only where there is something to open, the way `landing.ts`
  // withholds its browser link: a box can quite normally be serving no web app
  // at all, and sending somebody mid-acceptance to a 503 is worse than telling
  // them to use their phone. Withheld too where it has already been promoted
  // into the button above, or the page would offer it twice.
  const browser =
    options.webAppReady && options.appStoreUrl
      ? `<p class="browser"><a id="accept" href="/open">Or accept in this browser</a> — no
install; it needs a microphone and nothing else.</p>`
      : '';

  // A box serving neither train nor store. Nothing in this branch should read
  // as the ordinary way in, because there is not one.
  const neither =
    !options.appStoreUrl && !options.webAppReady
      ? `<p class="browser">This server is not handing out the app yet. Tell ${name}
you are here.</p>`
      : '';

  return page({
    title: `${options.displayName} invited you to The Floor`,
    heading: 'The Floor',
    standfirst: `${options.displayName} invited you`,
    // Names nobody, unlike the title above it — see CARD.
    social: socialCard(options.origin, CARD),
    head: REFERRER,
    style: STYLE,
    // One sentence, and it is planning/LISTING.md's promotional text. Change it
    // there first: it is the field the store reviews, and two copies of the
    // same claim drift towards the one nobody is checking.
    body: `${MARK}

<p class="lede">It’s a group chat, but voice. A channel is a place you drop
into: you arrive when it suits you, and whoever is there is there.</p>

${callToAction(options, aside)}
${browser}
${neither}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
${accepting ? acceptScript(options.username, options.pin) : ''}
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

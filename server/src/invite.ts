/**
 * The page an invite link opens: somebody you know, asking you here by name.
 *
 * **The one place in this application where a stranger is told a fact about a
 * user**, and it no longer tells them anything it was not given. The address
 * is `/i/<username>`, optionally carrying `?name=`, and this page **reads
 * nothing**: the name it draws came out of the address it was asked for. So
 * `/i/annak` and `/i/nobody_at_all` render identically, walking usernames
 * teaches a reader exactly what they typed, and there is no directory here —
 * which is what `core/username.ts` says there must not be.
 *
 * It used to check a pin and disclose a real display name to whoever held one;
 * see `decision/2026-09-25-an-invite-link-is-a-standing-door.md` for why the
 * address is the better answer, and `NAME_LIMIT` for what a name from a URL
 * costs.
 *
 * **Since 2026-10-12 it is a hand-over, not a page anybody reads** — the
 * community link's arrangement, applied here, and
 * `decision/2026-10-12-a-contact-invitation-is-two-links.md` has the account.
 * The app shares two links, the App Store and this one (`contactInvite` in its
 * catalogue), and `/i/*` is a universal link: on an iPhone with the app, iOS
 * opens the app and this server never sees the request. Everybody else lands
 * here, and with a web app on the box is sent straight on into it with the
 * username left in the tab, to be accepted once there is a session — after a
 * sign-in, if that comes first. See `handoverPage`.
 *
 * **What it replaced was the return tap**: one call to action, the install,
 * then *come back to this link and press Open in the app*, which handed over
 * `thefloor://i/<username>` — two taps, written into the copy because no
 * script could detect an install (`decision/2026-09-25-the-invitation-asks-
 * for-one-thing.md`). The universal link is what that decision was waiting
 * for, and the copy it needed went with it.
 *
 * **A box with no web app still draws a page**: the store, and the line that
 * says to tap the link again once the app is installed, which by then opens
 * the app. A box with neither says so.
 *
 * **The prose budget is one sentence on each body, and it is a rule rather than
 * a result.** This page has accreted twice. The sentence is the promotional
 * text, whose source of truth is planning/task/apply-the-app-store-listing.md —
 * change it there first, or this page and the store listing drift and the
 * listing's copy is the one under review. There is now no claim here at all
 * about what a browser cannot do, which is the cheapest possible way to keep
 * landing.ts's rule that any such claim must be checkable against the shipped
 * web app.
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
 * **The 2026-09-14 roadmap item *Say the same thing everywhere* — planning/
 * PROPOSITION.md § *What the proposition obliges, in order*, item 6 — named
 * landing.ts and support.ts and stopped there.** It missed this file, in two
 * places — which matters more than either of the two it found:
 * planning/MARKETING.md argues that the invite page is the *top of the funnel*,
 * since somebody opening one has been asked by name, where a listing has to
 * persuade from cold. The wrongest copy was on the most-converting page.
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
 * end is `peekInvite` in `app/src/ui/handover.ts`.
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
 * The rules `CTA_STYLE` does not carry, because only this page wants them.
 *
 * `.lede` and the button furniture are shared — see `CTA_STYLE` in html.ts,
 * and the warning there that nothing in it may assume a light ground, which is
 * why this page can use it at all.
 */
const STYLE = `${CTA_STYLE}
  .ends { font-size: 0.9rem; opacity: 0.7; margin: 2rem 0 0; }
  .app { font-size: 0.9rem; opacity: 0.7; margin: 1rem 0 0; }
`;

export interface InvitePageOptions {
  /** The username in the link, exactly as it was typed into the address. */
  username: string;
  /**
   * The name to greet the reader with, from the link's own `?name=`.
   *
   * **Not looked up, and that is the whole of the design.** Resolving a
   * username to a display name would make this server answer "who is @annak"
   * for anybody who asked, which is the directory `core/username.ts` says
   * there is not. Carrying it in the address instead means the page can say
   * *Anna Kowalski invited you* while knowing nothing, and a reader who walks
   * usernames learns exactly what they typed.
   *
   * **So it is not evidence, and the page must not dress it as any.** Anybody
   * may write any name into any link. What it buys them is one line of prose:
   * the contact is the account named by the *username*, and the app draws that
   * account's real display name from the moment it exists. Escaped and capped
   * below — a link is a place somebody else's text arrives from.
   */
  displayName?: string;
  /** Where this server is reachable, for the link preview. See socialCard. */
  origin?: string;
  /** From APP_STORE_URL. Absent on a box that has not been told. */
  appStoreUrl?: string;
  /** Whether there is a web app on this box at all; see `landing.ts`. */
  webAppReady: boolean;
}

/**
 * The longest name this page will draw.
 *
 * Forty, which is the cap a display name is stored under, so an honest link is
 * never truncated. It is here because the name arrives in a URL rather than
 * from the database: without it, a link could carry a kilobyte of text and
 * this page would set it as a heading.
 */
const NAME_LIMIT = 40;

/**
 * What each refusal says, in the second person and without a diagnosis nobody
 * can act on.
 *
 * **None of these is a page any more, since 2026-09-25.** They were, while a
 * link carried a pin: the page checked it and said why it would not name
 * anybody. A link is `/i/<username>` now and the page checks nothing, so every
 * one of these reaches a person through the app instead, as the sentence a
 * failed acceptance puts on screen.
 *
 * `unknown` and `locked` deliberately give the same sentence, and `used` and
 * `expired` survive only for links minted before the pin went — see
 * planning/SHIMS.md.
 */
function refusalText(refusal: InviteRefusal): string {
  switch (refusal) {
    case 'used':
      return 'This invite link has already been used';
    case 'expired':
      return 'This invite link has expired';
    case 'self':
      return 'This is your own invite link';
    case 'too_many':
      return 'You have followed as many invite links as you can today';
    default:
      return 'This invite link cannot be opened';
  }
}

/**
 * The one-sentence form, for the app, which is now the only reader.
 */
export function inviteRefusalText(refusal: InviteRefusal): string {
  return `${refusalText(refusal)}.`;
}

export function invitePage(options: InvitePageOptions): string {
  // **Capped here, escaped where it is used, and only once.** The cap is about
  // a heading somebody else chose the length of. The escaping is deliberately
  // not done here: `page()` escapes `title` and `standfirst` itself, so a value
  // escaped up front would reach a reader as `&lt;` rather than `<` — the same
  // double-escape that makes an apostrophe in a name read as `&#39;`.
  const raw = options.displayName
    ? options.displayName.slice(0, NAME_LIMIT)
    : `@${options.username}`;
  // For the body, which this file interpolates into markup itself.
  const name = escapeHtml(raw);

  // Somebody with the app never gets here — see the module comment — so with
  // a web app to go to, everybody who does is handed straight on to it.
  if (options.webAppReady) return handoverPage(raw, options);

  // A box with no web app has nowhere to send anybody but the store, and the
  // second tap is the link they were sent: a universal link once the app is
  // on the phone. **Never rendered dead**, which is `landing.ts`'s rule about
  // the same setting: a box with neither says so rather than drawing an
  // `href=""`.
  const store = options.appStoreUrl
    ? `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">Free. Once it’s installed, tap the link you were sent again: ${name} is in your contacts as soon as you sign in.</span></p>`
    : `<p class="browser">This server is not handing out the app yet. Tell ${name}
you are here.</p>`;

  return page({
    title: `${raw} invited you to The Floor`,
    heading: 'The Floor',
    standfirst: `${raw} invited you`,
    // Names nobody, unlike the title above it — see CARD.
    social: socialCard(options.origin, CARD),
    head: REFERRER,
    style: STYLE,
    // One sentence, and it is planning/task/apply-the-app-store-listing.md's
    // promotional text. Change it there first: it is the field the store
    // reviews, and two copies of the same claim drift towards the one nobody is
    // checking.
    body: `${MARK}

<p class="lede">It’s a group chat, but voice. A channel is a place you drop
into: you arrive when it suits you, and whoever is there is there.</p>

${store}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
`,
  });
}

/**
 * The one click, for somebody without the app: into the web app, with the
 * username left in the tab for `peekInvite`.
 *
 * **A page and not a redirect**, for `community-page.ts`'s two reasons: a link
 * preview's crawler reads the card from it, and only a script can write the
 * tab's `sessionStorage`.
 *
 * **The username alone, whichever address was asked for.** A link minted
 * before 2026-09-25 carries a pin, and the pin is not passed on: taking a link
 * up by username accepts for any account and is never refused as used, which
 * a spent pin would be. And it stays in the tab until it is spent, not until
 * it is read, so a reload during the sign-in — iOS reloading a tab left for
 * the mail app — keeps it. See `peekInvite`.
 *
 * Without JavaScript the link still opens the web app, and arrives without
 * the invitation: nothing is silently half-done, and they can be added the
 * ordinary way. `/open` rather than a train, which is the rule `open.ts` owns.
 */
function handoverPage(name: string, options: InvitePageOptions): string {
  // JSON.stringify, not the escaper: this is a JavaScript string literal
  // rather than markup. A username is letters, digits and underscores, but the
  // address is somebody else's text, so `<` is escaped for the script element
  // regardless.
  const invite = JSON.stringify(JSON.stringify({ username: options.username })).replace(
    /</g,
    '\\u003c'
  );
  return page({
    title: `${name} invited you to The Floor`,
    heading: 'The Floor',
    standfirst: `${name} invited you`,
    social: socialCard(options.origin, CARD),
    head: `${REFERRER}
<script>
try { sessionStorage.setItem(${JSON.stringify(INVITE_KEY)}, ${invite}); } catch (e) {}
location.replace('/open');
</script>`,
    style: STYLE,
    body: `${MARK}
<p class="lede">Opening The Floor…</p>
<p class="app"><a href="/open">Continue</a> if this page does not move on by itself.</p>
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

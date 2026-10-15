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
 * **The pin went on 2026-09-25 and came back on 2026-10-15.** In between, the
 * link was a standing `/i/<username>?name=`, and the page drew whatever name
 * the address carried, since it had nothing to check before saying a real
 * one. See `decision/2026-10-15-an-invite-link-carries-a-pin-again.md`. A link
 * from those three weeks still renders, naming nobody, and is still taken up
 * by username — a shim, in planning/SHIMS.md.
 *
 * **One button since 2026-10-15, and it is *Accept invite*,** with the
 * install as its prerequisite in a bar across the top — the shape the
 * community page shares, and `accept.ts` has the reasoning. On iOS *Accept*
 * hands the app `thefloor://i/<username>/<pin>`, the banner's own argument.
 * Everywhere else it writes the invitation into the tab and opens the web app,
 * which takes it up once there is a session — a contact, the pair's channel,
 * and that channel opened.
 *
 * `/i/*` is a universal link, so on an iPhone with the app iOS opens the app
 * and this server never sees the request; everybody who lands here either has
 * no app yet or has told iOS to keep this domain in Safari, which the Smart
 * App Banner (`smartAppBanner`) is for.
 *
 * **The prose budget is one sentence on each body, and it is a rule rather than
 * a result.** This page has accreted twice. The sentence is the promotional
 * text, whose source of truth is planning/task/apply-the-app-store-listing.md —
 * change it there first, or this page and the store listing drift and the
 * listing's copy is the one under review.
 */

import { ACCEPT_STYLE, PLATFORM, acceptBlock, acceptScript, appBar } from './accept';
import { MARK, escapeHtml, page, smartAppBanner, socialCard } from './html';
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
 * The link preview for every body below, and **it deliberately names nobody.**
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
 * One card for every body, refusal included: a crawler and the person who
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

/** `accept.ts`'s rules, which the refusal and the hand-over draw under too. */
const STYLE = ACCEPT_STYLE;

export interface InvitePageOptions {
  /** The username in the link, exactly as it was typed into the address. */
  username: string;
  /**
   * The pin in the link. Never shown; carried to the web app and to the
   * banner's `app-argument`. Absent for a link minted between 2026-09-25 and
   * 2026-10-15, which had none.
   */
  pin?: string;
  /**
   * The inviter's display name — given only when the pin checked out, which is
   * what keeps this page from answering "who is @annak" for anybody who asks.
   * Looked up by the route, never read from the address.
   */
  displayName?: string;
  /** Why there is no name, when the pin did not check out. */
  refusal?: InviteRefusal;
  /** Where this server is reachable, for the link preview. See socialCard. */
  origin?: string;
  /** From APP_STORE_URL. Absent on a box that has not been told. */
  appStoreUrl?: string;
  /** Whether there is a web app on this box at all; see `landing.ts`. */
  webAppReady: boolean;
}

/**
 * What each refusal says, in the second person and without a diagnosis nobody
 * can act on — on the page, and as the one sentence a failed acceptance puts
 * on screen in the app.
 *
 * `unknown` and `locked` deliberately give the same sentence. They are
 * different states — one is a pin that never existed, the other is an account
 * that has stopped answering after too many wrong ones — and telling them
 * apart would hand a guesser the one thing worth knowing: whether to keep
 * going. Somebody with a genuine link reads "check the link" either way and is
 * not misled, since a locked window passes.
 *
 * **`aside` is the next step, and is separate from `body` because it is not
 * the same sentence for everybody.** `self` is why it cannot be one shared
 * line: the others are answered by asking the sender again, and `self` *is*
 * the sender. `too_many` never reaches the page; it is the pin-less door's.
 */
function refusalText(refusal: InviteRefusal): {
  heading: string;
  body: string;
  aside: string;
} {
  switch (refusal) {
    case 'used':
      // **The one refusal that still asks for the install.** A spent pin means
      // the relationship cannot be made from this link, and it says nothing at
      // all about whether this person should be here — anybody may sign up, and
      // a page that reads as a closed door turns a spent link into a rejection.
      return {
        heading: 'This invite link has already been used',
        body: 'An invite link works once — but go ahead and install anyway. The Floor isn’t invitation-only.',
        aside:
          'Free. Ask whoever sent it for a fresh link too, and you will arrive ' +
          'with them in your contacts.',
      };
    case 'expired':
      return {
        heading: 'This invite link has expired',
        body: 'Invite links last thirty days.',
        aside: 'Ask whoever sent it for a fresh link — it takes them a moment.',
      };
    case 'self':
      // Reachable only from the app, which is where a signed-in owner's own
      // link resolves; the page itself has no idea who is reading it.
      return {
        heading: 'This is your own invite link',
        body: 'Send it to somebody else, and they are in your contacts as soon as they open it.',
        aside: 'You can make another at any time, under Contacts.',
      };
    case 'too_many':
      return {
        heading: 'You have followed as many invite links as you can today',
        body: 'Try again tomorrow.',
        aside: '',
      };
    default:
      return {
        heading: 'This invite link cannot be opened',
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
 * moment after they signed in.
 */
export function inviteRefusalText(refusal: InviteRefusal): string {
  return `${refusalText(refusal).heading}.`;
}

export function invitePage(options: InvitePageOptions): string {
  // A pin that did not check out: an explanation and a way out, naming
  // nobody, including in the title. No accept button — there is nothing here
  // to accept.
  if (options.refusal) {
    const said = refusalText(options.refusal);
    const store = options.appStoreUrl
      ? `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">${said.aside}</span></p>`
      : `<p class="browser">${said.aside}</p>`;
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

${store}
<p class="ends"><a href="/">More about The Floor</a> · <a href="/privacy">Privacy</a></p>
`,
    });
  }

  // **Who, from the database and never from the address.** A pin-less link
  // names nobody: the route has nothing to check, so it has nothing to say.
  const who = options.displayName;
  const invite = { username: options.username, ...(options.pin ? { pin: options.pin } : {}) };

  // Nothing to lead with but the web app, so no page asks which.
  if (options.webAppReady && !options.appStoreUrl) {
    return handoverPage(who, invite, options);
  }

  const name = who ? escapeHtml(who) : 'whoever sent it';
  const store = options.appStoreUrl ? escapeHtml(options.appStoreUrl) : '';

  // The install, out of the body and into the strip across the top: the
  // prerequisite rather than a rival to the acceptance.
  const bar = appBar(store);

  // **Never rendered dead**, which is `landing.ts`'s rule about the same
  // setting. Without script, *Accept* goes to the web app where there is one
  // and to the store where there is not — a box with neither draws no button.
  // With script on iOS it hands the app the invitation; see `acceptScript`.
  const fallback = options.webAppReady ? '/open' : store;
  const accept = !!fallback;
  const contacts = `${who ? name : 'They'} will be in your contacts as soon as you sign in.`;
  const buttons = accept
    ? acceptBlock({ href: fallback, label: 'Accept invite', verb: 'accept', store, aside: contacts })
    : `<p class="browser">This server is not handing out the app yet. Tell ${name}
you are here.</p>`;

  // What the app is handed if somebody who has it takes the banner's *Open*,
  // or taps *Accept* on iOS: the scheme form, which every build since 288
  // reads, pin and all — `smartAppBanner` says why not this page's own address.
  const scheme = schemeUrl(invite);
  const banner = smartAppBanner(options.appStoreUrl, scheme);

  // **The invitation is written into the tab on the click, not on arrival**,
  // since the pin came back: a pin is one seat, and a tab that merely looked
  // has not taken it. Without JavaScript the anchor still reaches the web app,
  // arriving without the invitation — the honest degradation. It stays in the
  // tab until it is spent, so a sign-in's trip to the mail app cannot lose it;
  // see `peekInvite`. On iOS the click goes to the app instead.
  return page({
    title: who ? `${who} invited you to The Floor` : 'You’re invited to The Floor',
    heading: who ? `${who} invited you` : 'You’ve been invited',
    standfirst: '',
    // Names nobody, unlike the title above it — see CARD.
    social: socialCard(options.origin, CARD),
    head: [REFERRER, banner, PLATFORM].filter(Boolean).join('\n'),
    style: STYLE,
    bar,
    // One sentence, and it is planning/task/apply-the-app-store-listing.md's
    // promotional text. Change it there first: it is the field the store
    // reviews, and two copies of the same claim drift towards the one nobody is
    // checking.
    body: `<p class="lede">It’s a group chat, but voice. A channel is a place you drop
into: you arrive when it suits you, and whoever is there is there.</p>

${buttons}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
${accept ? acceptScript({ scheme, remember: { key: INVITE_KEY, value: inviteLiteral(invite) } }) : ''}
`,
  });
}

interface Invite {
  username: string;
  pin?: string;
}

/** `thefloor://i/<username>[/<pin>]`, for the banner. */
function schemeUrl(invite: Invite): string {
  const path = [invite.username, invite.pin]
    .filter((part): part is string => !!part)
    .map(encodeURIComponent)
    .join('/');
  return `thefloor://i/${path}`;
}

/**
 * The invitation as a JavaScript string literal holding its JSON, for the tab.
 *
 * JSON.stringify twice, not the escaper: this is a string literal rather than
 * markup. A username is letters, digits and underscores and a pin is six
 * digits, but the address is somebody else's text, so `<` is escaped for the
 * script element regardless.
 */
function inviteLiteral(invite: Invite): string {
  return JSON.stringify(JSON.stringify(invite)).replace(/</g, '\\u003c');
}

/**
 * Straight into the web app, for a box with no App Store to lead with.
 *
 * **A page and not a redirect**, for `community-page.ts`'s two reasons: a link
 * preview's crawler reads the card from it, and only a script can write the
 * tab's `sessionStorage`. `/open` rather than a train, which is the rule
 * `open.ts` owns. Written on arrival here, there being no button to wait for.
 */
function handoverPage(
  who: string | undefined,
  invite: Invite,
  options: InvitePageOptions
): string {
  return page({
    title: who ? `${who} invited you to The Floor` : 'You’re invited to The Floor',
    heading: 'The Floor',
    standfirst: who ? `${who} invited you` : 'You’ve been invited',
    social: socialCard(options.origin, CARD),
    head: `${REFERRER}
<script>
try { sessionStorage.setItem(${JSON.stringify(INVITE_KEY)}, ${inviteLiteral(invite)}); } catch (e) {}
location.replace('/open');
</script>`,
    style: STYLE,
    body: `${MARK}
<p class="lede">Opening The Floor…</p>
<p class="browser"><a href="/open">Continue</a> if this page does not move on by itself.</p>
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

/**
 * What a *community link* opens, `/j/<code>`, for whoever the app did not
 * open it for.
 *
 * **Telegram's page since 2026-10-13**, as `invite.ts` is: the community, the
 * App Store, and *continue in the browser* as the quieter alternative, under
 * Safari's Smart App Banner. The owner shares this one link and nothing
 * beside it (`communityInvite` in the app's catalogue), and it is a universal
 * link, so on an iPhone with the app it opens the app and never reaches this
 * server. `invite.ts`'s header has the reasoning, and what of Telegram's page
 * was left out; `decision/2026-10-13-an-invitation-is-one-link-and-a-page.md`
 * the account. Only a box with a web app and no App Store hands straight
 * over, as every box did from 2026-10-11.
 *
 * **Accepts nothing by being opened**, which is unchanged: it leaves the code
 * where the web app looks for it, and the web app spends it once there is a
 * session — after a sign-in, if that is what comes first. Membership and
 * nothing else: nobody becomes the owner's contact, or anybody's.
 *
 * **Names no member, the owner included.** A community link is meant to be
 * pasted somewhere public — Substack, to begin with — so this is read by
 * strangers in bulk, and the directory page's boundary applies: the channel's
 * name, its description and how many members it has, and nobody's name.
 * `publication.test.ts`'s rule, asserted again in `community.test.ts`.
 *
 * **One page for a code that is unknown, revoked, or belongs to a channel that
 * has gone**, so that walking codes teaches nothing about which existed. That
 * page is still a page, since there is nothing to hand over.
 *
 * **A full community is drawn like any other where there is a web app.** This
 * page cannot tell who is reading it, and a member already in a full
 * community is owed the community, not a refusal: the link opens it whether or
 * not they had joined. The signed-in app can tell, so it asks, and somebody
 * who is not a member hears the server's *is full* there instead.
 */

import { CTA_STYLE, MARK, escapeHtml, page, smartAppBanner, socialCard } from './html';

/**
 * The key the web app takes the code out of. Repeated rather than imported, as
 * `invite.ts` repeats its own: the other end is `peekJoin` in
 * `app/src/ui/handover.ts`. `sessionStorage`, for that file's reason — a join
 * belongs to the visit that is making it.
 */
const JOIN_KEY = 'thefloor.join';

const STYLE = `${CTA_STYLE}
  .ends { font-size: 0.9rem; opacity: 0.7; margin: 2rem 0 0; }
  .app { font-size: 0.9rem; opacity: 0.7; margin: 1rem 0 0; }
  .about { white-space: pre-wrap; }
`;

/**
 * The preview card, which names nothing at all — not even the community.
 *
 * The same tightening `invite.ts`'s CARD makes, for a wider audience still: a
 * preview cache keeps what it fetched long after the owner resets the link,
 * and a community's name is the one fact here somebody chose to show only to
 * whoever holds the address.
 */
const CARD = {
  title: 'You’re invited to a community on The Floor',
  description:
    'It’s a group chat, but voice: you drop into a channel rather than ' +
    'answer a call, and nothing rings.',
  imageAlt: 'The Floor — it’s a group chat, but voice. Nothing rings.',
};

export interface CommunityPageOptions {
  /** The code from the address, exactly as asked for. */
  code: string;
  /** The live community, or null for a code that opens nothing. */
  community: {
    name: string;
    description: string | null;
    members: number;
    full: boolean;
  } | null;
  origin?: string;
  appStoreUrl?: string;
  webAppReady: boolean;
}

export function communityPage(options: CommunityPageOptions): string {
  const { community } = options;
  if (!community) {
    return page({
      title: 'The Floor',
      heading: 'The Floor',
      standfirst: 'This link no longer opens anything',
      social: socialCard(options.origin, CARD),
      head: REFERRER,
      style: STYLE,
      body: `${MARK}

<p class="lede">Its owner may have reset it. Ask whoever gave it to you for
the current one.</p>

<p class="ends"><a href="/">What The Floor is</a></p>
`,
    });
  }

  const name = escapeHtml(community.name);
  const code = encodeURIComponent(options.code);
  const members =
    community.members === 1 ? 'One member so far.' : `${community.members} members so far.`;
  const about = community.description
    ? `<p class="about">${escapeHtml(community.description)}</p>`
    : '';

  // Nothing to lead with but the web app, so no page asks which. Ahead of the
  // full page, not after it: see the header.
  if (options.webAppReady && !options.appStoreUrl) return handoverPage(community.name, options);

  if (community.full && !options.webAppReady) {
    return page({
      title: `${community.name} — The Floor`,
      heading: 'The Floor',
      standfirst: community.name,
      social: socialCard(options.origin, CARD),
      head: REFERRER,
      style: STYLE,
      body: `${MARK}
${about}
<p class="lede">${name} is full for now. Ask whoever gave you this link.</p>
`,
    });
  }

  // The store leads and the browser follows, as on `invite.ts`'s page.
  const store = options.appStoreUrl
    ? `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">Free. Once it’s installed, tap the link you were sent again and you’re in ${name}.</span></p>`
    : '<p class="app">This server is not handing out the app yet.</p>';
  const browser = options.webAppReady
    ? '<p class="app">Or <a href="/open">continue in the browser</a>.</p>'
    : '';
  const banner = smartAppBanner(
    options.appStoreUrl,
    options.origin && `${options.origin}/j/${code}`
  );

  return page({
    title: `${community.name} — The Floor`,
    heading: 'The Floor',
    standfirst: community.name,
    social: socialCard(options.origin, CARD),
    head: [REFERRER, banner, options.webAppReady ? stash(options.code) : '']
      .filter(Boolean)
      .join('\n'),
    style: STYLE,
    body: `${MARK}
${about}
<p class="lede">A community on The Floor, which is a group chat, but voice.
${members}</p>

${store}
${browser}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
`,
  });
}

/**
 * Leaves the code in the tab for `peekJoin`, which is the whole of what
 * carries a join from this page into the web app.
 *
 * **The code stays in the tab until it is spent**, not until it is read, so
 * the sign-in in between can take as long as it takes: a trip to the mail app
 * for the code, which is when iOS reloads a backgrounded tab, comes back to a
 * join still waiting. See `peekJoin`.
 *
 * Without JavaScript the web app still opens, and arrives without the join —
 * `invite.ts`'s honest degradation, for its reason.
 */
function stash(code: string, then = ''): string {
  // Only ever a code this server minted, since the page is drawn only for a
  // live community; escaped for a script element regardless.
  const join = JSON.stringify(JSON.stringify({ code })).replace(/</g, '\\u003c');
  return `<script>
try { sessionStorage.setItem(${JSON.stringify(JOIN_KEY)}, ${join}); } catch (e) {}${then}
</script>`;
}

/**
 * Straight into the web app, for a box with no App Store to lead with.
 *
 * **A page and not a redirect**, for two readers a 302 would lose. A link
 * preview's crawler reads the card from it, and a 302 has no card. And the
 * code has to cross by `sessionStorage`, which only a script can write.
 */
function handoverPage(name: string, options: CommunityPageOptions): string {
  return page({
    title: `${name} — The Floor`,
    heading: 'The Floor',
    standfirst: name,
    social: socialCard(options.origin, CARD),
    head: `${REFERRER}
${stash(options.code, "\nlocation.replace('/open');")}`,
    style: STYLE,
    body: `${MARK}
<p class="lede">Joining ${escapeHtml(name)}…</p>
<p class="app"><a href="/open">Continue</a> if this page does not move on by itself.</p>
`,
  });
}

/** The address is the credential here too; see invite.ts's REFERRER. */
const REFERRER = '<meta name="referrer" content="no-referrer">';

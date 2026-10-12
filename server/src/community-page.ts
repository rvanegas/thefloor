/**
 * What a *community link* opens, `/j/<code>`, for whoever the app did not
 * open it for.
 *
 * **Not a page anybody is meant to read any more, since 2026-10-11.** It used
 * to be the invitation itself — the community described, the App Store, then
 * `thefloor://j/<code>` to tap once the app was installed, then the web app as
 * the alternative — and it is now a hand-over. The owner shares two links,
 * the App Store and this one (`communityInvite` in the app's catalogue), and
 * this one is a universal link: on an iPhone with the app it opens the app and
 * never reaches this server, and everywhere else it lands here and goes
 * straight on into the web app with the code. See
 * `decision/2026-10-11-a-community-invitation-is-two-links.md`.
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
 * page and the full one are still pages, since there is nothing to hand over.
 */

import { CTA_STYLE, MARK, escapeHtml, page, socialCard } from './html';

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

  if (community.full) {
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

  // Somebody with the app never gets here: `/j/*` is a universal link, so
  // iOS hands the address to the app and this server never sees the request.
  // What reaches it is everybody else — a phone without the app, a desktop,
  // anybody who has told iOS to keep this domain in Safari — and for all of
  // them the one click is the web app, the code going ahead of them in the
  // tab. The App Store link travels beside this one in the message, so this
  // page does not repeat it. See handoverPage.
  if (options.webAppReady) return handoverPage(community.name, options);

  // A box with no web app has nowhere to send anybody but the store, and the
  // second tap is the link they were sent: a universal link once the app is
  // on the phone.
  const store = options.appStoreUrl
    ? `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">Free. Once it’s installed, tap the link you were sent again and you’re in ${name}.</span></p>`
    : '<p class="app">This server is not handing out the app yet.</p>';

  return page({
    title: `${community.name} — The Floor`,
    heading: 'The Floor',
    standfirst: community.name,
    social: socialCard(options.origin, CARD),
    head: REFERRER,
    style: STYLE,
    body: `${MARK}
${about}
<p class="lede">A community on The Floor, which is a group chat, but voice.
${members}</p>

${store}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
`,
  });
}

/**
 * The one click, for somebody without the app: into the web app, with the
 * code left in the tab for `peekJoin`.
 *
 * **A page and not a redirect**, for two readers a 302 would lose. A link
 * preview's crawler reads the card from it, and a 302 has no card. And the
 * code has to cross by `sessionStorage`, which only a script can write — the
 * same hand-over the old page made on a click, made here on arrival.
 *
 * **The code stays in the tab until it is spent**, not until it is read, so
 * the sign-in in between can take as long as it takes: a trip to the mail app
 * for the code, which is when iOS reloads a backgrounded tab, comes back to a
 * join still waiting. See `peekJoin`.
 *
 * Without JavaScript the link still opens the web app, and arrives without
 * the join — `invite.ts`'s honest degradation, for its reason.
 */
function handoverPage(name: string, options: CommunityPageOptions): string {
  // Only ever a code this server minted, since the page is drawn only for a
  // live community; escaped for a script element regardless.
  const join = JSON.stringify(JSON.stringify({ code: options.code })).replace(
    /</g,
    '\\u003c'
  );
  return page({
    title: `${name} — The Floor`,
    heading: 'The Floor',
    standfirst: name,
    social: socialCard(options.origin, CARD),
    head: `${REFERRER}
<script>
try { sessionStorage.setItem(${JSON.stringify(JOIN_KEY)}, ${join}); } catch (e) {}
location.replace('/open');
</script>`,
    style: STYLE,
    body: `${MARK}
<p class="lede">Joining ${escapeHtml(name)}…</p>
<p class="app"><a href="/open">Continue</a> if this page does not move on by itself.</p>
`,
  });
}

/** The address is the credential here too; see invite.ts's REFERRER. */
const REFERRER = '<meta name="referrer" content="no-referrer">';

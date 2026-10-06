/**
 * The page a *community link* opens: `/j/<code>`.
 *
 * **Instructional, and it accepts nothing by being opened** — settled at the
 * prompt on 2026-10-04. It describes the community and carries the two ways
 * in: the App Store listing, then the *join link*, `thefloor://j/<code>`, which
 * is what makes whoever follows it a member once they are signed in; and the
 * web app as the alternative, which takes the code up from the tab the way
 * `invite.ts`'s browser line takes an invitation. Membership and nothing
 * else: nobody becomes the owner's contact, or anybody's.
 *
 * **Built on the invite page's shape on purpose**, since that page already
 * crosses the App Store gap by the return tap, and its module comment carries
 * the argument for the custom scheme and for demoting the browser. Not
 * restated here.
 *
 * **Names no member, the owner included.** A community link is meant to be
 * pasted somewhere public — Substack, to begin with — so this is read by
 * strangers in bulk, and the directory page's boundary applies: the channel's
 * name, its description and how many members it has, and nobody's name.
 * `publication.test.ts`'s rule, asserted again in `community.test.ts`.
 *
 * **One page for a code that is unknown, revoked, or belongs to a channel that
 * has gone**, so that walking codes teaches nothing about which existed.
 */

import { CTA_STYLE, MARK, escapeHtml, page, socialCard } from './html';

/**
 * The key the web app takes the code out of. Repeated rather than imported, as
 * `invite.ts` repeats its own: the other end is `takeJoin` in
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

function joinScript(code: string): string {
  const join = JSON.stringify(JSON.stringify({ code }));
  return `
<script>
(function () {
  var link = document.getElementById('join');
  if (!link) return;
  link.addEventListener('click', function () {
    try { sessionStorage.setItem(${JSON.stringify(JOIN_KEY)}, ${join}); } catch (e) {}
  });
})();
</script>`;
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

  // The store first, and the join link as the step after it, which is the
  // order somebody without the app has to take them in — see invite.ts for
  // why the custom scheme is never offered as an alternative to installing.
  const store = options.appStoreUrl
    ? `<p class="cta"><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a>
<span class="aside">Free. Once it’s on your phone, come back to this page there and tap Join ${name} below.</span></p>
<p class="app"><a href="thefloor://j/${code}">Join ${name}</a> — in the app on your iPhone, once it’s installed.</p>`
    : '';
  const browser = options.webAppReady
    ? `<p class="${options.appStoreUrl ? 'app' : 'cta'}">${
        options.appStoreUrl ? 'Not on an iPhone? ' : ''
      }<a id="join" href="/open">${
        options.appStoreUrl ? 'Join in this browser' : `Join ${name} in this browser`
      }</a> — no install; it needs a microphone and nothing else.</p>`
    : '';
  const neither =
    !options.appStoreUrl && !options.webAppReady
      ? '<p class="app">This server is not handing out the app yet.</p>'
      : '';

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
${browser}
${neither}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
${options.webAppReady ? joinScript(options.code) : ''}
`,
  });
}

/** The address is the credential here too; see invite.ts's REFERRER. */
const REFERRER = '<meta name="referrer" content="no-referrer">';

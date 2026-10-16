/**
 * The page a *member link* opens: `/m/<username>/<pin>`, somebody asking you
 * into one of their channels. Since 2026-10-16.
 *
 * **The invite page's shape** (`invite.ts`), and for the same reasons — one
 * button, *Accept invite*, with the install as its prerequisite in the bar
 * across the top; on iOS the button hands the app the scheme form,
 * `thefloor://m/<username>/<pin>`; elsewhere it writes the invitation into the
 * tab for the web app, which takes it up once there is a session. What differs
 * is what accepting makes: **a member of one channel and nothing else** — not
 * a contact, which is the invite link's whole point and a community link's
 * rule.
 *
 * **What it discloses is the invite page's narrowing**: the inviter's name is
 * drawn only beside a live pin, and the channel is never named — a channel's
 * title can be its members' names, which is not a stranger's to read. The
 * channel is what the app opens once the link is taken up.
 */

import { ACCEPT_STYLE, PLATFORM, acceptBlock, acceptScript, appBar } from './accept';
import type { InviteRefusal } from './accounts';
import { MARK, escapeHtml, page, smartAppBanner, socialCard } from './html';

/**
 * The key the web app takes the invitation out of. The other end is
 * `peekMemberInvite` in `app/src/ui/handover.ts`, `sessionStorage` for the
 * reason `INVITE_KEY` gives in invite.ts.
 */
const MEMBER_INVITE_KEY = 'thefloor.memberInvite';

/** Names nobody, for the reason invite.ts's `CARD` does. */
const CARD = {
  title: 'You’re invited to a channel on The Floor',
  description:
    'Somebody you know has asked you into one of their channels. It’s a group chat, but voice: ' +
    'you drop into a channel rather than answer a call, and nothing rings.',
  imageAlt: 'The Floor — it’s a group chat, but voice. Nothing rings.',
};

/** Keeps the pin out of the next request's `Referer`; see invite.ts. */
const REFERRER = '<meta name="referrer" content="no-referrer">';

export interface MemberInvitePageOptions {
  username: string;
  pin: string;
  /** The inviter's name, only when the pin checked out. */
  displayName?: string;
  refusal?: InviteRefusal | 'ended';
  origin?: string;
  appStoreUrl?: string;
  webAppReady: boolean;
}

/** What each refusal says, on the page and as the app's one sentence. */
function refusalText(refusal: InviteRefusal | 'ended'): { heading: string; body: string } {
  switch (refusal) {
    case 'used':
      return {
        heading: 'This channel invitation has already been used',
        body: 'A channel invitation works once. Ask whoever sent it for a fresh one.',
      };
    case 'expired':
      return {
        heading: 'This channel invitation has expired',
        body: 'Channel invitations last thirty days. Ask whoever sent it for a fresh one.',
      };
    case 'ended':
      return {
        heading: 'This channel no longer exists',
        body: 'Everybody left it, so there is nothing to join.',
      };
    default:
      return {
        heading: 'This channel invitation cannot be opened',
        body: 'Check that the whole link was copied — the last part of it is what matters.',
      };
  }
}

/** The one-sentence form, for the app. */
export function memberRefusalText(refusal: InviteRefusal | 'ended'): string {
  return `${refusalText(refusal).heading}.`;
}

export function memberInvitePage(options: MemberInvitePageOptions): string {
  if (options.refusal) {
    const said = refusalText(options.refusal);
    return page({
      title: 'The Floor',
      heading: 'The Floor',
      standfirst: said.heading,
      social: socialCard(options.origin, CARD),
      head: REFERRER,
      style: ACCEPT_STYLE,
      body: `${MARK}

<p>${said.body}</p>
<p class="ends"><a href="/">More about The Floor</a> · <a href="/privacy">Privacy</a></p>
`,
    });
  }

  const who = options.displayName;
  const name = who ? escapeHtml(who) : 'Somebody';
  const store = options.appStoreUrl ? escapeHtml(options.appStoreUrl) : '';
  const invite = { username: options.username, pin: options.pin };
  const scheme = `thefloor://m/${encodeURIComponent(invite.username)}/${encodeURIComponent(invite.pin)}`;
  const fallback = options.webAppReady ? '/open' : store;
  const buttons = fallback
    ? acceptBlock({
        href: fallback,
        label: 'Accept invite',
        verb: 'accept',
        store,
        aside: 'You will be a member of the channel as soon as you sign in.',
      })
    : `<p class="browser">This server is not handing out the app yet. Tell ${name} you are here.</p>`;
  const literal = JSON.stringify(JSON.stringify(invite)).replace(/</g, '\\u003c');

  return page({
    title: who ? `${who} asked you into a channel on The Floor` : 'You’re invited to a channel on The Floor',
    heading: who ? `${who} asked you into a channel` : 'You’ve been asked into a channel',
    standfirst: '',
    social: socialCard(options.origin, CARD),
    head: [REFERRER, smartAppBanner(options.appStoreUrl, scheme), PLATFORM].filter(Boolean).join('\n'),
    style: ACCEPT_STYLE,
    bar: appBar(store),
    body: `<p class="lede">It’s a group chat, but voice. A channel is a place you drop
into: you arrive when it suits you, and whoever is there is there.</p>

${buttons}
<p class="ends"><a href="/privacy">Privacy</a> — what is stored, why, and for
how long.</p>
${fallback ? acceptScript({ scheme, remember: { key: MEMBER_INVITE_KEY, value: literal } }) : ''}
`,
  });
}

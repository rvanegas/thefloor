import { escapeHtml, page, socialCard } from './html';

/**
 * `/podcasts`: every channel that has declared itself public, in one list.
 *
 * **This is the page that changed what "public" means, and the change is the
 * whole of what is worth knowing here.** Until it existed, a public channel
 * was reachable only by its address — an unguessable id, handed to people the
 * way a guest link is — and the app said so in those words. A list of them is
 * the difference between unlisted and findable, and it applies to channels
 * that turned the switch on under the older wording. That was decided at the
 * prompt rather than assumed: see
 * `decisions/2026-09-22-a-public-channel-is-findable-rather-than-unlisted.md`.
 * The copy in the app and on `/privacy` was corrected in the same commit, and
 * **anything that widens this audience again has the same obligation.**
 *
 * **Every public channel, including one with nothing on it.** A channel that
 * has published no recording is still a real public channel, and the row says
 * so in the line where the others carry a count, so nobody follows it
 * expecting something to listen to. This is deliberately *not* the rule the
 * page and the feed apply to an individual episode, where a row with a dead
 * player is hidden until its transcode lands: an episode that is not there
 * yet is a broken promise, and an empty channel is a true statement about a
 * channel that exists.
 *
 * **No member is named, here as on a channel's own page.** Everything a
 * stranger reads on this list is a name and a description that members wrote
 * themselves. A future editor adding "3 people" to a row would be undoing a
 * decision rather than filling in a blank — see public-page.ts, which carries
 * the same warning for the same reason.
 *
 * Like every other document this server serves, it carries no script.
 */
export function podcastDirectoryPage(directory: {
  channels: Array<{
    id: string;
    name: string;
    description: string | null;
    /** Absolute address of the cover art, or undefined when there is none. */
    imageUrl?: string;
    /** How many recordings are listenable on it right now. */
    episodes: number;
    /** When the most recent of those happened, or null when there are none. */
    latest: number | null;
  }>;
  /** Where to write about something on this page. */
  contactEmail?: string;
  origin?: string;
}): string {
  const { channels } = directory;

  const body = channels.length
    ? `<ul class="channels">\n${channels.map(channelRow).join('\n')}\n</ul>`
    : `<p class="empty">No channel has a public page yet. When one does, it
will be here.</p>`;

  const contact = directory.contactEmail
    ? `<p class="takedown">Something here that should not be?
Write to <a href="mailto:${escapeHtml(
        directory.contactEmail
      )}">${escapeHtml(directory.contactEmail)}</a>. It is read by a person.</p>`
    : '';

  return page({
    title: 'Published conversations — The Floor',
    heading: 'Published conversations',
    standfirst: `${channels.length} ${
      channels.length === 1 ? 'channel' : 'channels'
    } with a public page`,
    social: socialCard(directory.origin, {
      title: 'Published conversations — The Floor',
      description:
        'Channels on The Floor that have made their recordings public. ' +
        'Everybody in a conversation had to agree before it could appear.',
      path: '/podcasts',
    }),
    style: PAGE_STYLE,
    body: `<p class="blurb">These are channels that chose to have a public
page. Every recording on one is there because <em>everybody</em> who spoke in
it agreed to publish it, and any one of them can take it down again.</p>
${body}
${contact}
<p class="colophon">Recorded on <a href="/">The Floor</a>, where one person
speaks at a time.</p>`,
  });
}

function channelRow(channel: {
  id: string;
  name: string;
  description: string | null;
  imageUrl?: string;
  episodes: number;
  latest: number | null;
}): string {
  // Alt is empty rather than the channel's name: the name is the link text
  // immediately beside it, and a screen reader that announced both would read
  // the same words twice. public-page.ts names the channel in its alt because
  // there the cover stands alone above the heading.
  const cover = channel.imageUrl
    ? `<img class="thumb" src="${escapeHtml(
        channel.imageUrl
      )}" alt="" width="96" height="96" loading="lazy">`
    : `<span class="thumb blank" aria-hidden="true"></span>`;

  const blurb = channel.description
    ? `<p class="blurb">${escapeHtml(summarise(channel.description))}</p>`
    : '';

  return `<li>
<a class="row" href="/c/${escapeHtml(channel.id)}">
${cover}
<span class="about">
<span class="name">${escapeHtml(channel.name)}</span>
<span class="count">${escapeHtml(countLine(channel))}</span>
</span>
</a>
${blurb}
</li>`;
}

/**
 * What a row says it holds.
 *
 * The date is the most recent conversation rather than when it was published,
 * which is the choice the page and the feed's `pubDate` both already make: a
 * conversation from last year that was published this morning happened last
 * year.
 */
function countLine(channel: { episodes: number; latest: number | null }): string {
  if (!channel.episodes || channel.latest === null) {
    return 'Nothing published yet';
  }
  const count =
    channel.episodes === 1 ? '1 recording' : `${channel.episodes} recordings`;
  return `${count} · latest ${shortDate(channel.latest)}`;
}

/**
 * A description, cut to what a list can carry.
 *
 * Cut at a word and marked with an ellipsis, so that a reader can tell a
 * description that ended from one that was trimmed — and the channel's own
 * page carries it in full, which is where the link goes.
 */
function summarise(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 160);
  const space = cut.lastIndexOf(' ');
  return `${(space > 100 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, '')}…`;
}

/** UTC, for the same reason public-page.ts uses it: there is no reader here. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

/** Additive, as `page`'s `style` requires. */
const PAGE_STYLE = `
  .channels { list-style: none; padding-left: 0; }
  .channels li { margin: 1.75rem 0; }
  .row {
    display: flex; gap: 0.9rem; align-items: center;
    text-decoration: none; color: inherit;
  }
  .row:hover .name { text-decoration: underline; }
  .thumb {
    flex: none; width: 4rem; height: 4rem;
    border-radius: 0.4rem; object-fit: cover;
  }
  /*
     A channel with no cover still occupies the square, so the names in a
     list stay on one left edge. The grey is a mid tone rather than a light
     one because this page follows the reader's colour scheme, and a #d1d5db
     placeholder is a glowing white tile on a dark background — the same trap
     the .blurb colour below avoids by not setting one.
  */
  .thumb.blank { background: #9ca3af; }
  .about { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .name { font-size: 1.05rem; font-weight: 600; }
  .count { color: #6b7280; font-size: 0.9rem; }
  /* Indented under the name — the thumb's 4rem plus the row's 0.9rem gap —
     and flush left on a narrow phone, where that indent costs a third of the
     line. No colour: this page follows the reader's scheme, so anything but
     the inherited one is a guess about the background. */
  .channels .blurb { margin: 0.6rem 0 0 4.9rem; font-size: 0.95rem; }
  @media (max-width: 26rem) { .channels .blurb { margin-left: 0; } }
  .empty, .takedown, .colophon { color: #6b7280; font-size: 0.9rem; }
  .colophon { margin-top: 3rem; }
`;

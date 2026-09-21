import { escapeHtml, page, socialCard } from './html';

/**
 * A public channel's page: the thing the task actually asks for, where
 * anyone can listen to selected recordings.
 *
 * **A document, like the privacy and support pages, and not an interface.**
 * It is served by the server it describes so that it deploys with the code
 * and cannot drift from it, and it carries no script: an `<audio>` element
 * with `preload="none"` is the whole player. That is not minimalism for its
 * own sake — the episodes are served from this box, and a page that
 * autoloaded five of them would start five ranged reads of a megabyte each
 * on every visit, beside live audio, on two vCPUs.
 *
 * **What is deliberately not on it.** No member is named, anywhere. The task
 * entry says members remain private though they may be explicitly described
 * in the description, and that is exactly what is implemented: the only
 * words about who these people are are the words they wrote themselves.
 * Neither the roster nor a participant count nor an avatar appears, and a
 * future editor adding "with Ana and Bo" to a heading would be undoing a
 * decision rather than improving a page.
 *
 * **The takedown line is load-bearing rather than boilerplate.** See
 * publication.ts on what publishing reopens: this is the address that makes
 * "responsibility follows knowledge" a posture somebody can actually act on
 * rather than a sentence in a decision file.
 */
export function publicChannelPage(channel: {
  id: string;
  name: string;
  description: string | null;
  episodes: Array<{
    id: string;
    title: string;
    startedAt: number;
    durationMs: number;
    audioUrl: string;
    /** Absent when the transcode has not landed, or failed. */
    ready: boolean;
  }>;
  feedUrl: string;
  /** Where to write about something on this page. */
  contactEmail?: string;
  origin?: string;
}): string {
  const ready = channel.episodes.filter((episode) => episode.ready);

  const description = channel.description
    ? `<p class="blurb">${escapeHtml(channel.description)}</p>`
    : '';

  // Only episodes whose audio exists are listed. A published recording whose
  // transcode is still running is genuinely not listenable yet, and a row
  // with a dead player is worse than a row that is not there — a visitor
  // cannot tell a pending encode from a broken site, and the page is the
  // same page a minute later.
  const list = ready.length
    ? `<ol class="episodes">\n${ready.map(episodeRow).join('\n')}\n</ol>`
    : `<p class="empty">Nothing has been published here yet.</p>`;

  const contact = channel.contactEmail
    ? `<p class="takedown">Something here that should not be?
Write to <a href="mailto:${escapeHtml(channel.contactEmail)}">${escapeHtml(
        channel.contactEmail
      )}</a>. It is read by a person.</p>`
    : '';

  return page({
    title: `${channel.name} — The Floor`,
    heading: channel.name,
    standfirst: `${ready.length} ${ready.length === 1 ? 'recording' : 'recordings'}`,
    // The channel's own name and description, which is what a reader of a
    // pasted link wants to see — and the only two things on this page that
    // came from a person. The shared card image is the site's, as it is
    // everywhere else: see OG_IMAGE.
    social: socialCard(channel.origin, {
      title: channel.name,
      description:
        channel.description ?? 'Recorded conversations, published in full.',
      path: `/c/${channel.id}`,
    }),
    style: PAGE_STYLE,
    body: `${description}
${list}
<p class="feed"><a href="${escapeHtml(channel.feedUrl)}">Subscribe in a podcast app</a>
— paste this address into one: <code>${escapeHtml(channel.feedUrl)}</code></p>
${contact}
<p class="colophon">Recorded on <a href="/">The Floor</a>, where one person
speaks at a time. Everybody in a conversation had to agree before it could
appear here.</p>`,
  });
}

function episodeRow(episode: {
  id: string;
  title: string;
  startedAt: number;
  durationMs: number;
  audioUrl: string;
}): string {
  return `<li>
<h2>${escapeHtml(episode.title)}</h2>
<p class="when">${escapeHtml(longDate(episode.startedAt))} · ${escapeHtml(
    spoken(episode.durationMs)
  )}</p>
<!-- preload="none" on purpose: these bytes come off this box, beside live
     audio. A visitor who wants one presses play. -->
<audio controls preload="none" src="${escapeHtml(episode.audioUrl)}"></audio>
</li>`;
}

/**
 * The date a conversation happened, in words.
 *
 * `started_at`, never the publish time — the same choice the feed's
 * `pubDate` makes and for the same reason. A conversation from last year
 * that was published this morning happened last year, and a page that says
 * otherwise is lying about the only fact it carries.
 *
 * UTC rather than a locale, because the server has no idea where the reader
 * is and a date that shifts by a day depending on who is looking is worse
 * than one that is consistently the recording's own.
 */
function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** A duration as somebody would say it, rather than as a clock shows it. */
function spoken(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/**
 * Additive, as `page`'s `style` requires. Nothing here overrides `body` or
 * `h1` — a caller that did would have reimplemented the shared chrome
 * through the back door.
 */
const PAGE_STYLE = `
  .blurb { white-space: pre-wrap; }
  .episodes { list-style: none; padding-left: 0; }
  .episodes li { margin: 2rem 0; }
  .episodes h2 { margin: 0 0 0.15rem; font-size: 1.05rem; }
  .when { color: #6b7280; margin: 0 0 0.5rem; font-size: 0.9rem; }
  audio { width: 100%; }
  .empty, .feed, .takedown, .colophon { color: #6b7280; font-size: 0.9rem; }
  .feed code { word-break: break-all; }
  .colophon { margin-top: 3rem; }
`;

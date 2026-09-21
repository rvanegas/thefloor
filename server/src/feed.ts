/**
 * A public channel's recordings as an RSS feed.
 *
 * **The machine-readable half of the same publication the page is.** The task
 * asks for a page anyone can listen on; a feed is not that page, it is what a
 * podcast client subscribes to, and the page is what its `<link>` points at.
 * They ship together because a feed whose link points at nothing cannot be
 * checked by a human, and because everything the feed needs — the public
 * flag, the selection, the name, the description — the page needs too.
 *
 * **This is the unlisted half of the fork in PODCAST.md**, built first and
 * deliberately. The URL carries the channel id, which is 72 random bits, so
 * it is shared the way a guest link is shared: by being handed to somebody.
 * That defers artwork, `itunes:category`, `itunes:author` and submission to
 * anybody's directory — all of which add review cycles rather than
 * capability, and none of which a subscriber needs to hear an episode. What
 * it does not defer is the consent model, which is the same one a listed
 * podcast would need and is in publication.ts.
 *
 * **Nothing here decides who may listen.** The route has already established
 * that the channel is public; this renders what it is handed.
 */

/** What one episode is, once the route has assembled it. */
export interface FeedEpisode {
  id: string;
  title: string;
  /** Milliseconds since the epoch — `started_at`, not the publish time. */
  startedAt: number;
  durationMs: number;
  /** Absolute. The route builds it from its own origin. */
  enclosureUrl: string;
  contentType: string;
  /**
   * How long the enclosure is, in bytes.
   *
   * Required by Apple and by every validator, and a `0` here is not a
   * harmless placeholder — several clients read it as an empty file and
   * refuse to download. The route only offers an episode whose transcode has
   * landed, so this is always a real number by the time it is rendered.
   */
  byteLength: number;
  /** Absolute, or absent when this recording has no transcript. */
  transcriptUrl?: string;
}

export interface FeedChannel {
  id: string;
  title: string;
  description: string;
  /** RFC 5646, or null when nobody has declared one. */
  language: string | null;
  /** Null when nobody has declared either way. */
  explicit: boolean | null;
}

/**
 * Renders the feed.
 *
 * `selfUrl` and `pageUrl` are absolute and passed in rather than derived,
 * because `<atom:link rel="self">` is required by every validator and by
 * Apple and must be an absolute URL — which means this needs to know its own
 * public origin rather than inferring it from a `Host` header.
 */
export function renderFeed(
  channel: FeedChannel,
  episodes: FeedEpisode[],
  urls: { selfUrl: string; pageUrl: string }
): string {
  const items = episodes.map((episode) => renderItem(episode)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
<title>${escapeXml(channel.title)}</title>
<link>${escapeXml(urls.pageUrl)}</link>
<atom:link href="${escapeXml(urls.selfUrl)}" rel="self" type="application/rss+xml"/>
<description>${escapeXml(channel.description)}</description>
<language>${escapeXml(channel.language ?? DEFAULT_LANGUAGE)}</language>
<itunes:explicit>${channel.explicit ? 'true' : 'false'}</itunes:explicit>
<generator>The Floor</generator>
${items}
</channel>
</rss>
`;
}

/**
 * The language a feed claims when nobody has declared one.
 *
 * A declaration rather than a detection, and a default rather than an
 * omission: `<language>` is required, and guessing from the audio would be
 * manufacturing a claim about somebody's own channel that this server has no
 * business making. Members who care set it; the rest get the one the app is
 * written in.
 */
const DEFAULT_LANGUAGE = 'en';

function renderItem(episode: FeedEpisode): string {
  return `<item>
<title>${escapeXml(episode.title)}</title>
<!-- Never a permalink: the id is a primary key, and a feed requires a guid
     that never changes. This one cannot. -->
<guid isPermaLink="false">${escapeXml(episode.id)}</guid>
<pubDate>${rfc2822(episode.startedAt)}</pubDate>
<enclosure url="${escapeXml(episode.enclosureUrl)}" type="${escapeXml(episode.contentType)}" length="${episode.byteLength}"/>
<itunes:duration>${hms(episode.durationMs)}</itunes:duration>${
    episode.transcriptUrl
      ? `\n<podcast:transcript url="${escapeXml(episode.transcriptUrl)}" type="text/vtt"/>`
      : ''
  }
</item>`;
}

/**
 * `pubDate` is `started_at`, and this is the one date decision in the feed
 * worth arguing.
 *
 * Backfilling a year of conversations should land them where they happened.
 * Clients sort on this, so publishing in a batch with the publish time would
 * present a decade of conversation as today's news in arbitrary order — and
 * `started_at` also makes the feed's own order stable under republication.
 *
 * RFC 2822 by hand rather than by `toUTCString`, which is nearly the same
 * string and not the same: it renders `GMT` where RSS wants `+0000`, and
 * several validators complain.
 */
export function rfc2822(ms: number): string {
  const date = new Date(ms);
  const day = DAYS[date.getUTCDay()];
  const month = MONTHS[date.getUTCMonth()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${day}, ${pad(date.getUTCDate())} ${month} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `H:MM:SS`, which is what `itunes:duration` is read as. */
export function hms(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Escapes a value interpolated into the feed.
 *
 * Its own function rather than `escapeHtml` from html.ts, and the difference
 * is real: XML requires `&apos;` where HTML does not care, and an
 * apostrophe inside an attribute is exactly what a channel called "Nick's
 * kitchen" produces. Sharing the HTML one would have worked until the first
 * such name and then produced a feed no client could parse.
 *
 * `channels.description` has been plain text since 2026-09-13, so escaping
 * it is the whole of what a `<description>` needs — no rendering step, and
 * so no way for the feed and the page to disagree about one.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters are not representable in XML 1.0 at all, and one
    // arriving in a name somebody typed would make the whole feed
    // unparseable rather than showing as a stray glyph. Dropped rather than
    // escaped, and tested by codepoint rather than written as a character
    // class: a literal range of control characters in a source file is
    // invisible to every reader and survives exactly one careless edit.
    .replace(/[\s\S]/gu, (character) => {
      const code = character.codePointAt(0) ?? 0;
      const legal =
        code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20;
      return legal ? character : '';
    });
}

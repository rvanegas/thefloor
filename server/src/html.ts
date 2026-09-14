/**
 * The little that the served pages have in common.
 *
 * There are four: the privacy policy and the support page, which exist because
 * App Store Connect will not accept a submission without a URL for them; the
 * landing page; and the invitation a link opens. None is an interface — they
 * are documents, served by the server they describe so that they deploy with
 * the code and cannot drift from it. (`/open` and the guest page are not among
 * them: those are doors into the app rather than documents, and each carries
 * its own chrome for that reason.)
 *
 * What is shared is the escaping and the chrome, and nothing else. The prose is
 * the point of each page and belongs in the file that is about that page.
 */

/**
 * Escapes a value interpolated into a page.
 *
 * Both pages interpolate exactly one thing — a contact address from this
 * server's own configuration rather than from a user — so this is belt and
 * braces. It is shared anyway, because two copies of an escaping function is
 * how one of them comes to be missing a case the other has.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The one image every card points at, and the helper that addresses it.
 *
 * **One card for the whole site rather than one per page**, deliberately. The
 * pages differ in their title and description, which is what a reader of a
 * pasted link actually reads; a bespoke image each would be four more things
 * to keep true as the app changes, for a difference nobody looking at a chat
 * preview would notice.
 *
 * **The filename is not hashed and the route caches for a week**, exactly as
 * the screenshots do — so if this image is ever redrawn, rename it. A stale
 * card is worse here than on the page itself, because Telegram, Slack and the
 * rest cache previews for a long time and several never re-fetch at all.
 */
export const OG_IMAGE = '/assets/og.png';

/**
 * Builds a page's link preview against the origin the request arrived on.
 *
 * **Absent rather than relative when there is no origin.** A crawler resolves
 * nothing, so a relative `og:image` is silently ignored and a relative
 * `og:url` is worse than absent — the same graceful-absence rule the App Store
 * link and the browser link already follow. Tests call the page functions with
 * no origin and get a page with no card, which is correct rather than broken.
 */
export function socialCard(
  origin: string | undefined,
  card: {
    title: string;
    description: string;
    /**
     * The canonical address, appended to the origin — and **omitted on a page
     * whose own address carries a secret.**
     *
     * The invite link holds a live pin and the guest link holds a token.
     * Naming either in `og:url` would put it into the preview caches of every
     * service the link is pasted through, which is the same leak the invite
     * page's `referrer` policy already exists to prevent. Naming `/` instead
     * is worse rather than safer: `og:url` is a canonicalisation hint, and a
     * client that honours it points the preview at the landing page — dropping
     * the pin, and the invitation with it.
     *
     * Absent, clients use the address that was actually pasted, which is right.
     */
    path?: string;
    imageAlt?: string;
  }
): { title: string; description: string; image?: string; url?: string; imageAlt?: string } {
  if (!origin) return { title: card.title, description: card.description };
  return {
    title: card.title,
    description: card.description,
    image: `${origin}${OG_IMAGE}`,
    ...(card.path ? { url: `${origin}${card.path}` } : {}),
    imageAlt: card.imageAlt,
  };
}

/**
 * The card's tags, as a block of `<meta>`.
 *
 * Extracted from `page()` on 2026-09-14 because the guest page carries its own
 * chrome and needs the same tags — and two copies of this list is precisely
 * how one of them comes to be missing a tag the other has, which is the
 * argument `escapeHtml` above is already shared on.
 *
 * **Order matters to exactly one consumer and it is cheap to satisfy.**
 * Several crawlers stop reading at the first few kilobytes of `<head>`, so
 * callers put this before their stylesheet rather than after it.
 */
export function socialTags(social: {
  title: string;
  description: string;
  image?: string;
  url?: string;
  imageAlt?: string;
}): string {
  return [
    `<meta name="description" content="${escapeHtml(social.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="The Floor">`,
    `<meta property="og:title" content="${escapeHtml(social.title)}">`,
    `<meta property="og:description" content="${escapeHtml(social.description)}">`,
    ...(social.url
      ? [`<meta property="og:url" content="${escapeHtml(social.url)}">`]
      : []),
    ...(social.image
      ? [
          `<meta property="og:image" content="${escapeHtml(social.image)}">`,
          // Telegram and Slack both draw a *large* card only when they know the
          // dimensions without fetching the file first. Omitting these is how a
          // 1200x630 card renders as a thumbnail beside the text.
          `<meta property="og:image:width" content="1200">`,
          `<meta property="og:image:height" content="630">`,
          `<meta property="og:image:type" content="image/png">`,
          `<meta property="og:image:alt" content="${escapeHtml(social.imageAlt ?? social.title)}">`,
          `<meta name="twitter:card" content="summary_large_image">`,
        ]
      : [`<meta name="twitter:card" content="summary">`]),
  ].join('\n');
}

/**
 * Wraps a document body in the page both pages are.
 *
 * `color-scheme` is the whole of the dark-mode support: it tells the browser to
 * use its own dark palette for the default colours, which is right for a page
 * that is text and nothing else. The app's theme has no business here — these
 * are read in Safari, by people who may not have installed anything.
 */
export function page(options: {
  title: string;
  heading: string;
  /**
   * What the browser may paint this page in. `light dark` — the default and
   * what three of the four pages want — lets it follow the reader's setting.
   *
   * **`light` is for a page carrying images that are themselves light**, which
   * since 2026-09-14 is the landing page and nothing else. A screenshot does
   * not have a dark variant unless somebody captures one, so a page that goes
   * dark around it turns two screenshots into two glowing rectangles. Pinning
   * the page is the cheaper half of that trade and was chosen at the prompt;
   * the other half is capturing a dark set, which nobody has done.
   *
   * **So this is a marker as much as a setting.** If dark captures ever land,
   * this argument is why the value is here rather than why it has to stay.
   */
  colorScheme?: 'light dark' | 'light';
  /**
   * The link preview: what Telegram, Slack, iMessage and the rest draw when
   * this address is pasted into a conversation.
   *
   * **This is not decoration on a funnel that starts elsewhere.** The two
   * addresses this server mints for a person to hand to another person — the
   * invite link and the guest link — travel by being pasted into whatever
   * thread the group already uses, and planning/MARKETING.md argues those, not
   * the store listing, are the top of the funnel. Until 2026-09-14 every one
   * of them unfurled as a bare grey rectangle.
   *
   * **`url` and `image` must be absolute**, which is the whole reason this is
   * a parameter rather than a constant: a crawler has no page to resolve a
   * relative path against. Routes build them from `origin(request)`, derived
   * from the request that arrived rather than configured — see the comment on
   * that function for why a second setting naming an address the server
   * already knows is the one nobody remembers to set.
   *
   * **Omit it for a page that should not have a card at all.** `/open` is a
   * door rather than a document; a preview of it says nothing and invites
   * somebody to paste the wrong address.
   */
  social?: {
    title: string;
    description: string;
    /** Absolute. Omitted rather than relative — a relative one silently fails. */
    image?: string;
    /** Absolute, and the address the card should point at. */
    url?: string;
    /** What the image shows, for a reader who cannot see it. */
    imageAlt?: string;
  };
  /** The line under the heading — a date, or what the page is for. */
  standfirst: string;
  body: string;
  /**
   * Extra CSS for a page that is not purely a document, appended to the rules
   * below rather than replacing them.
   *
   * **Added 2026-09-14, for the landing page and for nothing else so far.**
   * The other three pages here are documents and the shared chrome is the
   * whole of what they want. `/` is not a document — it is the page a stranger
   * who has never heard of this lands on, and a wall of undifferentiated
   * paragraphs is the wrong thing to hand them. The alternative was giving
   * landing.ts its own chrome, as `/open` and the guest page have; that was
   * rejected because it would fork the viewport meta and the `color-scheme`
   * line, which is exactly the drift this module exists to prevent.
   *
   * **Keep whatever goes through here additive.** A caller that overrides
   * `body` or `h1` has reimplemented the chrome through the back door and
   * should be having the other argument instead.
   */
  style?: string;
  /**
   * Anything else this page needs in `<head>`, verbatim.
   *
   * Deliberately narrow: it exists because a page can have a rule about the
   * *request* rather than about its own text, and there is nowhere else for
   * one to go. The invitation's `referrer` policy is the case — its address
   * carries a pin, and a click to the App Store would otherwise send it along
   * as the referrer. Nothing interpolated by a caller reaches it.
   */
  head?: string;
}): string {
  const social = options.social ? socialTags(options.social) : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${social}
${options.head ?? ''}
<title>${escapeHtml(options.title)}</title>
<style>
  :root { color-scheme: ${options.colorScheme ?? 'light dark'}; }
  body {
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 38rem; margin: 0 auto; padding: 2rem 1.25rem 4rem;
  }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .updated { color: #6b7280; margin-top: 0; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.4rem 0; }
${options.style ?? ''}
</style>
</head>
<body>

<h1>${escapeHtml(options.heading)}</h1>
<p class="updated">${escapeHtml(options.standfirst)}</p>
${options.body}
</body>
</html>
`;
}

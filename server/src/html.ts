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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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

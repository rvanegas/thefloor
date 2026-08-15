/**
 * The little that two served pages have in common.
 *
 * There are exactly two — the privacy policy and the support page — and both
 * exist because App Store Connect will not accept a submission without a URL
 * for them. Neither is an interface: they are documents, served by the server
 * they describe so that they deploy with the code and cannot drift from it.
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
 * `color-scheme: light dark` is the whole of the dark-mode support: it tells the
 * browser to use its own dark palette for the default colours, which is right
 * for a page that is text and nothing else. The app's theme has no business
 * here — these are read in Safari, by people who may not have installed
 * anything.
 */
export function page(options: {
  title: string;
  heading: string;
  /** The line under the heading — a date, or what the page is for. */
  standfirst: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 38rem; margin: 0 auto; padding: 2rem 1.25rem 4rem;
  }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .updated { color: #6b7280; margin-top: 0; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.4rem 0; }
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

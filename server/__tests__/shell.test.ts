import { withInstallTags } from '../src/shell';

/**
 * The tags the export cannot write, and the prefix that is the whole reason
 * the server writes them.
 *
 * One bundle is served at `/app` and at `/beta`, so the manifest link is the
 * one thing in that head that differs between the two — and the shell is
 * returned for every route the app has, which is what rules out a relative
 * href and makes this worth a test at all.
 */

const shell = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '  <head>',
  '    <title>The Floor</title>',
  '  <link rel="icon" href="/favicon.ico" /></head>',
  '  <body><div id="root"></div></body>',
  '</html>',
].join('\n');

describe('the install tags', () => {
  it('points each train at its own manifest, absolutely', () => {
    expect(withInstallTags(shell, '/app')).toContain(
      '<link rel="manifest" href="/app/manifest.json" />'
    );
    expect(withInstallTags(shell, '/beta')).toContain(
      '<link rel="manifest" href="/beta/manifest.json" />'
    );
  });

  it('carries the tag that makes an iOS home-screen icon open standalone', () => {
    // Without this the icon opens in Safari, `display-mode` never says
    // standalone, and the checklist rung can never go away. See shell.ts.
    expect(withInstallTags(shell, '/app')).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes" />'
    );
  });

  it('puts them inside the head, before it closes', () => {
    const html = withInstallTags(shell, '/app');
    expect(html.indexOf('rel="manifest"')).toBeLessThan(
      html.indexOf('</head>')
    );
    expect(html).toContain('<div id="root"></div>');
  });

  it('serves a shell it does not recognise untouched rather than failing', () => {
    // A bundle built by something other than the Expo export. A missing
    // manifest is cosmetic; refusing to serve the app over it would not be.
    const odd = '<html><body>no head here</body></html>';
    expect(withInstallTags(odd, '/app')).toBe(odd);
  });
});

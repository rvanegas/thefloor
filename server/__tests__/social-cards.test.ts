/**
 * The link previews: what Telegram, Slack and iMessage draw when one of this
 * server's addresses is pasted into a conversation.
 *
 * **Worth a test file of its own because the invariants here are invisible.**
 * Nothing on any page changes when a card is wrong — the failure happens in
 * somebody else's chat client, hours later, and is cached there afterwards.
 * Two of these assertions pin decisions rather than mechanics, and both are
 * the kind a later reader would otherwise "tidy" into a bug:
 *
 * - **The invite card names nobody**, though the page it sits on names the
 *   inviter in its heading and its `<title>`. A preview is read by everybody
 *   in the thread the link was pasted into; the page is read by whoever
 *   clicked. See the CARD comment in invite.ts.
 * - **The invite and guest cards carry no `og:url`**, because their addresses
 *   hold a live pin and a link token. See the `path` comment in html.ts.
 */

import { buildApp, type App } from '../src/app';
import { landingPage } from '../src/landing';
import { invitePage } from '../src/invite';
import { supportPage } from '../src/support';
import { privacyPage } from '../src/privacy';
import { deletionPage } from '../src/deletion';

const ORIGIN = 'https://example.test';

const meta = (html: string, property: string): string | undefined =>
  new RegExp(`<meta property="${property}" content="([^"]*)">`).exec(html)?.[1];

describe('the card every page carries', () => {
  const pages: [string, string, string][] = [
    ['landing', landingPage({ webAppReady: true, origin: ORIGIN }), '/'],
    ['support', supportPage('a@b.test', ORIGIN), '/support'],
    ['privacy', privacyPage({ origin: ORIGIN }), '/privacy'],
    ['deletion', deletionPage({ origin: ORIGIN }), '/delete-account'],
  ];

  it.each(pages)('%s names itself and points at the image', (_name, html, path) => {
    expect(meta(html, 'og:title')).toBeTruthy();
    expect(meta(html, 'og:description')).toBeTruthy();
    expect(meta(html, 'og:image')).toBe(`${ORIGIN}/assets/og.png`);
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}${path}`);
  });

  it.each(pages)('%s declares the image size, or the card renders small', (_n, html) => {
    // Telegram and Slack draw a large card only when the dimensions are known
    // without fetching the file. Omitting these is how a 1200x630 card turns
    // into a thumbnail beside the text.
    expect(meta(html, 'og:image:width')).toBe('1200');
    expect(meta(html, 'og:image:height')).toBe('630');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('is absent entirely when the origin is not known', () => {
    // A relative og:image is silently ignored by every crawler, so the honest
    // answer is no image rather than one that cannot be resolved.
    const html = landingPage({ webAppReady: true });
    expect(meta(html, 'og:image')).toBeUndefined();
    expect(meta(html, 'og:url')).toBeUndefined();
    expect(meta(html, 'og:title')).toBe('The Floor');
  });
});

describe('the invite card, which is the one with something to protect', () => {
  const NAME = 'Beth Frankish';
  const live = invitePage({
    username: 'beth',
    pin: 'abc123',
    displayName: NAME,
    webAppReady: true,
    origin: ORIGIN,
  });
  const refused = invitePage({
    username: 'beth',
    pin: 'abc123',
    refusal: 'used',
    webAppReady: true,
    origin: ORIGIN,
  });

  it('names nobody, though the page around it does', () => {
    expect(meta(live, 'og:title')).not.toContain(NAME);
    expect(meta(live, 'og:description')).not.toContain(NAME);
    expect(meta(live, 'og:image:alt')).not.toContain(NAME);
    // The page itself still makes the disclosure — that is the whole point of
    // the distinction, and a change that removed it would be a different bug.
    expect(live).toContain(NAME);
  });

  it('is the same card whether the pin was live or spent', () => {
    // A crawler's fetch and a person's click are different moments, and a
    // preview announcing a refusal the reader will not meet is worse than one
    // that simply says what the address is for.
    expect(meta(refused, 'og:title')).toBe(meta(live, 'og:title'));
    expect(meta(refused, 'og:description')).toBe(meta(live, 'og:description'));
  });

  it('carries no og:url, because the address holds a live pin', () => {
    // Echoing it would put the pin into the preview caches of every service
    // the link is pasted through — the leak REFERRER already guards against.
    // And naming "/" instead would be worse: a client honouring og:url as
    // canonical would point the preview at the landing page, losing the pin.
    expect(meta(live, 'og:url')).toBeUndefined();
    expect(meta(refused, 'og:url')).toBeUndefined();
    expect(live).not.toContain('abc123"');
    expect(meta(live, 'og:image')).toBe(`${ORIGIN}/assets/og.png`);
  });
});

describe('the guest page, which carries its own chrome', () => {
  let app: App;

  beforeEach(() => {
    app = buildApp({ dbPath: ':memory:', now: () => 1_700_000_000_000 });
  });

  afterEach(async () => {
    app.channels.stop();
    await app.fastify.close();
  });

  const get = (url: string) =>
    app.fastify.inject({ method: 'GET', url, headers: { host: 'example.test' } });

  it('names neither the channel nor the token', async () => {
    const page = await get('/g/sometokenvalue123');
    expect(page.statusCode).toBe(200);
    expect(meta(page.body, 'og:title')).toBe('Join a conversation on The Floor');
    // A guest link is handed out while a conversation is happening. A card
    // naming the room would put that in the thread for good — and the token
    // in og:url would put it in every preview cache the link passes through.
    expect(meta(page.body, 'og:url')).toBeUndefined();
    expect(meta(page.body, 'og:description')).not.toContain('sometokenvalue123');
    expect(meta(page.body, 'og:image')).toBe('http://example.test/assets/og.png');
  });

  it('leaves no placeholder behind on the seat route', async () => {
    // Reached rather than addressed, so it gets no card — but the comment the
    // card replaces must not ship either.
    const page = await get('/g/seat');
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain('<!--social-->');
    expect(meta(page.body, 'og:title')).toBeUndefined();
  });
});

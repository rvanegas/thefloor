import { joinOfUrl } from '../useJoinLink';
import { forgetJoin, peekJoin } from '../../ui/handover';

/**
 * The matcher that turns the community page's *Join* into a membership this
 * app can take up, and the browser road beside it.
 *
 * The case worth most is the one that keeps the two links apart: an invite
 * link must never be read as a join, since one makes a contact and the other
 * a member, and confusing them would do somebody the wrong thing.
 */
describe('joinOfUrl', () => {
  it('reads the code out of the link the community page writes', () => {
    expect(joinOfUrl('thefloor://j/cafe-products-k3x9abcd')).toEqual({
      code: 'cafe-products-k3x9abcd',
    });
  });

  it('reads the community link itself, which iOS hands over as a universal link', () => {
    expect(joinOfUrl('https://thefloor.rvanegas.co/j/cafe-products-k3x9abcd')).toEqual({
      code: 'cafe-products-k3x9abcd',
    });
  });

  it('is not an invite link, and an invite link is not it', () => {
    expect(joinOfUrl('thefloor://i/annak')).toBeNull();
    expect(joinOfUrl('https://thefloor.rvanegas.co/i/annak')).toBeNull();
  });

  it('ignores a query and a fragment, and refuses what it did not write', () => {
    expect(joinOfUrl('thefloor://j/abc?x=1#y')).toEqual({ code: 'abc' });
    expect(joinOfUrl('https://thefloor.rvanegas.co/j/abc?x=1')).toEqual({ code: 'abc' });
    // The web app's own address, which `getInitialURL` answers on web: a
    // train path is never a join, whatever follows it.
    expect(joinOfUrl('https://thefloor.rvanegas.co/beta/j/abc')).toBeNull();
    expect(joinOfUrl('http://thefloor.rvanegas.co/j/abc')).toBeNull();
    expect(joinOfUrl('thefloor://j/')).toBeNull();
    expect(joinOfUrl('thefloor://j/%E0%A4%A')).toBeNull();
    expect(joinOfUrl(null)).toBeNull();
  });
});

describe('peekJoin', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterAll(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('keeps the code the page left until it is spent, so a sign-in can reload the tab', () => {
    store.set('thefloor.join', JSON.stringify({ code: 'cafe-products-k3x9abcd' }));
    expect(peekJoin()).toEqual({ code: 'cafe-products-k3x9abcd' });
    expect(peekJoin()).toEqual({ code: 'cafe-products-k3x9abcd' });
    forgetJoin();
    expect(peekJoin()).toBeNull();
  });

  it('answers null to anything else left there', () => {
    store.set('thefloor.join', '{"code":""}');
    expect(peekJoin()).toBeNull();
    store.set('thefloor.join', 'not json');
    expect(peekJoin()).toBeNull();
  });
});

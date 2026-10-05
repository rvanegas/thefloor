import { joinOfUrl } from '../useJoinLink';
import { takeJoin } from '../../ui/handover';

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

  it('is not an invite link, and an invite link is not it', () => {
    expect(joinOfUrl('thefloor://i/annak')).toBeNull();
  });

  it('ignores a query and a fragment, and refuses what it did not write', () => {
    expect(joinOfUrl('thefloor://j/abc?x=1#y')).toEqual({ code: 'abc' });
    expect(joinOfUrl('https://example.com/j/abc')).toBeNull();
    expect(joinOfUrl('thefloor://j/')).toBeNull();
    expect(joinOfUrl('thefloor://j/%E0%A4%A')).toBeNull();
    expect(joinOfUrl(null)).toBeNull();
  });
});

describe('takeJoin', () => {
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

  it('takes the code the page left, once', () => {
    store.set('thefloor.join', JSON.stringify({ code: 'cafe-products-k3x9abcd' }));
    expect(takeJoin()).toEqual({ code: 'cafe-products-k3x9abcd' });
    expect(takeJoin()).toBeNull();
  });

  it('answers null to anything else left there', () => {
    store.set('thefloor.join', '{"code":""}');
    expect(takeJoin()).toBeNull();
    store.set('thefloor.join', 'not json');
    expect(takeJoin()).toBeNull();
  });
});

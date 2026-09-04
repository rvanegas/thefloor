import { NO_DETAIL, type Detail, type List } from '../detail';
import {
  addressOf,
  addressOfPath,
  detailOfAddress,
  pathOf,
  type Address,
} from '../webRoute';

/**
 * The route table, which is the half of web navigation a test can reach.
 *
 * The wiring — `history.pushState`, `popstate`, the initial read — is a few
 * lines against browser globals that nothing here can drive. So the mapping is
 * pinned thoroughly and the plumbing is kept as thin as it can be, which is
 * the only division of the problem that leaves anything proven at all.
 */

const LISTS: List[] = ['channels', 'contacts'];

const ADDRESSES: Address[] = LISTS.flatMap((list) =>
  (['none', 'settings', 'standings', 'support'] as const).map((named) => ({
    list,
    named,
  }))
);

/** Every kind, so a case added to `Detail` and forgotten here is visible. */
const DETAILS: Detail[] = [
  NO_DETAIL,
  { kind: 'channel', channelId: 'chan_1' },
  { kind: 'profile', id: 'acct_1', name: 'Ada' },
  { kind: 'settings' },
  { kind: 'standings' },
  { kind: 'support' },
];

describe('addresses and their paths', () => {
  /**
   * The property the whole thing rests on. It is exact rather than
   * approximate because no address carries an id: there is nothing a path
   * could fail to give back.
   */
  it('round-trips every address through its path', () => {
    for (const address of ADDRESSES) {
      expect(addressOfPath(pathOf(address))).toEqual(address);
    }
  });

  it('gives every address a different path', () => {
    expect(new Set(ADDRESSES.map(pathOf)).size).toBe(ADDRESSES.length);
  });

  /**
   * The frame is the first segment even when something is open over it, which
   * is what the nesting is for: the tab you were on is not something opening
   * Settings should cost you.
   */
  it('hangs what is open off the frame it was opened over', () => {
    expect(pathOf({ list: 'channels', named: 'none' })).toBe('/channels');
    expect(pathOf({ list: 'contacts', named: 'none' })).toBe('/contacts');
    expect(pathOf({ list: 'channels', named: 'settings' })).toBe(
      '/channels/settings'
    );
    expect(pathOf({ list: 'contacts', named: 'settings' })).toBe(
      '/contacts/settings'
    );
  });

  it('never produces a query or an id', () => {
    for (const address of ADDRESSES) {
      expect(pathOf(address)).toMatch(/^(\/[a-z]+){1,2}$/);
    }
  });
});

describe('reading a path', () => {
  it('names each address', () => {
    expect(addressOfPath('/contacts/standings')).toEqual({
      list: 'contacts',
      named: 'standings',
    });
    expect(addressOfPath('/channels/support')).toEqual({
      list: 'channels',
      named: 'support',
    });
  });

  it('ignores a query string and a fragment', () => {
    expect(addressOfPath('/channels/settings?from=x')).toEqual({
      list: 'channels',
      named: 'settings',
    });
    expect(addressOfPath('/contacts#top')).toEqual({
      list: 'contacts',
      named: 'none',
    });
  });

  it('reads a trailing slash as the same place', () => {
    expect(addressOfPath('/channels/settings/')).toEqual({
      list: 'channels',
      named: 'settings',
    });
  });

  /**
   * The bare base is what every door forwards to — `/open`, the landing page,
   * the signed-in redirect — and it means the Channels tab. `pathOf` never
   * produces it, so this is an accepted input rather than half of a round trip.
   */
  it('reads the bare base as the channel list', () => {
    expect(addressOfPath('/')).toEqual({ list: 'channels', named: 'none' });
    expect(addressOfPath('')).toEqual({ list: 'channels', named: 'none' });
  });

  /**
   * Forgiving on purpose. This runs against whatever is in the address bar —
   * a truncated paste, a link from a build with different names, a path the
   * server's catch-all served the shell for — and a list is a correct and
   * useful answer to all of them. An error screen would not be.
   */
  it('falls back rather than failing', () => {
    expect(addressOfPath('/nonsense')).toEqual({
      list: 'channels',
      named: 'none',
    });
    // A known frame with an unknown thing over it keeps the frame.
    expect(addressOfPath('/contacts/nonsense')).toEqual({
      list: 'contacts',
      named: 'none',
    });
    expect(addressOfPath('/channels/settings/extra')).toEqual({
      list: 'channels',
      named: 'none',
    });
  });

  /**
   * What a channel's address was until 2026-09-04. It lands on the list, which
   * is where it would land even if it were parsed: nothing downstream can
   * restore the id, so there is nothing for a special case to buy.
   */
  it('lands an address from before the ids went on the list', () => {
    expect(addressOfPath('/c/chan_abc123')).toEqual({
      list: 'channels',
      named: 'none',
    });
  });

  it('never reads an id out of anything', () => {
    for (const path of [
      '/c/chan_abc123',
      '/channels/chan_abc123',
      '/contacts/acct_1',
      '/channels/settings/chan_1',
    ]) {
      expect(Object.keys(addressOfPath(path)).sort()).toEqual([
        'list',
        'named',
      ]);
      expect(pathOf(addressOfPath(path))).not.toContain('chan_');
      expect(pathOf(addressOfPath(path))).not.toContain('acct_');
    }
  });
});

describe('what an address can say about what is open', () => {
  it('keeps the frame whatever is open over it', () => {
    for (const detail of DETAILS) {
      for (const list of LISTS) {
        expect(addressOf(detail, list).list).toBe(list);
      }
    }
  });

  it('names the three screens that are one of a kind', () => {
    expect(addressOf({ kind: 'settings' }, 'contacts')).toEqual({
      list: 'contacts',
      named: 'settings',
    });
    expect(addressOf({ kind: 'standings' }, 'channels')).toEqual({
      list: 'channels',
      named: 'standings',
    });
  });

  /**
   * The one loss, and the whole of it: a channel and a profile would need an
   * id to be told apart, so an address says nothing about them — they read as
   * the tab they were opened over, which is what the other pane is showing.
   */
  it('says nothing about the two that would need an id', () => {
    expect(addressOf({ kind: 'channel', channelId: 'chan_1' }, 'channels')).toEqual(
      { list: 'channels', named: 'none' }
    );
    expect(
      addressOf({ kind: 'profile', id: 'acct_1', name: 'Ada' }, 'contacts')
    ).toEqual({ list: 'contacts', named: 'none' });
  });

  it('drops every id, from any state the app can be in', () => {
    for (const detail of DETAILS) {
      for (const list of LISTS) {
        const path = pathOf(addressOf(detail, list));
        expect(path).not.toContain('chan_1');
        expect(path).not.toContain('acct_1');
      }
    }
  });
});

describe('what an address restores', () => {
  /**
   * **Every address restores**, which is what the nesting bought and why no
   * part of the wiring has to normalise what it reads. The projection is lossy
   * on the way out and total on the way back, so an address is never something
   * the app can be handed and fail to honour.
   */
  it('round-trips every address through the state it names', () => {
    for (const address of ADDRESSES) {
      const { detail, list } = detailOfAddress(address);
      expect(addressOf(detail, list)).toEqual(address);
    }
  });

  /**
   * **Navigating never changes server state**, and this is where that is
   * decided rather than in the wiring: applying an address can only ever
   * produce a detail that talks to nobody. A channel is the one that would —
   * mounting `ChannelView` watches it, which opens a subscription — and no
   * address can name one.
   *
   * It was not always so. `applyNav` watched the channel an address named, and
   * `popstate` was one of its callers, so pressing Back subscribed you on the
   * server. Pinned here because an id creeping back into an address would
   * bring that with it, silently.
   */
  it('never restores anything that would talk to the server', () => {
    for (const address of ADDRESSES) {
      const { detail } = detailOfAddress(address);
      expect(detail.kind).not.toBe('channel');
      expect(detail.kind).not.toBe('profile');
    }
  });

  it('restores the frame an address was written from', () => {
    expect(detailOfAddress({ list: 'contacts', named: 'settings' })).toEqual({
      detail: { kind: 'settings' },
      list: 'contacts',
    });
    expect(detailOfAddress({ list: 'contacts', named: 'none' })).toEqual({
      detail: NO_DETAIL,
      list: 'contacts',
    });
  });
});

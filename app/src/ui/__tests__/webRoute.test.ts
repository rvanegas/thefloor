import {
  navOf,
  NOWHERE,
  pathOf,
  sameScreen,
  screenOf,
  screenOfPath,
  type Nav,
  type Screen,
} from '../webRoute';

/**
 * The route table, which is the half of web navigation a test can reach.
 *
 * The wiring — `history.pushState`, `popstate`, the initial read — is a few
 * lines against browser globals that nothing here can drive. So the mapping is
 * pinned thoroughly and the plumbing is kept as thin as it can be, which is
 * the only division of the problem that leaves anything proven at all.
 */

const SCREENS: Screen[] = [
  { kind: 'home' },
  { kind: 'channel', channelId: 'chan_abc123' },
  { kind: 'settings' },
  { kind: 'standings' },
  { kind: 'support' },
  { kind: 'contacts' },
];

describe('screens and the state that shows them', () => {
  /**
   * The property the whole thing rests on: an address becomes navigation state
   * and that state names the same address again. Anything that breaks this
   * makes the URL and the screen disagree, which is worse than having no URLs.
   */
  it('round-trips every screen through navigation state', () => {
    for (const screen of SCREENS) {
      expect(screenOf(navOf(screen))).toEqual(screen);
    }
  });

  it('round-trips every screen through its path', () => {
    for (const screen of SCREENS) {
      expect(screenOfPath(pathOf(screen))).toEqual(screen);
    }
  });

  it('shows Home when nothing is open', () => {
    expect(screenOf(NOWHERE)).toEqual({ kind: 'home' });
  });

  /**
   * `App.tsx` returns for the channel before it returns for anything else, so
   * a channel open behind Settings is still the channel. The precedence is the
   * renderer's, and this is where it is written down — if the early returns
   * are ever reordered, this fails rather than the URL quietly lying.
   */
  it('puts a channel ahead of every screen opened over Home', () => {
    const nav: Nav = {
      channelId: 'chan_abc123',
      settingsOpen: true,
      leaderboardOpen: true,
      supportOpen: true,
      contactsOpen: true,
    };
    expect(screenOf(nav)).toEqual({ kind: 'channel', channelId: 'chan_abc123' });
  });

  it('orders the rest as the early returns do', () => {
    expect(
      screenOf({ ...NOWHERE, settingsOpen: true, leaderboardOpen: true })
    ).toEqual({ kind: 'settings' });
    expect(
      screenOf({ ...NOWHERE, leaderboardOpen: true, supportOpen: true })
    ).toEqual({ kind: 'standings' });
    expect(
      screenOf({ ...NOWHERE, supportOpen: true, contactsOpen: true })
    ).toEqual({ kind: 'support' });
  });

  it('opens exactly one thing for any screen', () => {
    for (const screen of SCREENS) {
      const nav = navOf(screen);
      const open = [
        nav.settingsOpen,
        nav.leaderboardOpen,
        nav.supportOpen,
        nav.contactsOpen,
      ].filter(Boolean).length;
      expect(open).toBeLessThanOrEqual(1);
      if (screen.kind !== 'channel') expect(nav.channelId).toBeNull();
    }
  });
});

describe('reading an address', () => {
  it('names the channel screen', () => {
    expect(screenOfPath('/c/chan_abc123')).toEqual({
      kind: 'channel',
      channelId: 'chan_abc123',
    });
  });

  it('ignores a query string and a fragment', () => {
    expect(screenOfPath('/settings?from=home')).toEqual({ kind: 'settings' });
    expect(screenOfPath('/contacts#top')).toEqual({ kind: 'contacts' });
  });

  it('reads a trailing slash as the same place', () => {
    expect(screenOfPath('/settings/')).toEqual({ kind: 'settings' });
    expect(screenOfPath('/')).toEqual({ kind: 'home' });
    expect(screenOfPath('')).toEqual({ kind: 'home' });
  });

  /**
   * Forgiving on purpose. This runs against whatever is in the address bar —
   * a truncated paste, a link from a build with different names, a path the
   * server's catch-all served the shell for — and Home is a correct and useful
   * answer to all of them. An error screen would not be.
   */
  it('falls back to Home rather than failing', () => {
    expect(screenOfPath('/nonsense')).toEqual({ kind: 'home' });
    expect(screenOfPath('/settings/extra')).toEqual({ kind: 'home' });
    // A channel route with no id is not a channel.
    expect(screenOfPath('/c')).toEqual({ kind: 'home' });
    expect(screenOfPath('/c/')).toEqual({ kind: 'home' });
  });

  /**
   * Channel ids are opaque and this must not mangle one. They are
   * `chan_` plus base62 today, but the encode/decode pair is what makes that
   * an implementation detail rather than a constraint this file relies on.
   */
  it('carries an id that needed encoding, unchanged', () => {
    const screen: Screen = { kind: 'channel', channelId: 'chan_a/b c' };
    const path = pathOf(screen);
    expect(path).not.toContain(' ');
    expect(screenOfPath(path)).toEqual(screen);
  });
});

describe('telling one place from another', () => {
  it('separates different screens', () => {
    expect(sameScreen({ kind: 'home' }, { kind: 'settings' })).toBe(false);
  });

  it('separates two channels', () => {
    expect(
      sameScreen(
        { kind: 'channel', channelId: 'a' },
        { kind: 'channel', channelId: 'b' }
      )
    ).toBe(false);
  });

  it('recognises the same place', () => {
    expect(sameScreen({ kind: 'support' }, { kind: 'support' })).toBe(true);
    expect(
      sameScreen(
        { kind: 'channel', channelId: 'a' },
        { kind: 'channel', channelId: 'a' }
      )
    ).toBe(true);
  });
});

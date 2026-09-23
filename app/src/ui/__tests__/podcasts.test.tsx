import React from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { HomeView } from '../HomeView';
import { staysInside } from '../PodcastsView';
import {
  findButton,
  findTab,
  homeNav,
  mockApp,
  render,
  resetHarness,
} from '../testing/harness';

jest.mock('../../api/download', () =>
  require('../testing/harness').downloadMock()
);
jest.mock('../../api/upload', () => require('../testing/harness').uploadMock());
jest.mock('../../state/AppProvider', () =>
  require('../testing/harness').appProviderMock()
);

/**
 * A server, which the suite otherwise runs without.
 *
 * `API_URL` is empty under jest — no `EXPO_PUBLIC_API_URL`, and the web
 * default is not reached on a native platform — and the Podcasts tab is a
 * frame around an address on that server. So the one thing worth pinning
 * about it, *which page it opens*, is unobservable unless there is a server
 * for it to be on. Only this file mocks it; everything else in the suite goes
 * on talking to nothing, which is what the harness is for.
 */
const SERVER = 'https://floor.example';
jest.mock('../../api/config', () => ({
  ...jest.requireActual('../../api/config'),
  API_URL: 'https://floor.example',
}));

/**
 * The Podcasts tab: a tab on the home tier, and the server's own directory of
 * published channels inside it.
 *
 * Added 2026-09-22. What is asserted here is the seam and not the page — the
 * page is `server/src/directory-page.ts` and is tested there, which is the
 * whole reason the app shows that document rather than a second rendering of
 * the same list. See `PodcastsView`.
 */

beforeEach(resetHarness);

/** A tier with nothing in it, which is every case in this file. */
function home(list: 'channels' | 'podcasts'): ReactTestRenderer {
  mockApp.home = { invites: [], rejoinable: [], contacts: [] };
  return render(<HomeView {...homeNav} list={list} />);
}

/** The frame, if there is one. The mock in `jest.setup.js` carries `source`. */
function frames(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props?.testID === 'webview'
  );
}

describe('the Podcasts tab', () => {
  it('stands in the switch between the lists and Support', () => {
    const tree = home('channels');
    expect(findTab(tree, 'Podcasts')).toBeDefined();
    act(() => tree.unmount());
  });

  /**
   * Asked for rather than taken: the tier holds no list of its own, so a tab
   * reports upward and comes back as a prop, exactly as the other three do.
   */
  it('asks for its list rather than switching itself', () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
    const onList = jest.fn();
    const tree = render(<HomeView {...homeNav} onList={onList} />);
    act(() => findTab(tree, 'Podcasts')!.props.onPress());
    expect(onList).toHaveBeenCalledWith('podcasts');
    act(() => tree.unmount());
  });

  /**
   * **The page, at the address the server serves it from.** The tab is a frame
   * and this is the whole of what the app decides about it; get this wrong and
   * it is a frame around the wrong document, which nothing else would catch.
   */
  it('opens the server’s own directory page', () => {
    const tree = home('podcasts');
    const [frame] = frames(tree);
    expect(frame).toBeDefined();
    expect(frame.props.source).toEqual({ uri: `${SERVER}/podcasts` });
    act(() => tree.unmount());
  });

  /**
   * The tier stays, and the body is the page. The switch is pinned above it —
   * a tab you cannot leave is a trap — and neither list is drawn underneath,
   * which is what a body being a body rather than a card means.
   */
  it('keeps the switch and draws neither list', () => {
    const tree = home('podcasts');
    expect(findTab(tree, 'Channels')).toBeDefined();
    expect(findTab(tree, 'Podcasts')).toBeDefined();
    // *Start a channel* is `ChannelsView`'s own row and is on the tab this
    // one replaced, so its absence is the body having actually swapped.
    expect(findButton(tree, 'Start a channel')).toBeUndefined();
    act(() => tree.unmount());
  });

  /**
   * **In a split the page is not in the tier at all.**
   *
   * Above the breakpoint `App.tsx` draws the directory in the pane on the
   * right and tells the tier so; what is asserted here is only the tier's
   * half, which is that the frame is gone and the switch is not — a tab that
   * lit and left the column showing the last body would be the fault this
   * prop exists to prevent, and one nothing else would catch.
   */
  it('draws no page of its own when the pane next door has it', () => {
    mockApp.home = { invites: [], rejoinable: [], contacts: [] };
    const tree = render(
      <HomeView {...homeNav} list="podcasts" podcastsBeside />
    );
    expect(frames(tree)).toHaveLength(0);
    expect(findTab(tree, 'Podcasts')).toBeDefined();
    // Nor is the tab it replaced still underneath.
    expect(findButton(tree, 'Start a channel')).toBeUndefined();
    act(() => tree.unmount());
  });

  /**
   * **What the frame keeps and what it hands to the browser.**
   *
   * A frame has no back button, so the set that stays is the two pages that
   * link to each other. The landing page is the one that would strand
   * somebody: it is same-origin, so a rule written as *this server stays*
   * would have kept it, and the page's own colophon links straight to it.
   */
  it('keeps the directory and a channel page, and lets go of the rest', () => {
    expect(staysInside(`${SERVER}/podcasts`)).toBe(true);
    expect(staysInside(`${SERVER}/c/sess_1`)).toBe(true);
    expect(staysInside(`${SERVER}/c/sess_1?from=app`)).toBe(true);

    expect(staysInside(`${SERVER}/`)).toBe(false);
    expect(staysInside(`${SERVER}/privacy`)).toBe(false);
    expect(staysInside('mailto:hello@example.com')).toBe(false);
    // Somewhere else entirely, and somewhere that merely starts the same way.
    expect(staysInside('https://example.com/podcasts')).toBe(false);
    expect(staysInside(`${SERVER}.evil.example/podcasts`)).toBe(false);
  });

  /**
   * And the other three tabs draw no frame at all — asserted beside the row
   * the test above looks for the absence of, so that absence is a swap rather
   * than a search that was never going to find anything.
   */
  it('is the only body that is a page', () => {
    const tree = home('channels');
    expect(frames(tree)).toHaveLength(0);
    expect(findButton(tree, 'Start a channel')).toBeDefined();
    act(() => tree.unmount());
  });
});

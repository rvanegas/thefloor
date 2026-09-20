import React from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import {
  ME,
  NOW,
  channelOf,
  mockApp,
  render,
  resetHarness,
  showChannel,
} from '../../ui/testing/harness';
import { DockSlot, Picture } from '../Picture';
import { WatchDock } from '../Dock';
import { WatchPlayer } from '../WatchPlayer';

jest.mock('../../state/AppProvider', () =>
  require('../../ui/testing/harness').appProviderMock()
);

/**
 * How many times the page has been built, which is the fact under test.
 *
 * The global mock in jest.setup.js draws a view and drops its props; this one
 * counts its own mounts, because *the same element, still mounted* is the
 * whole promise and a re-render that looks identical would not keep it.
 */
const mockMounts = { count: 0 };
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((_props: unknown, _ref: unknown) => {
      React.useEffect(() => {
        mockMounts.count += 1;
      }, []);
      return React.createElement(View, { testID: 'webview' });
    }),
  };
});

/**
 * **The player outlives every screen, which is the whole of why it is here.**
 *
 * It has been moved twice for the same reason and the reason is worth stating
 * once more: a `WebView` reparented is a `WebView` rebuilt — the page reloads,
 * the film restarts from black and the follower drives it back — so wherever
 * the player is mounted is the furthest anybody can walk without losing the
 * film. On the *Watch* tab, a tab bar was far enough. On the channel screen,
 * Home was. Above the route table, nothing in the application is.
 *
 * So what is asserted here is survival rather than appearance: that the film
 * is still the same mounted element after the screen under it has been
 * replaced by another. The ordinary way to break this is a well-meant
 * conditional somewhere up the tree — rendering the picture only on a channel
 * route, say — which looks like tidying and is the defect coming back.
 */
describe('The picture outlives the screen it was started from', () => {
  beforeEach(() => {
    resetHarness();
    mockMounts.count = 0;
  });

  const watching = () =>
    channelOf((s) =>
      reduce(
        s,
        {
          type: 'START_WATCH',
          userId: ME,
          videoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        NOW
      )
    );

  it('keeps one player across a change of screen', () => {
    mockApp.screenFor = 'sess_1';
    showChannel(watching());

    const tree = render(
      <Picture onOpen={() => {}}>
        <Text>the channel</Text>
      </Picture>
    );
    const player = () => tree.root.findAll((node) => node.type === WatchPlayer);
    expect(player()).toHaveLength(1);
    expect(mockMounts.count).toBe(1);

    // Home, which until 2026-09-19 unmounted the channel screen and the film
    // with it — the party losing its screen at a tap meant to leave it for a
    // moment.
    act(() => {
      tree.update(
        <Picture onOpen={() => {}}>
          <Text>home</Text>
        </Picture>
      );
    });
    expect(player()).toHaveLength(1);
    // The page was built once and has not been built again, which is the
    // difference between a film that kept playing and one that went black.
    expect(mockMounts.count).toBe(1);
    act(() => tree.unmount());
  });

  /**
   * **The hole survives everything that is not this slot's own unmounting.**
   *
   * Reported from an iPad on build 251: the film floating in a corner while
   * the *Watch* tab showed the black rectangle it should have been sitting
   * in. The way in was a film that was refused and then was not — a VPN came
   * off and the same link loaded — and nothing put the picture back, because
   * re-docking needs a fresh `onLayout` and the layout had not changed.
   *
   * The cause was `DockSlot` keying its cleanup on the whole context object,
   * which is rebuilt whenever `fullScreen` or `refused` changes; the cleanup
   * is an `undock`. So the assertion is that a refusal arriving and clearing
   * leaves the slot exactly where it was. The *Full screen* flip hid this by
   * self-healing — that route unmounts this component and mounts it again.
   *
   * **Docking is reachable in a test, which the source used to say it was
   * not.** Nothing here lays anything out, so `onLayout` never fires on its
   * own — but the node mock the preset already attaches carries a
   * `measureInWindow` that answers nothing, and replacing that one method is
   * enough to drive the whole path by hand. `createNodeMock` is not the way
   * in: the preset's own mock wins, and handing every node a measuring one
   * sends the dock into a loop.
   */
  it('keeps its hole when a refusal comes and goes', () => {
    mockApp.screenFor = 'sess_1';
    showChannel(watching());

    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <Picture onOpen={() => {}}>
          <DockSlot />
        </Picture>
      );
    });
    const dock = () => tree.root.findAll((node) => node.type === WatchDock)[0];
    const slot = tree.root
      .findAll((node) => node.type === DockSlot)[0]
      .findAll((node) => node.type === View)[0];
    // The one method, on the node the preset already attached. `instance` is
    // not in this repository's typings for the renderer, which is why it is
    // reached through a cast rather than read straight off.
    const node = (slot as unknown as { instance: Record<string, unknown> })
      .instance;
    node.measureInWindow = (
      cb: (x: number, y: number, w: number, h: number) => void
    ) => cb(10, 20, 620, 349);

    act(() => {
      slot.props.onLayout({
        nativeEvent: { layout: { width: 620, height: 349 } },
      });
    });
    expect(dock()?.props.place).toBe('docked');

    // The player's own report, which is the path the provider takes: a code
    // from the embed, and then a clean load of the same link.
    const player = tree.root.findAll((node) => node.type === WatchPlayer)[0];
    act(() => player.props.onRefusal('The owner of this video…'));
    expect(dock()?.props.place).toBe('docked');
    act(() => player.props.onRefusal(null));
    expect(dock()?.props.place).toBe('docked');
    expect(dock()?.props.slot).not.toBeNull();
    act(() => tree.unmount());
  });

  /*
    The absence of a hole is the instruction to float, which is what lets every
    screen in the application say nothing at all about the picture. Only the
    *Watch* tab leaves one.
  */
  it('floats wherever no hole has been left for it', () => {
    mockApp.screenFor = 'sess_1';
    showChannel(watching());

    const tree = render(
      <Picture onOpen={() => {}}>
        <Text>home</Text>
      </Picture>
    );
    const dock = () => tree.root.findAll((node) => node.type === WatchDock)[0];
    expect(dock()?.props.place).toBe('floating');
    expect(dock()?.props.slot).toBeNull();
    act(() => tree.unmount());
  });

  /*
    **Nobody outside the room gets one**, and it is checked where the picture
    is drawn rather than only in the rule that gives the screen role up: an
    effect runs after a commit, so a rule written only there would load the
    page and take it away again. *Nearby* fails it exactly as *out* does —
    that rung is reachability rather than attendance, which is what makes it an
    answer to *I do not want to watch this*.
  */
  it('draws nothing for somebody who is only nearby', () => {
    mockApp.screenFor = 'sess_1';
    showChannel(
      channelOf((s) =>
        reduce(
          reduce(
            s,
            {
              type: 'START_WATCH',
              userId: ME,
              videoId: 'dQw4w9WgXcQ',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            },
            NOW
          ),
          { type: 'DECLARE_NEARBY', userId: ME },
          NOW
        )
      )
    );

    const tree = render(
      <Picture onOpen={() => {}}>
        <Text>the channel</Text>
      </Picture>
    );
    expect(tree.root.findAll((node) => node.type === WatchPlayer)).toHaveLength(
      0
    );
    act(() => tree.unmount());
  });

  /*
    And nothing at all when this device is not the screen, which is the
    ordinary case: a film playing on somebody's laptop is not one this phone
    draws, and a party nobody has taken the screen for has no picture anywhere.
  */
  it('draws nothing when this device is not the screen', () => {
    showChannel(watching());

    const tree = render(
      <Picture onOpen={() => {}}>
        <Text>the channel</Text>
      </Picture>
    );
    expect(tree.root.findAll((node) => node.type === WatchPlayer)).toHaveLength(
      0
    );
    act(() => tree.unmount());
  });

  /*
    The hole is a rectangle in the flow and nothing else — a screen that wants
    the picture docked reserves the height and reports where it ended up. It is
    rendered here rather than by the picture, so that the body still has its
    height taken out of it exactly as a pinned header does.
  */
  it('leaves the hole to the screen that wants one', () => {
    mockApp.screenFor = 'sess_1';
    showChannel(watching());

    const tree = render(
      <Picture onOpen={() => {}}>
        <DockSlot />
      </Picture>
    );
    expect(tree.root.findAll((node) => node.type === DockSlot)).toHaveLength(1);
    act(() => tree.unmount());
  });
});

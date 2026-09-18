import React from 'react';
import { Linking } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { WatchState } from '../../../../core/types';

/**
 * What the page claims to be, and what the card refuses to become.
 *
 * Both were found the hard way on 2026-09-17 — a party that came up black
 * saying *This video is unavailable, Error code: 152*, and a Watch tab that
 * turned into a mobile YouTube page when somebody tapped the only way out of
 * it. Neither is visible from inside the code: the page loads, the player is
 * built, every callback fires, and the single symptom is a frame that never
 * plays. So the two props that settle it are asserted here rather than left to
 * a rebuild and a phone.
 *
 * The global mock in jest.setup.js draws a view and drops its props, which is
 * all a follower test needs. This one needs the props, so it replaces it.
 */
const seen: Record<string, unknown>[] = [];

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef(
      (props: Record<string, unknown>, ref: unknown) => {
        seen.push(props);
        React.useImperativeHandle(ref, () => ({ postMessage: jest.fn() }));
        return React.createElement(View, { testID: 'webview' });
      }
    ),
  };
});

import { WatchPlayer } from '../WatchPlayer';

const watch: WatchState = {
  party: {
    videoId: 'abc123',
    url: 'https://youtu.be/abc123',
    durationMs: null,
  },
  status: 'paused',
  positionMs: 0,
  startedAt: null,
  mutedAll: false,
  enforced: false,
  failure: null,
};

let tree: ReactTestRenderer | null = null;

function draw(): Record<string, unknown> {
  act(() => {
    tree = renderer.create(
      <WatchPlayer watch={watch} channelId="c1" onDuration={() => {}} />
    );
  });
  return seen[0];
}

beforeEach(() => {
  seen.length = 0;
});

afterEach(() => {
  // The follower's interval outlives the test otherwise, and jest says so.
  act(() => {
    tree?.unmount();
  });
  tree = null;
  jest.restoreAllMocks();
});

describe('the page the film plays in', () => {
  it('does not claim to be YouTube', () => {
    // A page whose origin is youtube.com is YouTube embedding itself, and the
    // embed answers 152 rather than playing. An origin is still required: no
    // base at all leaves an opaque one, which answers 153.
    const { baseUrl } = draw().source as { baseUrl: string };
    expect(baseUrl).toMatch(/^https:\/\//);
    expect(baseUrl).not.toMatch(/youtube\.com/);
  });

  it('hands a top-frame navigation to the phone instead of following it', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const decide = draw().onShouldStartLoadWithRequest as (request: {
      url: string;
      isTopFrame: boolean;
    }) => boolean;

    const away = 'https://www.youtube.com/watch?v=abc123';
    expect(decide({ url: away, isTopFrame: true })).toBe(false);
    expect(open).toHaveBeenCalledWith(away);

    // Everything the embed loads for itself is below the top frame, and is not
    // this rule's business.
    open.mockClear();
    expect(
      decide({ url: 'https://www.youtube.com/embed/abc123', isTopFrame: false })
    ).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});

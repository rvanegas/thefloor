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
/** Every command the host has sent into the page, in order. */
const sent: string[] = [];

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef(
      (props: Record<string, unknown>, ref: unknown) => {
        seen.push(props);
        React.useImperativeHandle(ref, () => ({
          postMessage: (data: string) => sent.push(data),
        }));
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

function draw(mayControl = true): Record<string, unknown> {
  act(() => {
    tree = renderer.create(
      <WatchPlayer
        watch={watch}
        channelId="c1"
        mayControl={mayControl}
        onDuration={() => {}}
        onIntent={() => {}}
      />
    );
  });
  return seen[0];
}

/** What the page says once the embed is built, which unblocks the host. */
function ready(props: Record<string, unknown>): void {
  const onMessage = props.onMessage as (event: {
    nativeEvent: { data: string };
  }) => void;
  act(() => {
    onMessage({ nativeEvent: { data: JSON.stringify({ t: 'ready' }) } });
  });
}

/** The last `interactive` command, or undefined if none was sent. */
function interactive(): boolean | undefined {
  const commands = sent
    .map((data) => JSON.parse(data) as { do?: string; on?: boolean })
    .filter((command) => command.do === 'interactive');
  return commands[commands.length - 1]?.on;
}

beforeEach(() => {
  seen.length = 0;
  sent.length = 0;
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

/**
 * The other half of the same afternoon: YouTube's own bar, pressed.
 *
 * Until 2026-09-17 a press on it was obeyed and then corrected away a quarter
 * of a second later, which reads as a broken video rather than as a channel
 * with one transport. The bar cannot be removed — it is drawn on the picture
 * — so the two answers are that it drives the channel, for whoever may drive
 * it, and that it does not answer at all for everybody else. Neither is
 * visible from the props alone, which is why both are asserted here.
 */
describe('YouTube’s own controls', () => {
  it('lets the frame answer a finger when this screen may drive', () => {
    ready(draw(true));
    expect(interactive()).toBe(true);
  });

  it('makes the frame inert when it may not', () => {
    // The greyed buttons in the channel, said by the video. Nothing is drawn
    // over the player and nothing about the embed changes.
    ready(draw(false));
    expect(interactive()).toBe(false);
  });

  it('says nothing to a page that has not reported itself ready', () => {
    draw(false);
    expect(interactive()).toBeUndefined();
  });

  it('gives a refused video back its way out, whoever is driving', () => {
    const props = draw(false);
    ready(props);
    const onMessage = props.onMessage as (event: {
      nativeEvent: { data: string };
    }) => void;
    act(() => {
      // 150 — the owner's refusal. What is left in the frame is YouTube's own
      // explanation and the button that opens the video where it will play,
      // and making that unpressable would take away an escape, not a control.
      onMessage({
        nativeEvent: { data: JSON.stringify({ t: 'error', code: 150 }) },
      });
    });
    expect(interactive()).toBe(true);
  });
});

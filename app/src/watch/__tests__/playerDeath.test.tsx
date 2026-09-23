import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { WatchState } from '../../../../core/types';
import type { PlayerPort } from '../drive';

/**
 * **The one failure that is worth rebuilding a player for, and the reading
 * that must not outlive the page that made it.**
 *
 * There were three of these for a day. A player that would not obey was
 * rebuilt after three ignored instructions, and a page that had gone quiet was
 * rebuilt after six seconds; both were guesses at a cure for *stuck, will not
 * resume, rotating unsticks it*, made before anybody had found the fault.
 *
 * The fault turned out to be in the follower's own patience, and the guesses
 * turned out to have false positives — the quiet one fired on every return
 * from the background, where a suspended `WKWebView` has simply stopped
 * talking, and reloaded a film that was perfectly healthy. Both are gone.
 *
 * What is left is the failure iOS *announces*, which needs no heuristic and
 * has no false positive: the content process being taken. And the reading
 * stamp, which is not a watchdog at all — it stops the follower reasoning
 * about a page that is no longer reporting, whatever the reason.
 */

/** Every `WebView` that has been mounted, newest last. */
const mounts: Record<string, unknown>[] = [];

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef(
      (props: Record<string, unknown>, ref: unknown) => {
        // On mount rather than on render, which is the distinction the whole
        // file turns on: a rebuild is a new native view, and a re-render of
        // the one that is already there is what must not be mistaken for it.
        React.useEffect(() => {
          mounts.push(props);
        }, []);
        React.useImperativeHandle(ref, () => ({ postMessage: () => {} }));
        return React.createElement(View, { testID: 'webview' });
      }
    ),
  };
});

/** The follower, replaced by a hand that keeps hold of the port. */
const ports: (PlayerPort | null)[] = [];
jest.mock('../drive', () => ({
  useFollow: (_watch: unknown, port: PlayerPort | null) => {
    ports.push(port);
  },
}));

import { WatchPlayer } from '../WatchPlayer';

const watch: WatchState = {
  party: {
    videoId: 'abc123',
    url: 'https://youtu.be/abc123',
    durationMs: null,
    title: null,
  },
  status: 'paused',
  positionMs: 0,
  startedAt: null,
  mutedAll: false,
  enforced: false,
  failure: null,
  history: [],
};

let tree: ReactTestRenderer | null = null;

function draw(): void {
  act(() => {
    tree = renderer.create(
      <WatchPlayer watch={watch} channelId="c1" onFilm={() => {}} />
    );
  });
}

function say(payload: unknown): void {
  const onMessage = mounts[mounts.length - 1].onMessage as (event: {
    nativeEvent: { data: string };
  }) => void;
  act(() => {
    onMessage({ nativeEvent: { data: JSON.stringify(payload) } });
  });
}

/** The page reporting, as it does four times a second while it is alive. */
function reporting(ms: number): void {
  for (let done = 0; done < ms; done += 250) {
    say({ t: 'reading', state: 1, positionMs: done, durationMs: 600_000 });
    act(() => {
      jest.advanceTimersByTime(250);
    });
  }
}

/** The latest port, which is null until the page has said it is ready. */
const port = () => ports[ports.length - 1];

beforeEach(() => {
  mounts.length = 0;
  ports.length = 0;
  jest.useFakeTimers({ now: 1_700_000_000_000, doNotFake: ['nextTick'] });
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  tree = null;
  jest.useRealTimers();
});

describe('the content process being taken', () => {
  it('is met at once, being the one failure iOS announces', () => {
    draw();
    say({ t: 'ready' });
    reporting(500);
    act(() => {
      (mounts[mounts.length - 1].onContentProcessDidTerminate as () => void)();
    });
    expect(mounts).toHaveLength(2);
  });
});

describe('a reading nobody has refreshed', () => {
  it('is not offered to the follower as though it were current', () => {
    draw();
    say({ t: 'ready' });
    say({ t: 'reading', state: 2, positionMs: 4_000, durationMs: 600_000 });
    expect(port()?.read()).toEqual({
      state: 'paused',
      positionMs: 4_000,
      durationMs: 600_000,
      // Nothing in this report names a video, which is what an embed without
      // `getVideoData` reports. See `PlayerReading.videoId`.
      videoId: null,
    });

    // A page that has gone quiet says `paused` for ever, and `paused` is a
    // state a follower will believe it has arrived at — which is how a
    // player nothing will ever speak to again used to come about.
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(port()?.read()).toBeNull();
  });
});

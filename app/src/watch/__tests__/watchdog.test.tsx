import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { WatchState } from '../../../../core/types';
import type { PlayerPort } from '../drive';

/**
 * **The two ways a picture stops answering, and the one cure.**
 *
 * `transport.test.tsx` has the player that hears and does not act. This has
 * the one that does not hear: a page whose JavaScript has stopped — a content
 * process taken for memory, a document that went somewhere else, a context
 * suspended and never woken. The follower cannot catch that one, and the
 * reason is worth stating because it looks like an oversight. A stale reading
 * is no reading; a follower with no reading correctly says nothing; so
 * nothing is ever ignored and the count that rebuilds a player is never
 * reached. Silence needs its own watch.
 *
 * Both were reported as the same complaint — *play/pause is flaky, and
 * rotating the phone unsticks it* — because rotating is the cure for both,
 * mounting a fresh player being the only thing either responds to.
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

describe('a page that has stopped talking', () => {
  it('is built again', () => {
    draw();
    say({ t: 'ready' });
    reporting(1_000);
    expect(mounts).toHaveLength(1);

    // Silence. Nothing in the application would ever speak to this page
    // again, and nothing it is told would be heard if it did.
    act(() => {
      jest.advanceTimersByTime(14_000);
    });
    expect(mounts).toHaveLength(2);
  });

  it('is left alone while it is still reporting', () => {
    // The guard: a rebuild is a black rectangle and a refetch, and a page
    // that is talking is not the fault this is for — however little the film
    // may be doing.
    draw();
    say({ t: 'ready' });
    reporting(14_000);
    expect(mounts).toHaveLength(1);
  });

  it('is not built again while the film is refused', () => {
    // A refusal is the one thing a fresh player cannot help with: the owner
    // will say the same to the next one, and the frame is carrying YouTube's
    // own explanation and the way out it offers.
    draw();
    say({ t: 'ready' });
    say({ t: 'error', code: 150 });
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(mounts).toHaveLength(1);
  });
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

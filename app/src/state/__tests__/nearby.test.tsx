import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { ChannelView } from '../../../../core/protocol';
import { somebodyArrived } from '../nearby';
import { useNearby } from '../useNearby';

/**
 * **Promotion**: nearby, foreground, somebody steps in → the phone steps in
 * too.
 *
 * The transition the 2026-09-08 design said to build first, because it is the
 * one with real risk in it. A nearby phone holds no session and no
 * subscription, so promoting is an automatic media reconnect — the re-entry
 * that froze playout for weeks. What is testable here is the *rule*: when it
 * fires, when it must not, and the three conditions each doing its own work.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const THIRD = 'acct_third';
const T0 = 1_700_000_000_000;

jest.mock('../../audio/diagnostics', () => ({
  recordEvent: jest.fn(),
}));

let listeners: ((next: string) => void)[] = [];

function captureAppState() {
  listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    fn: (next: string) => void
  ) => {
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  }) as unknown as typeof AppState.addEventListener);
  (AppState as unknown as { currentState: string }).currentState = 'active';
}

const acted: Array<{ channelId: string; type: string }> = [];
const act_ = (channelId: string, action: { type: 'ENTER' }) => {
  acted.push({ channelId, type: action.type });
};

/** Me nearby, one other person in the room or not. */
function channelOf(present: string[], waiting: string[]): ChannelState {
  let channel = createChannel({
    id: 'chan_1',
    initiator: ME,
    invitees: [THEM, THIRD],
    now: T0,
  });
  channel = reduce(channel, { type: 'STEP_OUT', userId: ME }, T0 + 1_000);
  for (const id of present) {
    channel = reduce(channel, { type: 'ENTER', userId: id }, T0 + 2_000);
  }
  for (const id of waiting) {
    channel = reduce(channel, { type: 'DECLARE_NEARBY', userId: id }, T0 + 3_000);
  }
  return channel;
}

const viewOf = (channel: ChannelState): ChannelView => ({
  channel,
  participants: [
    { id: ME, displayName: 'Me' },
    { id: THEM, displayName: 'Dana' },
    { id: THIRD, displayName: 'Sam' },
  ],
  recordings: [],
  serverNow: T0,
});

function Probe({
  view,
  nearbyIn,
}: {
  view: ChannelView | null;
  nearbyIn: string | null;
}) {
  useNearby(view, ME, nearbyIn, act_);
  return null;
}

const appState = async (next: string) => {
  (AppState as unknown as { currentState: string }).currentState = next;
  await act(async () => {
    for (const fn of [...listeners]) fn(next);
  });
};

/** Mounted nearby in an empty room, which is where most cases start. */
async function nearby(present: string[] = []): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <Probe view={viewOf(channelOf(present, [ME]))} nearbyIn="chan_1" />
    );
  });
  return tree;
}

describe('the arrival rule', () => {
  it('is not the first sight of a room', () => {
    // The snapshot that arrives with the declaration is the room as it already
    // was. Reading it as an arrival would promote somebody straight back out
    // of the state they had just chosen.
    expect(somebodyArrived(null, [THEM], ME)).toBe(false);
  });

  it('is somebody who was not there before', () => {
    expect(somebodyArrived([], [THEM], ME)).toBe(true);
    expect(somebodyArrived([THEM], [THEM, THIRD], ME)).toBe(true);
  });

  it('is not somebody who was already there', () => {
    // The common case rather than a corner: declaring nearby in a room where
    // somebody is already talking leaves you nearby, hearing nothing, until
    // the next person arrives. That is intended.
    expect(somebodyArrived([THEM], [THEM], ME)).toBe(false);
  });

  it('is never yourself', () => {
    expect(somebodyArrived([], [ME], ME)).toBe(false);
  });

  it('is not somebody leaving', () => {
    expect(somebodyArrived([THEM, THIRD], [THEM], ME)).toBe(false);
  });
});

describe('promotion', () => {
  beforeEach(() => {
    acted.length = 0;
    captureAppState();
  });

  it('steps in when somebody arrives', async () => {
    const tree = await nearby();

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(acted).toEqual([{ channelId: 'chan_1', type: 'ENTER' }]);
    await act(async () => tree.unmount());
  });

  it('does not step in for somebody who was already there', async () => {
    const tree = await nearby([THEM]);

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(acted).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('does not step in from the background, where iOS refuses a microphone', async () => {
    const tree = await nearby();
    await appState('background');

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(acted).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('promotes at the foreground for an arrival it could not act on', async () => {
    // **The arrival is not consumed by the background.** Others see *Nearby*
    // and may ping while the phone is away; picking it up is the moment the
    // promotion becomes possible, and the design asks for it there.
    const tree = await nearby();
    await appState('background');
    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });
    expect(acted).toEqual([]);

    await appState('active');

    expect(acted).toEqual([{ channelId: 'chan_1', type: 'ENTER' }]);
    await act(async () => tree.unmount());
  });

  it('does not step in on a wait this device did not declare', async () => {
    // The inferred kind, and a declaration made on another phone. Promotion
    // opens a microphone nobody asked for, and a wait somebody's other device
    // is in the middle of is not an ask.
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Probe view={viewOf(channelOf([], [ME]))} nearbyIn={null} />
      );
    });

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn={null} />
      );
    });

    expect(acted).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('stops once the server no longer says nearby', async () => {
    // Lapsed to *Stepped out*, which the server decides. `waiting` is read
    // back rather than assumed from the device's own record, so a declaration
    // that has expired promotes nobody.
    const tree = await nearby();

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], []))} nearbyIn="chan_1" />
      );
    });

    expect(acted).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('promotes once, not on every snapshot afterwards', async () => {
    const tree = await nearby();

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });
    // The server has not answered yet, so the snapshot still says nearby.
    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(acted).toHaveLength(1);
    await act(async () => tree.unmount());
  });
});

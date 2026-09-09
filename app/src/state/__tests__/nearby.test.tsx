import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { ChannelView } from '../../../../core/protocol';
import { somebodyArrived, whoArrived } from '../nearby';
import { useNearby } from '../useNearby';

/**
 * **The offer**: nearby, foreground, somebody steps in → the phone says who
 * arrived and offers a step in. It does not step in.
 *
 * Promotion — the automatic version — was built on 2026-09-08 and removed the
 * same day, before it had been heard on a device;
 * `decisions/2026-09-08-the-arrival-is-offered.md` is why. The detection
 * survived it unchanged, so what is testable here is still the *rule*: when it
 * reports, when it must not, and the three conditions each doing its own work.
 * That nothing enters the room is now itself one of the assertions.
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

const offered: Array<{ channelId: string; who: string[] }> = [];
const onArrival = (channelId: string, who: string[]) => {
  offered.push({ channelId, who });
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
  useNearby(view, ME, nearbyIn, onArrival);
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
    // was. Reading it as an arrival would put an offer up against the state
    // somebody had just chosen.
    expect(somebodyArrived(null, [THEM], ME)).toBe(false);
  });

  it('is somebody who was not there before', () => {
    expect(somebodyArrived([], [THEM], ME)).toBe(true);
    expect(somebodyArrived([THEM], [THEM, THIRD], ME)).toBe(true);
  });

  it('is not somebody who was already there', () => {
    // The common case rather than a corner: declaring nearby in a room where
    // somebody is already talking leaves you nearby, hearing nothing and with
    // no offer, until the next person arrives. That is intended.
    expect(somebodyArrived([THEM], [THEM], ME)).toBe(false);
  });

  it('is never yourself', () => {
    expect(somebodyArrived([], [ME], ME)).toBe(false);
  });

  it('is not somebody leaving', () => {
    expect(somebodyArrived([THEM, THIRD], [THEM], ME)).toBe(false);
  });

  it('names who arrived, and agrees with the predicate', () => {
    // The offer says a name, so the same rule has to produce one. Empty
    // exactly when there is no arrival is the invariant worth holding: two
    // answers that could disagree would be a card naming nobody.
    expect(whoArrived([THEM], [THEM, THIRD], ME)).toEqual([THIRD]);
    expect(whoArrived([], [THEM, THIRD], ME)).toEqual([THEM, THIRD]);
    for (const [before, after] of [
      [null, [THEM]],
      [[THEM], [THEM]],
      [[], [ME]],
      [[THEM, THIRD], [THEM]],
    ] as Array<[string[] | null, string[]]>) {
      expect(whoArrived(before, after, ME).length > 0).toBe(
        somebodyArrived(before, after, ME)
      );
    }
  });
});

describe('the offer', () => {
  beforeEach(() => {
    offered.length = 0;
    captureAppState();
  });

  it('reports the arrival, naming who it was', async () => {
    const tree = await nearby();

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(offered).toEqual([{ channelId: 'chan_1', who: [THEM] }]);
    await act(async () => tree.unmount());
  });

  it('does not report somebody who was already there', async () => {
    const tree = await nearby([THEM]);

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(offered).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('reports nothing from the background', async () => {
    const tree = await nearby();
    await appState('background');

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(offered).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('offers at the foreground an arrival it could not draw', async () => {
    // **The arrival is not consumed by the background.** Others see *Nearby*
    // and may ping while the phone is away, and the arrival notification is
    // what reaches somebody who is not looking; picking the phone up is the
    // moment the offer can be drawn, and it is there when they do.
    const tree = await nearby();
    await appState('background');
    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });
    expect(offered).toEqual([]);

    await appState('active');

    expect(offered).toEqual([{ channelId: 'chan_1', who: [THEM] }]);
    await act(async () => tree.unmount());
  });

  it('reports nothing on a wait this device did not declare', async () => {
    // The inferred kind, and a declaration made on another phone. A wait
    // somebody's other device is in the middle of is not this screen's to
    // answer.
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

    expect(offered).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('stops once the server no longer says nearby', async () => {
    // Lapsed to *Stepped out*, which the server decides. `waiting` is read
    // back rather than assumed from the device's own record, so a declaration
    // that has expired offers nothing.
    const tree = await nearby();

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], []))} nearbyIn="chan_1" />
      );
    });

    expect(offered).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('reports once, not on every snapshot afterwards', async () => {
    const tree = await nearby();

    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });
    // The offer is standing and unanswered, so the snapshot still says nearby.
    await act(async () => {
      tree.update(
        <Probe view={viewOf(channelOf([THEM], [ME]))} nearbyIn="chan_1" />
      );
    });

    expect(offered).toHaveLength(1);
    await act(async () => tree.unmount());
  });
});

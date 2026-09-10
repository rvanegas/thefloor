import React from 'react';
import { AppState } from 'react-native';
import renderer, {
  act as reactAct,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { useAttention } from '../useAttention';
import { recordEvent } from '../../audio/diagnostics';

/**
 * What a phone says about attention, which since 2026-09-09 is all it does.
 *
 * The rule it feeds is `server/__tests__/presence.test.ts`; the gate on how
 * often it speaks is `attention.test.ts`. What is only knowable here is the
 * evidence a phone has to offer — that being frontmost counts continuously
 * rather than at the moment of arrival, and that a phone in a pocket offers
 * nothing at all.
 *
 * **The foreground rule is the one to hold on to.** It was read as an act
 * first, refreshing only when the app came forward, and that is a materially
 * different rule: it expires somebody who is looking at the screen and has
 * simply not brought the app forward in the last fifteen minutes, which on a
 * phone is what reading looks like. It is a state, re-read on a timer, and
 * this file is what stops it quietly becoming an act again.
 */

/** `LOOK_INTERVAL_MS` in the hook, which is not exported. */
const LOOK = 30_000;

const reports: Array<boolean | undefined> = [];

jest.mock('../AppProvider', () => ({
  useApp: () => ({
    reportAttentive: (force?: boolean) => {
      reports.push(force);
    },
  }),
}));

jest.mock('../../audio/diagnostics', () => ({
  recordEvent: jest.fn(),
}));

const logged = recordEvent as jest.MockedFunction<typeof recordEvent>;

function Harness() {
  useAttention();
  return null;
}

function setForeground(active: boolean) {
  (AppState as unknown as { currentState: string }).currentState = active
    ? 'active'
    : 'background';
}

/** The listeners the hook registered, so a state change can be delivered. */
const listeners: Array<(state: string) => void> = [];

beforeEach(() => {
  jest.useFakeTimers();
  reports.length = 0;
  listeners.length = 0;
  logged.mockClear();
  setForeground(true);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((_event: unknown, handler: (state: string) => void) => {
      listeners.push(handler);
      return { remove: () => {} };
    }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function mount() {
  let tree!: ReactTestRenderer;
  reactAct(() => {
    tree = renderer.create(<Harness />);
  });
  return tree;
}

it('says so at once, rather than a look later', () => {
  // Mounting is the app starting or the account signing in, and either way
  // somebody is holding the phone.
  const tree = mount();
  expect(reports).toHaveLength(1);
  reactAct(() => tree.unmount());
});

it('goes on saying so while the app is in front, untouched', () => {
  const tree = mount();
  reports.length = 0;
  reactAct(() => {
    jest.advanceTimersByTime(LOOK * 3);
  });
  // Three looks, three reports: being frontmost is a state and is re-read,
  // not an event that happened once when the app came forward.
  expect(reports).toHaveLength(3);
  reactAct(() => tree.unmount());
});

it('says nothing at all from a pocket', () => {
  const tree = mount();
  reports.length = 0;
  setForeground(false);
  reactAct(() => {
    jest.advanceTimersByTime(LOOK * 30);
  });
  // Fifteen minutes of silence, which is exactly what retires the phone that
  // is holding a room open with nobody near it.
  expect(reports).toHaveLength(0);
  reactAct(() => tree.unmount());
});

it('forces a report the moment the app comes forward', () => {
  const tree = mount();
  reports.length = 0;
  setForeground(false);
  reactAct(() => {
    jest.advanceTimersByTime(LOOK * 20);
  });
  setForeground(true);
  reactAct(() => {
    for (const listener of listeners) listener('active');
  });

  // `true`, past the rate limit: coming back is the one piece of evidence
  // that can rescue a clock about to run out, and half a minute of gate is
  // exactly the wrong thing to put in front of it.
  expect(reports).toEqual([true]);
  expect(logged).toHaveBeenCalledWith('attention foreground');
  reactAct(() => tree.unmount());
});

it('stops when it goes away', () => {
  const tree = mount();
  reactAct(() => tree.unmount());
  reports.length = 0;
  reactAct(() => {
    jest.advanceTimersByTime(LOOK * 5);
  });
  expect(reports).toHaveLength(0);
});

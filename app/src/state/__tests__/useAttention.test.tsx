import React from 'react';
import { AppState } from 'react-native';
import renderer, { act as reactAct } from 'react-test-renderer';
import { useAttention } from '../useAttention';
import { recordEvent } from '../../audio/diagnostics';
import { WAITING_WINDOW_MS } from '../../../../core/constants';
import type { ChannelState } from '../../../../core/types';

/**
 * What ends a visit on a phone, which is not what ends one in a browser.
 *
 * The pure rules are `attention.test.ts`; this is about the three things only
 * the hook knows — that it looks on a timer, that on a phone the whole of the
 * evidence a person is present is whether the app is in front, and that it
 * says so in the audio log on the way out.
 *
 * **The last of those is why this file also asserts about logging**, which is
 * not normally worth a test. Two field reports in one afternoon on 2026-09-06
 * were diagnosed from usage spans and mute states on the server, and the
 * diagnosis was rewritten three times — each time by somebody who had been in
 * the channel remembering what the spans could not say. The facts that decide
 * the outcome exist nowhere but on the phone: who was in this device's
 * active-speaker set when a look ran, and how long since the previous look.
 * A line that stops being written is the regression that costs the next
 * afternoon, so both are pinned here.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const CHANNEL = 'chan_1';

const acted: Array<{ channelId: string; type: string }> = [];

jest.mock('../AppProvider', () => ({
  useApp: () => ({
    act: (channelId: string, action: { type: string }) => {
      acted.push({ channelId, type: action.type });
    },
  }),
}));

jest.mock('../../audio/diagnostics', () => ({
  recordEvent: jest.fn(),
}));

const logged = recordEvent as jest.MockedFunction<typeof recordEvent>;

/** Enough of a channel for `roomOccupants`, which is all the hook reads. */
function channel(occupants: string[]): ChannelState {
  return {
    id: CHANNEL,
    participants: occupants,
    present: occupants,
    guests: {},
  } as unknown as ChannelState;
}

function Harness({
  live,
  speaking,
}: {
  live: ChannelState | null;
  speaking: string[];
}) {
  useAttention(live, ME, speaking);
  return null;
}

function setForeground(active: boolean) {
  (AppState as unknown as { currentState: string }).currentState = active
    ? 'active'
    : 'background';
}

function lines(): string[] {
  return logged.mock.calls.map(([text]) => text);
}

describe('the attention clock on a phone', () => {
  beforeEach(() => {
    acted.length = 0;
    logged.mockClear();
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('steps a backgrounded phone out once the window is spent', () => {
    setForeground(false);
    reactAct(() => {
      renderer.create(<Harness live={channel([ME, THEM])} speaking={[]} />);
    });

    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS + 60_000);
    });

    expect(acted).toEqual([{ channelId: CHANNEL, type: 'STEP_OUT' }]);
  });

  it('keeps the seat of a foregrounded phone nobody has touched', () => {
    setForeground(true);
    reactAct(() => {
      renderer.create(<Harness live={channel([ME, THEM])} speaking={[]} />);
    });

    // Twice the window, in silence, with no hand on the phone at all. A
    // browser would expire here and should; an app somebody is looking at is
    // being attended by the only means a phone has of saying so.
    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS * 2);
    });

    expect(acted).toEqual([]);
  });

  it('lets a stale clock be rescued by the app coming back in front', () => {
    setForeground(false);
    reactAct(() => {
      renderer.create(<Harness live={channel([ME, THEM])} speaking={[]} />);
    });

    // Just short of the window, in the background and in silence.
    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS - 60_000);
    });
    expect(acted).toEqual([]);

    // Back in front. The look that follows finds a clock nearly spent and an
    // app in front of somebody, and the second of those is the newer fact.
    setForeground(true);
    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS - 60_000);
    });

    expect(acted).toEqual([]);
  });

  it('says why it ended the visit, and what it believed at the time', () => {
    setForeground(false);
    reactAct(() => {
      renderer.create(<Harness live={channel([ME, THEM])} speaking={[]} />);
    });

    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS + 60_000);
    });

    // Somebody was in the room the whole time and never audible, which is the
    // shape of both field reports and is exactly what the line has to show.
    const expiry = lines().filter((l) => l.startsWith('attention expired'));
    expect(expiry).toHaveLength(1);
    expect(expiry[0]).toMatch(/others=1 audible=0 fg=F gap=\d+s$/);
  });

  it('says nothing at all while somebody else is audible', () => {
    setForeground(false);
    reactAct(() => {
      renderer.create(<Harness live={channel([ME, THEM])} speaking={[THEM]} />);
    });

    // Audible at every look, so the clock never ages: the seat is kept and
    // there is nothing worth a line about it.
    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS * 2);
    });

    expect(acted).toEqual([]);
    expect(lines()).toEqual([]);
  });

  it('stays quiet until the clock is half spent, then ships the run-up', () => {
    setForeground(false);
    reactAct(() => {
      renderer.create(<Harness live={channel([ME, THEM])} speaking={[]} />);
    });

    reactAct(() => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS / 2 - 60_000);
    });
    expect(lines()).toEqual([]);

    reactAct(() => {
      jest.advanceTimersByTime(120_000);
    });

    const aged = lines().filter((l) => l.startsWith('attention age'));
    expect(aged.length).toBeGreaterThan(0);
    expect(aged[0]).toMatch(/others=1 audible=0 fg=F gap=\d+s$/);
  });
});

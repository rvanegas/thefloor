import { act, create } from 'react-test-renderer';
import React from 'react';
import { useOfflineNotice } from '../useOfflineNotice';

/**
 * The warning people complained about. It fired on every foreground, because
 * a foreground drops the socket every time and the old grace period was a
 * one-way latch — once the first connection had succeeded, every later drop
 * was announced instantly.
 */

let shown = false;

function Probe({ status }: { status: 'connecting' | 'open' | 'closed' }) {
  shown = useOfflineNotice(status);
  return null;
}

const render = (status: 'connecting' | 'open' | 'closed') => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(Probe, { status }));
  });
  return {
    setStatus: (next: 'connecting' | 'open' | 'closed') =>
      act(() => {
        tree.update(React.createElement(Probe, { status: next }));
      }),
    unmount: () => act(() => tree.unmount()),
  };
};

beforeEach(() => {
  jest.useFakeTimers();
  shown = false;
});
afterEach(() => jest.useRealTimers());

const wait = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

describe('holding the warning back', () => {
  it('says nothing while a brief drop resolves itself', () => {
    const probe = render('open');
    probe.setStatus('closed');
    wait(1_000);
    expect(shown).toBe(false);

    probe.setStatus('open');
    wait(60_000);
    expect(shown).toBe(false);
    probe.unmount();
  });

  it('speaks up once the drop has lasted', () => {
    const probe = render('open');
    probe.setStatus('closed');
    wait(5_000);
    expect(shown).toBe(true);
    probe.unmount();
  });

  it('holds back again on the next drop, not only the first', () => {
    // The bug: the old grace was latched, so this second drop was announced
    // the instant it happened — which is every time the app is foregrounded.
    const probe = render('open');
    probe.setStatus('closed');
    wait(5_000);
    probe.setStatus('open');
    expect(shown).toBe(false);

    probe.setStatus('closed');
    wait(1_000);
    expect(shown).toBe(false);
    probe.unmount();
  });

  it('is not deferred forever by the reconnect backoff flapping', () => {
    // connecting → closed → connecting is one continuous outage, not a run of
    // fresh ones. Restarting the delay on each would leave a phone with no
    // route to the server never saying so.
    const probe = render('open');
    probe.setStatus('connecting');
    wait(1_000);
    probe.setStatus('closed');
    wait(1_000);
    probe.setStatus('connecting');
    wait(1_000);
    expect(shown).toBe(true);
    probe.unmount();
  });
});

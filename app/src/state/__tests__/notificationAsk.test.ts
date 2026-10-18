import { askDue, NUDGE_INTERVAL_MS } from '../notificationAsk';

/**
 * The policy since 2026-10-17: the dialog as soon as it can be had, the
 * banner a day apart after a refusal, and nothing at all for somebody who
 * switched push off.
 */

const NOW = 1_800_000_000_000;

describe('askDue', () => {
  it('asks nothing of an install that said yes', () => {
    expect(
      askDue(NOW, { permission: 'granted', pushOff: false, nudgedAt: null })
    ).toBe('none');
  });

  it('raises the dialog at once while it is unspent', () => {
    expect(
      askDue(NOW, { permission: 'undetermined', pushOff: false, nudgedAt: null })
    ).toBe('prompt');
  });

  it('nudges a refused install, and then not again for a day', () => {
    const denied = { permission: 'denied' as const, pushOff: false };
    expect(askDue(NOW, { ...denied, nudgedAt: null })).toBe('nudge');
    expect(askDue(NOW, { ...denied, nudgedAt: NOW - 1_000 })).toBe('none');
    expect(
      askDue(NOW, { ...denied, nudgedAt: NOW - NUDGE_INTERVAL_MS })
    ).toBe('nudge');
  });

  it('says nothing to somebody who switched push off, asked or not', () => {
    for (const permission of ['undetermined', 'denied'] as const) {
      expect(askDue(NOW, { permission, pushOff: true, nudgedAt: null })).toBe(
        'none'
      );
    }
  });
});

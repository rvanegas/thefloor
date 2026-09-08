import {
  askDue,
  worthAsking,
  NUDGE_INTERVAL_MS,
} from '../notificationAsk';

/**
 * When somebody is asked to be reachable, which is a policy with more cases
 * than it looks like — and one of them, the single iOS dialog, cannot be
 * undone by a later build. That is what these are guarding.
 */

const DAY = NUDGE_INTERVAL_MS;
const NOW = 1_700_000_000_000;

describe('whether the moment has come', () => {
  it('waits while there is nobody who could reach you', () => {
    expect(
      worthAsking({ somebody: false, conversed: true, launches: 9 })
    ).toBe(false);
  });

  it('waits out the launch that installed the app', () => {
    expect(
      worthAsking({ somebody: true, conversed: false, launches: 1 })
    ).toBe(false);
  });

  it('asks on the launch after it, which is somebody coming back', () => {
    expect(
      worthAsking({ somebody: true, conversed: false, launches: 2 })
    ).toBe(true);
  });

  /**
   * The real signal, and it beats the launch count: somebody who has been in a
   * conversation in their first session knows what a notification would be
   * about, which is the whole thing the wait was buying.
   */
  it('asks as soon as there has been a conversation', () => {
    expect(
      worthAsking({ somebody: true, conversed: true, launches: 1 })
    ).toBe(true);
  });
});

describe('what is due', () => {
  const state = {
    permission: 'undetermined' as const,
    ready: true,
    pitched: false,
    nudgedAt: null,
  };

  it('is nothing at all for somebody who has said yes', () => {
    expect(
      askDue(NOW, { ...state, permission: 'granted', ready: true })
    ).toBe('none');
  });

  it('holds the explanation back until the moment has come', () => {
    expect(askDue(NOW, { ...state, ready: false })).toBe('none');
  });

  it('shows the explanation once the moment has, and before any dialog', () => {
    expect(askDue(NOW, state)).toBe('pitch');
  });

  /**
   * The case every install of the builds before this one arrives in: asked at
   * sign-in, refused, and holding no local record of anything. **It is owed
   * the explanation too** — the screen is not an accessory to the dialog, and
   * somebody who refused a two-word system prompt is the person most likely
   * never to have been told what it was about.
   */
  it('explains itself to somebody who has already refused', () => {
    expect(askDue(NOW, { ...state, permission: 'denied' })).toBe('pitch');
  });

  /**
   * And still not before the moment has come. The reason is part two's rather
   * than the dialog's: a full screen about being unreachable, shown to
   * somebody who has been here ten seconds and has nobody in the app yet, is
   * an interruption about nothing. The banner covers the meantime.
   */
  it('offers a refused install the banner until then', () => {
    expect(
      askDue(NOW, { ...state, permission: 'denied', ready: false })
    ).toBe('nudge');
  });

  /** Somebody who has read it and refused anyway, which is the daily case. */
  const read = { ...state, permission: 'denied' as const, pitched: true };

  it('says nothing again the same day', () => {
    expect(askDue(NOW, { ...read, nudgedAt: NOW - DAY + 1_000 })).toBe('none');
  });

  it('comes back once the day is up', () => {
    expect(askDue(NOW, { ...read, nudgedAt: NOW - DAY })).toBe('nudge');
  });

  /**
   * Somebody who read the explanation and closed it without answering still
   * has the dialog unspent — so the banner is what returns, and the button on
   * the explanation it opens is still the real one. What must not happen is
   * the app putting the explanation up unbidden a second time.
   */
  it('never puts the explanation up unbidden twice', () => {
    const read = { ...state, pitched: true, nudgedAt: NOW - DAY };
    expect(askDue(NOW, read)).toBe('nudge');
    expect(askDue(NOW, { ...read, permission: 'denied' })).toBe('nudge');
  });
});

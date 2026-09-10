import { shouldReport } from '../attention';
import { ATTENTION_REPORT_MS } from '../../../../core/constants';

/**
 * All that is left of the client's half of attention.
 *
 * **This file used to be the whole rule** — who was audible, who had arrived,
 * whether a hand had touched the page, and when fifteen minutes had passed —
 * held twice, once per platform, and consulted by nobody but the client that
 * held it. The clock is the server's since 2026-09-09, one per account, and
 * the rules moved with it: `core/__tests__/nearby.test.ts` for what the window
 * does, `server/__tests__/presence.test.ts` for when it fires.
 *
 * What is left here is the gate on how often a client says anything, which is
 * worth its own test for one reason: it stands between a scroll gesture and
 * the wire, and getting it wrong is either a message a frame or a window that
 * quietly stops being refreshed.
 */
describe('how often a client says somebody is here', () => {
  const T0 = 1_700_000_000_000;

  it('is due when nothing has been sent on this connection', () => {
    // Zero is not "sent at the epoch"; it is the reset a new socket gets. The
    // first evidence after a reconnection is the most valuable there is, being
    // the one that says the app came back.
    expect(shouldReport(0, T0)).toBe(true);
  });

  it('holds one report per interval, however much evidence arrives', () => {
    expect(shouldReport(T0, T0)).toBe(false);
    expect(shouldReport(T0, T0 + ATTENTION_REPORT_MS - 1)).toBe(false);
    expect(shouldReport(T0, T0 + ATTENTION_REPORT_MS)).toBe(true);
  });

  it('is two orders of magnitude below the heartbeat it rides beside', () => {
    // Not arithmetic for its own sake: the reason this gate exists is that
    // attention is continuous where a message is not, and the number has to
    // stay small against the window it protects and large against the traffic
    // already on the wire.
    expect(ATTENTION_REPORT_MS).toBeGreaterThanOrEqual(10_000);
    expect(ATTENTION_REPORT_MS).toBeLessThanOrEqual(60_000);
  });
});

/**
 * What a report is *about*, which is the half `shouldReport` does not decide.
 *
 * A device attends up to two rooms — the one on screen and the one it is
 * standing in — and the pair is the whole reason the clock is per channel. The
 * plumbing is in `AppProvider.reportAttentive`; what is pinned here is the set
 * it composes, because getting it wrong is silent in both directions: too wide
 * and reading Home holds every room somebody has ever opened, too narrow and
 * the conversation they are in ages while they read the list.
 */
describe('which rooms a report is about', () => {
  const rooms = (lookingAt: string | null, standingIn: string | null) => {
    const set = new Set<string>();
    if (lookingAt) set.add(lookingAt);
    if (standingIn) set.add(standingIn);
    return [...set];
  };

  it('is the channel on screen', () => {
    expect(rooms('chan_a', null)).toEqual(['chan_a']);
  });

  it('is the channel being stood in, even from Home', () => {
    // Presence is a claim actively maintained, and a phone in a hand is what
    // says somebody is still there to maintain it. Reading Home holds the
    // conversation you are in — and nothing else.
    expect(rooms(null, 'chan_a')).toEqual(['chan_a']);
  });

  it('is both, without saying the same room twice', () => {
    expect(rooms('chan_a', 'chan_b')).toEqual(['chan_a', 'chan_b']);
    expect(rooms('chan_a', 'chan_a')).toEqual(['chan_a']);
  });

  it('is nothing at all on Home with nothing held', () => {
    // Attending the application and no room in it. There is no clock that
    // fact belongs to, and `Realtime.attentive` drops the message rather than
    // sending one nothing can be attributed to.
    expect(rooms(null, null)).toEqual([]);
  });
});

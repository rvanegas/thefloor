import { ago, agoOrNull } from '../relativeTime';

describe('how long ago, in words', () => {
  it('uses the library’s conventions rather than ours', () => {
    // Pinned so an upgrade that changes the wording is a failing test rather
    // than something noticed on a phone. The thresholds are the point of
    // taking the dependency — where "a minute" becomes "2 minutes" is a
    // solved problem with unobvious answers.
    expect(ago(3_000)).toBe('a few seconds ago');
    expect(ago(50_000)).toBe('a minute ago');
    expect(ago(5 * 60_000)).toBe('5 minutes ago');
    expect(ago(59 * 60_000)).toBe('an hour ago');
    expect(ago(5 * 3_600_000)).toBe('5 hours ago');
    expect(ago(3 * 86_400_000)).toBe('3 days ago');
    expect(ago(40 * 86_400_000)).toBe('a month ago');
  });

  it('never says something that has happened is about to', () => {
    // These are computed against the server's clock, learned a round trip ago,
    // so a gap of a few hundred milliseconds can arrive negative — and dayjs
    // renders a negative gap in the future tense.
    expect(ago(-5_000)).toBe('a few seconds ago');
    expect(ago(-5_000)).not.toContain('in ');
  });

  it('does not depend on the device clock', () => {
    // The rest of this app goes to some trouble to count against the server's
    // clock; a formatter that quietly read the device's would undo it.
    const first = ago(5 * 60_000);
    const realNow = Date.now;
    Date.now = () => realNow() + 86_400_000;
    try {
      expect(ago(5 * 60_000)).toBe(first);
    } finally {
      Date.now = realNow;
    }
  });

  it('declines to name a gap too small to be worth naming', () => {
    // "A few seconds ago" about somebody who is sitting in the app is
    // technically true and answers a question nobody asked. It also absorbs
    // the heartbeat's worth of staleness in the stored time.
    expect(agoOrNull(0)).toBeNull();
    expect(agoOrNull(59_000)).toBeNull();
    expect(agoOrNull(60_000)).toBe('a minute ago');
  });
});

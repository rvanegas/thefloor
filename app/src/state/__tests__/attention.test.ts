import {
  attend,
  ATTENTION_WINDOW_MS,
  NOT_STANDING,
  touched,
  unattended,
  type Attention,
  type Look,
} from '../attention';

/**
 * The whole of the web timeout, which is worth saying because the hook that
 * uses it is four listeners and an interval against browser globals that
 * nothing here can drive. Every rule about what does and does not hold a tab
 * open is in this file's subject, so it is pinned exhaustively and the
 * plumbing is kept as thin as it can be.
 */

const ME = 'user_me';
const THEM = 'user_them';
const GUEST = 'guest_1';
const CHANNEL = 'chan_1';
const NOW = 1_700_000_000_000;

const look = (over: Partial<Look> = {}): Look => ({
  channelId: CHANNEL,
  me: ME,
  occupants: [ME],
  audible: [],
  ...over,
});

/** Standing in the channel with nothing having happened since `at`. */
const standing = (at: number, others: string[] = []): Attention => ({
  channelId: CHANNEL,
  others,
  heardAt: at,
});

describe('entering', () => {
  it('starts the clock, so somebody who steps in alone times out', () => {
    const clock = attend(NOT_STANDING, look(), NOW);
    expect(clock).toEqual({ channelId: CHANNEL, others: [], heardAt: NOW });
    expect(unattended(clock, NOW + ATTENTION_WINDOW_MS)).toBe(true);
  });

  it('restarts it when the channel changes', () => {
    const stale = standing(NOW);
    const moved = attend(stale, look({ channelId: 'chan_2' }), NOW + ATTENTION_WINDOW_MS);
    expect(moved.channelId).toBe('chan_2');
    expect(moved.heardAt).toBe(NOW + ATTENTION_WINDOW_MS);
  });

  it('disarms when this device is standing nowhere', () => {
    expect(attend(standing(NOW), look({ channelId: null }), NOW)).toEqual(NOT_STANDING);
  });
});

describe('audio', () => {
  it('does not count your own voice', () => {
    const before = standing(NOW, [THEM]);
    const after = attend(
      before,
      look({ occupants: [ME, THEM], audible: [ME] }),
      NOW + 60_000
    );
    expect(after.heardAt).toBe(NOW);
  });

  it('counts somebody else being audible', () => {
    const before = standing(NOW, [THEM]);
    const after = attend(
      before,
      look({ occupants: [ME, THEM], audible: [THEM] }),
      NOW + 60_000
    );
    expect(after.heardAt).toBe(NOW + 60_000);
  });

  it('counts a guest, who is somebody else in the room', () => {
    const before = standing(NOW, [GUEST]);
    const after = attend(
      before,
      look({ occupants: [ME, GUEST], audible: [GUEST] }),
      NOW + 60_000
    );
    expect(after.heardAt).toBe(NOW + 60_000);
  });

  it('reads the set as a state, so uninterrupted speech keeps resetting it', () => {
    let clock = standing(NOW, [THEM]);
    // One `ActiveSpeakersChanged` and nothing after it: the same set, looked
    // at again and again, is what an unbroken minute of talking looks like.
    for (let n = 1; n <= 40; n += 1) {
      clock = attend(
        clock,
        look({ occupants: [ME, THEM], audible: [THEM] }),
        NOW + n * 30_000
      );
    }
    expect(unattended(clock, NOW + 40 * 30_000)).toBe(false);
  });

  it('leaves two silent tabs to expire, which is the case it exists for', () => {
    const clock = attend(
      standing(NOW, [THEM]),
      look({ occupants: [ME, THEM], audible: [] }),
      NOW + ATTENTION_WINDOW_MS
    );
    expect(unattended(clock, NOW + ATTENTION_WINDOW_MS)).toBe(true);
  });
});

describe('the room changing', () => {
  it('counts an arrival', () => {
    const after = attend(
      standing(NOW),
      look({ occupants: [ME, THEM] }),
      NOW + 60_000
    );
    expect(after.heardAt).toBe(NOW + 60_000);
    expect(after.others).toEqual([THEM]);
  });

  it('does not count a departure', () => {
    const after = attend(
      standing(NOW, [THEM]),
      look({ occupants: [ME] }),
      NOW + 60_000
    );
    expect(after.heardAt).toBe(NOW);
    expect(after.others).toEqual([]);
  });

  it('does not count your own arrival', () => {
    const after = attend(
      { channelId: CHANNEL, others: [], heardAt: NOW },
      look({ occupants: [ME] }),
      NOW + 60_000
    );
    expect(after.heardAt).toBe(NOW);
  });
});

describe('the hand', () => {
  it('resets the clock', () => {
    expect(touched(standing(NOW), NOW + 60_000).heardAt).toBe(NOW + 60_000);
  });

  it('is inert when standing nowhere, so a click on Home arms nothing', () => {
    expect(touched(NOT_STANDING, NOW)).toEqual(NOT_STANDING);
  });
});

describe('expiry', () => {
  it('lands exactly on the window', () => {
    const clock = standing(NOW);
    expect(unattended(clock, NOW + ATTENTION_WINDOW_MS - 1)).toBe(false);
    expect(unattended(clock, NOW + ATTENTION_WINDOW_MS)).toBe(true);
  });

  it('never fires on a device standing nowhere', () => {
    expect(unattended(NOT_STANDING, NOW + ATTENTION_WINDOW_MS * 100)).toBe(false);
  });

  it('is fifteen minutes', () => {
    expect(ATTENTION_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

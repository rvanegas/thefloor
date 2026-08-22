/**
 * The channel's clipboard: one slot, replaced rather than appended to, and
 * writable only by somebody who is actually in the channel.
 */
import { MAX_CLIP_LENGTH } from '../constants';
import {
  canClearClip,
  canPasteClip,
  createChannel,
  reduce,
} from '../channel';
import type { Clip, ChannelAction, ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const CLIP: Clip = {
  id: 'clip1',
  authorId: A,
  pastedAt: T0,
  kind: 'text',
  text: 'https://example.com/a-thing',
};

function joined(now = T0): ChannelState {
  return reduce(
    createChannel({ id: 's1', initiator: A, invitees: [B], now }),
    { type: 'ENTER', userId: B },
    now
  );
}

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

function pasted(state: ChannelState, clip: Partial<Clip> = {}): ChannelState {
  return reduce(
    state,
    { type: 'PASTE_CLIP', userId: A, clip: { ...CLIP, ...clip } },
    T0
  );
}

describe('the channel clipboard', () => {
  it('starts empty', () => {
    expect(joined().clip).toBeNull();
  });

  it('holds what somebody present pasted', () => {
    expect(pasted(joined()).clip).toEqual(CLIP);
  });

  it('keeps only the most recent paste', () => {
    const s = pasted(pasted(joined()), {
      id: 'clip2',
      authorId: B,
      text: 'the second thing',
    });
    expect(s.clip?.id).toBe('clip2');
    expect(s.clip?.text).toBe('the second thing');
  });

  it('refuses a paste from somebody who has stepped out', () => {
    const s = apply(joined(), [[{ type: 'STEP_OUT', userId: B }, T0 + 1_000]]);
    const next = reduce(
      s,
      { type: 'PASTE_CLIP', userId: B, clip: { ...CLIP, authorId: B } },
      T0 + 2_000
    );
    expect(next).toBe(s);
    expect(canPasteClip(s, B)).toBe(false);
  });

  it('refuses a paste from somebody who is not in the channel at all', () => {
    const s = joined();
    expect(reduce(s, { type: 'PASTE_CLIP', userId: 'user-c', clip: CLIP }, T0)).toBe(s);
  });

  it('refuses text past the cap rather than trimming it to fit', () => {
    // A name that loses its end is still a name, which is why SET_NAME slices.
    // Half a URL is not a URL.
    const s = joined();
    const next = pasted(s, { text: 'x'.repeat(MAX_CLIP_LENGTH + 1) });
    expect(next).toBe(s);
    expect(next.clip).toBeNull();
  });

  it('accepts text of exactly the cap', () => {
    const text = 'x'.repeat(MAX_CLIP_LENGTH);
    expect(pasted(joined(), { text }).clip?.text).toBe(text);
  });

  it('refuses an empty paste', () => {
    const s = joined();
    expect(pasted(s, { text: '' })).toBe(s);
  });

  it('is emptied by anyone present, not only by whoever filled it', () => {
    const s = pasted(joined());
    expect(canClearClip(s, B)).toBe(true);
    expect(reduce(s, { type: 'CLEAR_CLIP', userId: B }, T0 + 1_000).clip).toBeNull();
  });

  it('treats clearing an empty clipboard as nothing happening', () => {
    const s = joined();
    expect(reduce(s, { type: 'CLEAR_CLIP', userId: A }, T0)).toBe(s);
  });

  it('refuses a clear from somebody who has stepped out', () => {
    const s = apply(pasted(joined()), [
      [{ type: 'STEP_OUT', userId: B }, T0 + 1_000],
    ]);
    expect(reduce(s, { type: 'CLEAR_CLIP', userId: B }, T0 + 2_000)).toBe(s);
  });

  it('survives the floor being claimed by somebody else', () => {
    // Unlike playback: a claim governs what is heard, and a paste is silent.
    const s = apply(joined(), [[{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000]]);
    const next = reduce(
      s,
      { type: 'PASTE_CLIP', userId: B, clip: { ...CLIP, authorId: B } },
      T0 + 2_000
    );
    expect(next.clip?.authorId).toBe(B);
  });

  it('accepts nothing once the channel has ended', () => {
    const ended = apply(joined(), [
      [{ type: 'LEAVE_CHANNEL', userId: A }, T0 + 1_000],
      // The last member cannot leave; ending it is a deletion.
      [{ type: 'DELETE_CHANNEL', userId: B }, T0 + 2_000],
    ]);
    expect(ended.status).toBe('ended');
    expect(canPasteClip(ended, A)).toBe(false);
    expect(reduce(ended, { type: 'PASTE_CLIP', userId: A, clip: CLIP }, T0 + 3_000)).toBe(
      ended
    );
  });
});

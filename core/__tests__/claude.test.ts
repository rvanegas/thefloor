import { CLAUDE_ID } from '../constants';
import { canAskClaude, canPasteClip, createChannel, reduce } from '../channel';
import type { ChannelState, ClaudeAsk } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function bothHere(now = T0): ChannelState {
  let s = createChannel({ id: 's1', initiator: A, invitees: [B], now });
  s = reduce(s, { type: 'ENTER', userId: A }, now);
  return reduce(s, { type: 'ENTER', userId: B }, now);
}

const ask = (askedBy: string, since = T0 + 1): ClaudeAsk => ({ askedBy, since });

describe('asking Claude', () => {
  it('is nobody being asked on a new channel', () => {
    expect(createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }).claude).toBeNull();
  });

  it('is open to anybody here, which is the paste rule', () => {
    const s = bothHere();
    expect(canAskClaude(s, A)).toBe(true);
    expect(canAskClaude(s, B)).toBe(true);
    const out = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 1);
    expect(canPasteClip(out, B)).toBe(false);
    expect(canAskClaude(out, B)).toBe(false);
  });

  it('holds who asked and when, and refuses a second ask while it does', () => {
    const asked = reduce(bothHere(), { type: 'CLAUDE_ASKED', ask: ask(A) }, T0 + 1);
    expect(asked.claude).toEqual({ askedBy: A, since: T0 + 1 });
    expect(canAskClaude(asked, A)).toBe(false);
    expect(canAskClaude(asked, B)).toBe(false);
    expect(reduce(asked, { type: 'CLAUDE_ASKED', ask: ask(B, T0 + 2) }, T0 + 2)).toBe(asked);
  });

  it('refuses an ask from somebody not here', () => {
    const s = reduce(bothHere(), { type: 'STEP_OUT', userId: B }, T0 + 1);
    expect(reduce(s, { type: 'CLAUDE_ASKED', ask: ask(B) }, T0 + 2)).toBe(s);
  });

  it('is cleared by the answer whoever asked, and an answer with nothing out is nothing', () => {
    const s = bothHere();
    const asked = reduce(s, { type: 'CLAUDE_ASKED', ask: ask(B) }, T0 + 1);
    const answered = reduce(asked, { type: 'CLAUDE_ANSWERED' }, T0 + 2);
    expect(answered.claude).toBeNull();
    expect(canAskClaude(answered, A)).toBe(true);
    expect(reduce(s, { type: 'CLAUDE_ANSWERED' }, T0 + 2)).toBe(s);
  });

  it('reads a channel restored from before the field as nobody asked', () => {
    const { claude: _gone, ...old } = bothHere();
    const restored = old as ChannelState;
    expect(canAskClaude(restored, A)).toBe(true);
    expect(reduce(restored, { type: 'CLAUDE_ANSWERED' }, T0 + 1)).toBe(restored);
  });

  it('lets a reply authored by Claude be pasted on the asker’s behalf', () => {
    // The reducer guards the acting user, who is here; it does not tie the
    // author to the actor, which is what lets the server post as Claude.
    const pasted = reduce(
      bothHere(),
      {
        type: 'PASTE_CLIP',
        userId: A,
        clip: { id: 'clip_1', authorId: CLAUDE_ID, pastedAt: T0 + 1, kind: 'text', text: 'Hello.' },
      },
      T0 + 1
    );
    expect(pasted.clip?.authorId).toBe(CLAUDE_ID);
  });
});

describe('the response model', () => {
  it('is standard on a channel nobody has set it on', () => {
    expect(createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }).responseModel).toBe(
      'standard'
    );
  });

  it('is changed by somebody in the room, and changes nothing else', () => {
    const before = bothHere();
    const after = reduce(before, { type: 'SET_RESPONSE_MODEL', userId: A, responseModel: 'pro' }, T0 + 1);
    expect(after.responseModel).toBe('pro');
    expect({ ...after, responseModel: 'standard' }).toEqual(before);
  });

  it('is guarded like the other channel settings', () => {
    // Whether the account has `debug` is the server's half of the rule.
    let s = bothHere();
    s = reduce(s, { type: 'STEP_OUT', userId: A }, T0 + 1);
    expect(reduce(s, { type: 'SET_RESPONSE_MODEL', userId: A, responseModel: 'pro' }, T0 + 2)).toBe(s);
  });

  it('is no change when it would change nothing', () => {
    const s = bothHere();
    expect(reduce(s, { type: 'SET_RESPONSE_MODEL', userId: A, responseModel: 'standard' }, T0 + 1)).toBe(s);
  });

  it('moves independently of the transcription model', () => {
    const s = reduce(bothHere(), { type: 'SET_RESPONSE_MODEL', userId: A, responseModel: 'pro' }, T0 + 1);
    expect(s.transcriptionModel).toBe('standard');
  });
});

import { canSetDiarize, createChannel, isDiarized, reduce } from '../channel';
import { intoBlocks, readable } from '../transcript';
import type { ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const fresh = (): ChannelState =>
  createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });

const set = (state: ChannelState, userId: string, on: boolean) =>
  reduce(state, { type: 'SET_DIARIZE', userId, on }, T0);

/*
  *Several voices*, since 2026-10-16: a member's choice about their own
  microphone, for one sitting. Nobody else's, and gone with the room.
*/
describe('separating the voices on your own microphone', () => {
  it('is off for everybody until somebody asks', () => {
    expect(isDiarized(fresh(), A)).toBe(false);
  });

  it('is switched by the member it is about, both ways', () => {
    const on = set(fresh(), A, true);
    expect(isDiarized(on, A)).toBe(true);
    expect(isDiarized(on, B)).toBe(false);
    expect(isDiarized(set(on, A, false), A)).toBe(false);
  });

  it('is refused to somebody who is not here', () => {
    const state = fresh();
    expect(state.present).not.toContain(B);
    expect(canSetDiarize(state, B)).toBe(false);
    expect(set(state, B, true)).toBe(state);
  });

  it('outlasts a step out that leaves the room standing', () => {
    const both = reduce(set(fresh(), A, true), { type: 'ENTER', userId: B }, T0);
    const away = reduce(both, { type: 'STEP_OUT', userId: A }, T0);
    expect(isDiarized(away, A)).toBe(true);
  });

  it('ends with the room', () => {
    const on = set(fresh(), A, true);
    const empty = reduce(on, { type: 'STEP_OUT', userId: A }, T0);
    expect(empty.present).toHaveLength(0);
    expect(isDiarized(empty, A)).toBe(false);
    const back = reduce(empty, { type: 'ENTER', userId: A }, T0);
    expect(isDiarized(back, A)).toBe(false);
  });
});

const line = (identity: string, startMs: number, speaker: string | null) => ({
  identity,
  startMs,
  endMs: startMs + 1_000,
  text: 'words',
  confidence: null,
  speaker,
});
const names: Record<string, string> = { acct_rod: 'Rodrigo', media: 'Played audio' };
const nameOf = (identity: string) => names[identity] ?? null;

describe('a separated stem, read', () => {
  it('letters each voice where the stem holds more than one', () => {
    const lines = [
      line('media', 0, 'A'),
      line('media', 1_000, 'B'),
      line('acct_rod', 2_000, null),
      line('media', 3_000, 'A'),
    ];
    expect(readable(lines, nameOf).map((l) => l.displayName)).toEqual([
      'Played audio (A)',
      'Played audio (B)',
      'Rodrigo',
      'Played audio (A)',
    ]);
  });

  it('leaves the letter off a separated stem that came back with one voice', () => {
    const lines = [line('acct_rod', 0, 'A'), line('acct_rod', 1_000, 'A')];
    expect(readable(lines, nameOf).map((l) => l.displayName)).toEqual([
      'Rodrigo',
      'Rodrigo',
    ]);
  });

  it('breaks an entry where the voice changes within one stem', () => {
    const lines = [
      line('media', 0, 'A'),
      line('media', 1_000, 'A'),
      line('media', 2_000, 'B'),
    ];
    const blocks = intoBlocks(readable(lines, nameOf));
    expect(blocks.map((b) => [b.displayName, b.lines.length])).toEqual([
      ['Played audio (A)', 2],
      ['Played audio (B)', 1],
    ]);
  });

  it('names nothing it could not name, letter or not', () => {
    const lines = [line('acct_gone', 0, 'A'), line('acct_gone', 1_000, 'B')];
    expect(readable(lines, nameOf).map((l) => l.displayName)).toEqual([null, null]);
  });
});

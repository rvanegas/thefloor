import { MAX_CHANNEL_NAME_LENGTH } from '../constants';
import { createChannel, reduce } from '../channel';
import type { ChannelState } from '../types';

const A = 'usr_a';
const B = 'usr_b';
const T0 = 1_000_000;

function pair(now = T0): ChannelState {
  let s = createChannel({ id: 's1', initiator: A, invitees: [B], now });
  s = reduce(s, { type: 'ENTER', userId: B }, now);
  return s;
}

describe('SET_NAME', () => {
  it('starts unnamed and takes a name from any participant', () => {
    const s = pair();
    expect(s.name).toBeNull();
    const named = reduce(s, { type: 'SET_NAME', userId: B, name: 'Book club' }, T0);
    expect(named.name).toBe('Book club');
  });

  it('trims, caps at the maximum length, and treats empty as clearing', () => {
    let s = pair();
    s = reduce(s, { type: 'SET_NAME', userId: A, name: '  Book club  ' }, T0);
    expect(s.name).toBe('Book club');

    const long = 'x'.repeat(MAX_CHANNEL_NAME_LENGTH + 20);
    s = reduce(s, { type: 'SET_NAME', userId: A, name: long }, T0);
    expect(s.name).toHaveLength(MAX_CHANNEL_NAME_LENGTH);

    s = reduce(s, { type: 'SET_NAME', userId: A, name: '   ' }, T0);
    expect(s.name).toBeNull();
  });

  it('is inert for a non-participant, an unchanged name, and an ended channel', () => {
    const s = pair();
    expect(reduce(s, { type: 'SET_NAME', userId: 'usr_x', name: 'Hi' }, T0)).toBe(s);

    const named = reduce(s, { type: 'SET_NAME', userId: A, name: 'Hi' }, T0);
    expect(reduce(named, { type: 'SET_NAME', userId: B, name: ' Hi ' }, T0)).toBe(
      named
    );

    const ended = reduce(named, { type: 'END', userId: A }, T0 + 1);
    expect(reduce(ended, { type: 'SET_NAME', userId: A, name: 'New' }, T0 + 2)).toBe(
      ended
    );
  });
});

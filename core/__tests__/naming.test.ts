import {
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
} from '../constants';
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

    // One leaves and the last deletes, which is the only way a channel ends.
    const emptied = reduce(named, { type: 'LEAVE_CHANNEL', userId: A }, T0 + 1);
    const ended = reduce(emptied, { type: 'DELETE_CHANNEL', userId: B }, T0 + 2);
    expect(ended.status).toBe('ended');
    expect(reduce(ended, { type: 'SET_NAME', userId: A, name: 'New' }, T0 + 2)).toBe(
      ended
    );
  });
});

describe('SET_DESCRIPTION', () => {
  it('starts empty and takes a description from any participant', () => {
    const s = pair();
    expect(s.description).toBeNull();
    const described = reduce(
      s,
      { type: 'SET_DESCRIPTION', userId: B, description: 'Notes and **links**' },
      T0
    );
    expect(described.description).toBe('Notes and **links**');
  });

  it('keeps the markup exactly as it was typed', () => {
    // The source is what is stored: it is what the writer will edit next time,
    // and rendering it is the client's business, not the reducer's.
    const markup = '# not a heading\n\n[a](https://example.com) *and* `code`';
    const s = reduce(
      pair(),
      { type: 'SET_DESCRIPTION', userId: A, description: markup },
      T0
    );
    expect(s.description).toBe(markup);
  });

  it('trims the ends but never the interior', () => {
    // Interior whitespace is Markdown: a blank line separates paragraphs and
    // two trailing spaces force a break. Collapsing it would rewrite prose.
    const s = reduce(
      pair(),
      { type: 'SET_DESCRIPTION', userId: A, description: '  one\n\n  two  ' },
      T0
    );
    expect(s.description).toBe('one\n\n  two');
  });

  it('caps at the maximum length and treats blank as clearing', () => {
    let s = reduce(
      pair(),
      {
        type: 'SET_DESCRIPTION',
        userId: A,
        description: 'x'.repeat(MAX_CHANNEL_DESCRIPTION_LENGTH + 50),
      },
      T0
    );
    expect(s.description).toHaveLength(MAX_CHANNEL_DESCRIPTION_LENGTH);

    s = reduce(s, { type: 'SET_DESCRIPTION', userId: A, description: ' \n ' }, T0);
    expect(s.description).toBeNull();
  });

  it('is inert for a non-participant, an unchanged value, and an ended channel', () => {
    const s = pair();
    expect(
      reduce(s, { type: 'SET_DESCRIPTION', userId: 'usr_x', description: 'Hi' }, T0)
    ).toBe(s);

    const described = reduce(
      s,
      { type: 'SET_DESCRIPTION', userId: A, description: 'Hi' },
      T0
    );
    expect(
      reduce(described, { type: 'SET_DESCRIPTION', userId: B, description: ' Hi ' }, T0)
    ).toBe(described);

    const emptied = reduce(described, { type: 'LEAVE_CHANNEL', userId: A }, T0 + 1);
    const ended = reduce(emptied, { type: 'LEAVE_CHANNEL', userId: B }, T0 + 2);
    expect(
      reduce(ended, { type: 'SET_DESCRIPTION', userId: A, description: 'New' }, T0 + 3)
    ).toBe(ended);
  });

  it('is independent of the name', () => {
    let s = reduce(pair(), { type: 'SET_NAME', userId: A, name: 'Book club' }, T0);
    s = reduce(s, { type: 'SET_DESCRIPTION', userId: A, description: 'Tuesdays' }, T0);
    expect(s.name).toBe('Book club');
    expect(s.description).toBe('Tuesdays');

    // Clearing one leaves the other alone.
    s = reduce(s, { type: 'SET_NAME', userId: A, name: '' }, T0);
    expect(s.name).toBeNull();
    expect(s.description).toBe('Tuesdays');
  });
});

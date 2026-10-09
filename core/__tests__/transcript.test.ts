import { intoBlocks, readable } from '../transcript';

const line = (identity: string, startMs: number, text = 'words') => ({
  identity,
  startMs,
  endMs: startMs + 1_000,
  text,
  confidence: null,
});

/** The names a transcript is read with, as the server would answer them. */
const names: Record<string, string> = {
  acct_rod: 'Rodrigo',
  acct_ro: 'Rochelle',
  media: 'Played audio',
};
const nameOf = (identity: string) => names[identity] ?? null;

describe('a transcript as it is meant to be read', () => {
  const conversation = [
    line('acct_rod', 0, 'here it is'),
    line('media', 1_000, 'welcome to the programme'),
    line('media', 2_000, 'thank you for having me'),
    line('acct_ro', 3_000, 'Mm-hmm.'),
  ];

  it('names every line after its stem', () => {
    // A stem is one microphone and one voice, so whose stem it is answers who
    // said it — there is no second answer to reconcile with the first.
    expect(readable(conversation, nameOf).map((l) => l.displayName)).toEqual([
      'Rodrigo',
      'Played audio',
      'Played audio',
      'Rochelle',
    ]);
  });

  it('leaves a stem it cannot name unnamed rather than inventing one', () => {
    expect(readable([line('acct_ghost', 0)], nameOf)[0].displayName).toBeNull();
  });

  it('keeps every line, and changes nothing about them', () => {
    const named = readable(conversation, nameOf);
    expect(named.map((l) => l.text)).toEqual(conversation.map((l) => l.text));
  });
});

describe('runs of one speaker as entries', () => {
  const named = (identity: string, startMs: number, text = 'w') => ({
    identity,
    displayName: nameOf(identity),
    startMs,
    endMs: startMs + 1_000,
    text,
  });

  it('collapses consecutive lines from the same stem', () => {
    const blocks = intoBlocks([
      named('acct_rod', 0, 'one'),
      named('acct_rod', 1_000, 'two'),
      named('acct_ro', 2_000, 'three'),
    ]);
    expect(blocks.map((b) => b.lines.map((l) => l.text))).toEqual([['one', 'two'], ['three']]);
  });

  it('makes the names alternate, which is the point of it', () => {
    const blocks = intoBlocks([
      named('acct_rod', 0),
      named('acct_ro', 1),
      named('acct_ro', 2),
      named('acct_ro', 3),
      named('acct_rod', 4),
    ]);
    expect(blocks.map((b) => b.displayName)).toEqual(['Rodrigo', 'Rochelle', 'Rodrigo']);
    for (let n = 1; n < blocks.length; n++) {
      expect(blocks[n].displayName).not.toBe(blocks[n - 1].displayName);
    }
  });

  it('keeps two people apart even when they are called the same thing', () => {
    const alex = (identity: string, startMs: number) => ({
      ...named(identity, startMs),
      displayName: 'Alex',
    });
    expect(intoBlocks([alex('acct_rod', 0), alex('acct_ro', 1_000)])).toHaveLength(2);
  });

  it('keeps every line, with its own time, for jumping', () => {
    const blocks = intoBlocks([named('media', 0), named('media', 7_000)]);
    expect(blocks[0].startMs).toBe(0);
    expect(blocks[0].lines.map((l) => l.startMs)).toEqual([0, 7_000]);
  });

  it('ends where its longest line ends, not where its last one does', () => {
    // Two lines from one stem can overlap; an entry that ended before its own
    // text did would cut a subtitle off mid-sentence.
    const long = { ...named('media', 0), endMs: 20_000 };
    const blocks = intoBlocks([long, named('media', 1_000)]);
    expect(blocks[0].endMs).toBe(20_000);
  });

  it('has nothing to say about nothing', () => {
    expect(intoBlocks([])).toEqual([]);
  });
});

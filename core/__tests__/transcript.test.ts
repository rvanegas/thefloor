import { intoBlocks, multiVoiceStems, voiceName } from '../transcript';

const line = (
  identity: string,
  speaker: string | null,
  startMs: number,
  text = 'words'
) => ({ identity, speaker, startMs, endMs: startMs + 1_000, text, confidence: null });

describe('which stems held more than one voice', () => {
  it('finds the stem the provider labelled twice', () => {
    expect([
      ...multiVoiceStems([
        line('media', 'A', 0),
        line('media', 'B', 1_000),
        line('acct_a', 'A', 2_000),
      ]),
    ]).toEqual(['media']);
  });

  it('says nothing about a stem with one voice, which is nearly all of them', () => {
    // The whole point of asking per stem: `speaker_labels` is on everywhere,
    // so a single label is the confirmation of what the identity already
    // said, and must not become a letter on screen.
    expect(multiVoiceStems([line('acct_a', 'A', 0), line('acct_a', 'A', 9)]).size).toBe(0);
  });

  it('ignores lines the provider did not label at all', () => {
    expect(multiVoiceStems([line('acct_a', null, 0), line('acct_a', 'A', 1)]).size).toBe(0);
  });

  it('is a fact about the transcript, so a voice heard once labels the whole stem', () => {
    // Otherwise the name would change halfway down the page, which reads as
    // two people rather than as one stem with a second voice in it.
    const lines = [line('media', 'A', 0), line('media', 'A', 1), line('media', 'B', 2)];
    const many = multiVoiceStems(lines);
    expect(lines.map((l) => voiceName('Played audio', l.speaker, many.has(l.identity)))).toEqual([
      'Played audio (A)',
      'Played audio (A)',
      'Played audio (B)',
    ]);
  });
});

describe('naming a voice', () => {
  it('leaves a single-voiced stem alone', () => {
    expect(voiceName('Dana Chu', 'A', false)).toBe('Dana Chu');
  });

  it('adds nothing when there is no label to add', () => {
    expect(voiceName('Dana Chu', null, true)).toBe('Dana Chu');
  });
});

describe('runs of one voice as entries', () => {
  it('collapses consecutive lines from the same voice', () => {
    const blocks = intoBlocks([
      line('media', 'A', 0, 'one'),
      line('media', 'A', 1_000, 'two'),
      line('media', 'B', 2_000, 'three'),
    ]);
    expect(blocks.map((b) => b.lines.map((l) => l.text))).toEqual([
      ['one', 'two'],
      ['three'],
    ]);
  });

  it('makes the labels alternate, which is the point of it', () => {
    const blocks = intoBlocks([
      line('media', 'A', 0),
      line('media', 'B', 1),
      line('media', 'B', 2),
      line('media', 'B', 3),
      line('media', 'A', 4),
    ]);
    expect(blocks.map((b) => b.speaker)).toEqual(['A', 'B', 'A']);
    for (let n = 1; n < blocks.length; n++) {
      expect(blocks[n].speaker).not.toBe(blocks[n - 1].speaker);
    }
  });

  it('keeps two people apart even when they share a speaker label', () => {
    // Every stem is labelled independently, so 'A' on one is not 'A' on
    // another. Grouping on the label alone would merge two participants.
    const blocks = intoBlocks([line('acct_a', 'A', 0), line('acct_b', 'A', 1_000)]);
    expect(blocks).toHaveLength(2);
  });

  it('groups a stem the provider never labelled', () => {
    expect(intoBlocks([line('acct_a', null, 0), line('acct_a', null, 1)])).toHaveLength(1);
  });

  it('keeps every line, with its own time, for jumping', () => {
    const blocks = intoBlocks([line('media', 'A', 0), line('media', 'A', 7_000)]);
    expect(blocks[0].startMs).toBe(0);
    expect(blocks[0].lines.map((l) => l.startMs)).toEqual([0, 7_000]);
  });

  it('ends where its longest line ends, not where its last one does', () => {
    // Two utterances from one voice can overlap; an entry that ended before
    // its own text did would cut a subtitle off mid-sentence.
    const long = { ...line('media', 'A', 0), endMs: 20_000 };
    const blocks = intoBlocks([long, line('media', 'A', 1_000)]);
    expect(blocks[0].endMs).toBe(20_000);
  });

  it('has nothing to say about nothing', () => {
    expect(intoBlocks([])).toEqual([]);
  });
});

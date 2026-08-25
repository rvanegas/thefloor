import {
  intoBlocks,
  multiVoiceStems,
  readable,
  voiceKey,
  voiceName,
  voiceRoster,
} from '../transcript';

const line = (
  identity: string,
  speaker: string | null,
  startMs: number,
  text = 'words'
) => ({ identity, speaker, startMs, endMs: startMs + 1_000, text, confidence: null });

/** The names a transcript is read with, as the server would answer them. */
const names: Record<string, string> = {
  acct_rod: 'Rodrigo',
  acct_ro: 'Rochelle',
  media: 'Played audio',
};
const nameOf = (identity: string) => names[identity] ?? null;

describe('which stems held more than one voice', () => {
  it('finds the stem the provider labelled twice', () => {
    expect([
      ...multiVoiceStems([
        line('media', 'A', 0),
        line('media', 'B', 1_000),
        line('acct_rod', 'A', 2_000),
      ]),
    ]).toEqual(['media']);
  });

  it('says nothing about a stem with one voice, which is nearly all of them', () => {
    // The whole point of asking per stem: `speaker_labels` is on everywhere,
    // so a single label is the confirmation of what the identity already
    // said, and must not become a letter on screen.
    expect(multiVoiceStems([line('acct_rod', 'A', 0), line('acct_rod', 'A', 9)]).size).toBe(0);
  });

  it('ignores lines the provider did not label at all', () => {
    expect(multiVoiceStems([line('acct_rod', null, 0), line('acct_rod', 'A', 1)]).size).toBe(0);
  });
});

describe('naming a voice', () => {
  it('leaves a single-voiced stem alone', () => {
    expect(voiceName('Rochelle', 'A', false)).toBe('Rochelle');
  });

  it('adds nothing when there is no label to add', () => {
    expect(voiceName('Rochelle', null, true)).toBe('Rochelle');
  });
});

describe('a transcript as it is meant to be read', () => {
  const interview = [
    line('acct_rod', 'A', 0, 'here it is'),
    line('media', 'A', 1_000, 'welcome to the programme'),
    line('media', 'B', 2_000, 'thank you for having me'),
    line('acct_rod', 'B', 3_000, 'Mm-hmm.'),
  ];

  it('letters the stems that held two voices and no others', () => {
    expect(readable(interview, nameOf).map((l) => l.displayName)).toEqual([
      'Rodrigo (A)',
      'Played audio (A)',
      'Played audio (B)',
      'Rodrigo (B)',
    ]);
  });

  it('takes a declared name over anything it would have worked out', () => {
    const named = readable(interview, nameOf, {
      [voiceKey('media', 'A')]: { name: 'Host' },
      [voiceKey('media', 'B')]: { name: 'Douglas' },
    });
    expect(named.map((l) => l.displayName)).toEqual([
      'Rodrigo (A)',
      'Host',
      'Douglas',
      'Rodrigo (B)',
    ]);
  });

  it('collapses two voices onto one name when both are declared to it', () => {
    const named = readable(interview, nameOf, {
      [voiceKey('acct_rod', 'A')]: { name: 'Rodrigo' },
      [voiceKey('acct_rod', 'B')]: { name: 'Rodrigo' },
    });
    expect(named[0].displayName).toBe('Rodrigo');
    expect(named[3].displayName).toBe('Rodrigo');
  });

  it('drops a removed voice', () => {
    const named = readable(interview, nameOf, {
      [voiceKey('acct_rod', 'B')]: { removed: true },
    });
    expect(named.map((l) => l.text)).not.toContain('Mm-hmm.');
  });

  it('un-letters a stem that removing left holding one voice', () => {
    // The point of removing a spurious label: the evidence that made the
    // letter worth showing is the thing that was just taken away.
    const named = readable(interview, nameOf, {
      [voiceKey('acct_rod', 'B')]: { removed: true },
    });
    expect(named[0].displayName).toBe('Rodrigo');
    // And the stem that really does hold two is untouched by it.
    expect(named[1].displayName).toBe('Played audio (A)');
  });

  it('leaves a stem it cannot name unnamed rather than inventing one', () => {
    expect(readable([line('acct_ghost', 'A', 0)], nameOf)[0].displayName).toBeNull();
  });

  it('changes nothing about the lines themselves', () => {
    // The whole declaration layer is a view. Somebody who gets it wrong
    // re-declares it; nobody re-runs a transcription they paid for.
    const named = readable(interview, nameOf, {
      [voiceKey('media', 'A')]: { name: 'Host' },
    });
    expect(named[1].text).toBe('welcome to the programme');
    expect(named[1].speaker).toBe('A');
    expect(readable(interview, nameOf, {})[1].displayName).toBe('Played audio (A)');
  });
});

describe('runs of one voice as entries', () => {
  const named = (identity: string, displayName: string | null, startMs: number, text = 'w') => ({
    identity,
    displayName,
    startMs,
    endMs: startMs + 1_000,
    text,
  });

  it('collapses consecutive lines under the same name', () => {
    const blocks = intoBlocks([
      named('media', 'Douglas', 0, 'one'),
      named('media', 'Douglas', 1_000, 'two'),
      named('media', 'Host', 2_000, 'three'),
    ]);
    expect(blocks.map((b) => b.lines.map((l) => l.text))).toEqual([['one', 'two'], ['three']]);
  });

  it('makes the names alternate, which is the point of it', () => {
    const blocks = intoBlocks([
      named('media', 'Host', 0),
      named('media', 'Douglas', 1),
      named('media', 'Douglas', 2),
      named('media', 'Douglas', 3),
      named('media', 'Host', 4),
    ]);
    expect(blocks.map((b) => b.displayName)).toEqual(['Host', 'Douglas', 'Host']);
    for (let n = 1; n < blocks.length; n++) {
      expect(blocks[n].displayName).not.toBe(blocks[n - 1].displayName);
    }
  });

  it('rejoins a run that a spurious label had split, once both are declared one name', () => {
    // The reason grouping keys on the name rather than on the label: this is
    // what "collapse these two voices" has to mean, and there is no separate
    // merging step anywhere.
    const lines = [
      line('acct_rod', 'A', 0, 'so I started the recording'),
      line('acct_rod', 'B', 1_000, 'Mm-hmm.'),
      line('acct_rod', 'A', 2_000, 'and here we are'),
    ];
    expect(intoBlocks(readable(lines, nameOf))).toHaveLength(3);
    const collapsed = readable(lines, nameOf, {
      [voiceKey('acct_rod', 'A')]: { name: 'Rodrigo' },
      [voiceKey('acct_rod', 'B')]: { name: 'Rodrigo' },
    });
    expect(intoBlocks(collapsed)).toHaveLength(1);
  });

  it('keeps two people apart even when they are called the same thing', () => {
    // A coincidence of names is not a declaration that they are one voice.
    expect(intoBlocks([named('acct_rod', 'Alex', 0), named('acct_ro', 'Alex', 1_000)])).toHaveLength(2);
  });

  it('keeps every line, with its own time, for jumping', () => {
    const blocks = intoBlocks([named('media', 'Host', 0), named('media', 'Host', 7_000)]);
    expect(blocks[0].startMs).toBe(0);
    expect(blocks[0].lines.map((l) => l.startMs)).toEqual([0, 7_000]);
  });

  it('ends where its longest line ends, not where its last one does', () => {
    // Two utterances from one voice can overlap; an entry that ended before
    // its own text did would cut a subtitle off mid-sentence.
    const long = { ...named('media', 'Host', 0), endMs: 20_000 };
    const blocks = intoBlocks([long, named('media', 'Host', 1_000)]);
    expect(blocks[0].endMs).toBe(20_000);
  });

  it('has nothing to say about nothing', () => {
    expect(intoBlocks([])).toEqual([]);
  });
});

describe('the roster the naming screen reads', () => {
  const lines = [
    line('acct_rod', 'A', 0, 'so I started the recording'),
    line('acct_rod', 'B', 1_000, 'Mm-hmm.'),
    line('acct_rod', 'B', 1_500, 'Yeah.'),
    line('media', 'A', 2_000, 'welcome to the programme'),
    line('media', 'B', 3_000, 'thank you for having me'),
  ];

  it('lists every voice, with what it holds and what it first said', () => {
    const roster = voiceRoster(lines, nameOf);
    expect(roster.map((v) => [v.displayName, v.lines, v.sample])).toEqual([
      ['Rodrigo (A)', 1, 'so I started the recording'],
      ['Rodrigo (B)', 2, 'Mm-hmm.'],
      ['Played audio (A)', 1, 'welcome to the programme'],
      ['Played audio (B)', 1, 'thank you for having me'],
    ]);
  });

  it('keeps a removed voice on the list, or removing would be final', () => {
    const roster = voiceRoster(lines, nameOf, {
      [voiceKey('acct_rod', 'B')]: { removed: true },
    });
    const gone = roster.find((v) => v.key === voiceKey('acct_rod', 'B'));
    expect(gone).toBeDefined();
    expect(gone!.lines).toBe(2);
    expect(gone!.declaration).toEqual({ removed: true });
  });

  it('says what each voice would go back to being', () => {
    // What the screen offers as "clear this": the default is a thing to show,
    // not a thing the person has to remember.
    const roster = voiceRoster(lines, nameOf, {
      [voiceKey('media', 'B')]: { name: 'Douglas' },
    });
    const douglas = roster.find((v) => v.key === voiceKey('media', 'B'))!;
    expect(douglas.displayName).toBe('Douglas');
    expect(douglas.defaultName).toBe('Played audio (B)');
  });

  it('hands back the key to declare against, so nobody builds one', () => {
    const roster = voiceRoster(lines, nameOf);
    expect(roster[0].key).toBe(voiceKey('acct_rod', 'A'));
    expect(roster[0].identity).toBe('acct_rod');
    expect(roster[0].speaker).toBe('A');
  });
});

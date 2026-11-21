import {
  plainWord,
  readingProgress,
  sentenceAt,
  sentencesOf,
  speakableText,
  type TimedWord,
} from '../reading';

/** Words as the provider times them: each token of `text`, 100 ms apart. */
function timedAll(text: string, gapMs = 100): TimedWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ word, startMs: index * gapMs, endMs: index * gapMs + 80 }));
}

describe('speakableText', () => {
  it('leaves out what has nothing to say', () => {
    const markdown = [
      '---',
      'title: x',
      '---',
      '# Heading',
      '',
      'See [the page](https://example.com) and ![a chart](c.png).',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '<!-- a note -->Done.',
    ].join('\n');
    expect(speakableText(markdown)).toBe('# Heading\n\nSee the page and .\n\nDone.');
  });
});

describe('plainWord', () => {
  it('takes the markup out of a token', () => {
    expect(plainWord('##')).toBe('');
    expect(plainWord('-')).toBe('');
    expect(plainWord('1.')).toBe('');
    expect(plainWord('*friend*.')).toBe('friend.');
    expect(plainWord('`code`')).toBe('code');
  });
});

describe('sentencesOf', () => {
  it('matches the words the API returned on 2026-11-20 one to one', () => {
    // The probe's text and its WordBoundaries, as AssemblyAI answered.
    const text = '## A heading\n\nHello, *friend*. It costs $3.50 on 2026-11-20 — e.g. twice.';
    const words: TimedWord[] = [
      ['##', 113, 113],
      ['A', 113, 129],
      ['heading', 194, 469],
      ['Hello,', 905, 1164],
      ['*friend*.', 1245, 1439],
      ['It', 1908, 1973],
      ['costs', 1973, 2345],
      ['$3.50', 2361, 3380],
      ['on', 3574, 3687],
      ['2026-11-20', 3687, 5563],
      ['—', 5563, 5563],
      ['e.g.', 5774, 6582],
      ['twice.', 6663, 7003],
    ].map(([word, startMs, endMs]) => ({ word: word as string, startMs: startMs as number, endMs: endMs as number }));

    expect(sentencesOf(text, words)).toEqual([
      { startMs: 113, endMs: 469, text: 'A heading' },
      { startMs: 905, endMs: 1439, text: 'Hello, friend.' },
      { startMs: 1908, endMs: 7003, text: 'It costs $3.50 on 2026-11-20 — e.g. twice.' },
    ]);
  });

  it('ends a sentence at a list item and at a paragraph', () => {
    const text = 'Two things\n- first one\n- second one\n\nAfter';
    const sentences = sentencesOf(text, timedAll(text));
    expect(sentences.map((s) => s.text)).toEqual(['Two things', 'first one', 'second one', 'After']);
  });

  it('keeps a wrapped line inside its paragraph', () => {
    const text = 'One sentence that\nwraps onto a second line.';
    expect(sentencesOf(text, timedAll(text)).map((s) => s.text)).toEqual([
      'One sentence that wraps onto a second line.',
    ]);
  });

  it('places a request at its offset', () => {
    const text = 'Later words.';
    expect(sentencesOf(text, timedAll(text), 60_000)).toEqual([
      { startMs: 60_000, endMs: 60_180, text: 'Later words.' },
    ]);
  });

  it('survives a word the provider spelled differently', () => {
    const text = 'Alpha beta gamma. Delta.';
    const words = timedAll(text);
    words[1] = { ...words[1], word: 'BETA' };
    words.splice(2, 0, { word: 'extra', startMs: 150, endMs: 160 });
    const sentences = sentencesOf(text, words);
    expect(sentences.map((s) => s.text)).toEqual(['Alpha beta gamma.', 'Delta.']);
    expect(sentences[1].startMs).toBeGreaterThan(sentences[0].startMs);
  });
});

describe('sentenceAt and readingProgress', () => {
  const sentences = [
    { startMs: 0, endMs: 900, text: 'a' },
    { startMs: 1000, endMs: 1900, text: 'b' },
    { startMs: 2000, endMs: 2900, text: 'c' },
    { startMs: 3000, endMs: 3900, text: 'd' },
  ];

  it('finds the sentence begun last', () => {
    expect(sentenceAt(sentences, -1)).toBe(-1);
    expect(sentenceAt(sentences, 0)).toBe(0);
    expect(sentenceAt(sentences, 1950)).toBe(1);
    expect(sentenceAt(sentences, 99_999)).toBe(3);
  });

  it('says how far through the document it is', () => {
    expect(readingProgress(sentences, 1500)).toBe(50);
    expect(readingProgress([], 0)).toBe(0);
  });
});

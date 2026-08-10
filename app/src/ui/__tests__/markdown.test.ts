import { isSafeUrl, parseInline } from '../markdown';

/**
 * The parser is the part of the description feature with edge cases, so it is
 * asserted directly rather than through a render. Two properties matter beyond
 * "the formatting works": text that does not parse must survive as text, and a
 * link nobody should follow must not become tappable.
 */

/** Flattens spans to `text` so a case can assert what a reader sees. */
const textOf = (source: string) =>
  parseInline(source)
    .map((span) => span.text)
    .join('');

const linksIn = (source: string) =>
  parseInline(source).flatMap((span) =>
    span.kind === 'link' ? [{ text: span.text, url: span.url }] : []
  );

describe('inline formatting', () => {
  it('reads bold, italic, strikethrough and code', () => {
    expect(parseInline('**bold**')[0].style).toContainEqual({
      fontWeight: '700',
    });
    expect(parseInline('*italic*')[0].style).toContainEqual({
      fontStyle: 'italic',
    });
    expect(parseInline('~~gone~~')[0].style).toContainEqual({
      textDecorationLine: 'line-through',
    });
    // Code carries a style, and its text is verbatim.
    expect(textOf('`x = *y*`')).toBe('x = *y*');
  });

  it('prefers the longer delimiter, so ** is never two italics', () => {
    const [span] = parseInline('**bold**');
    expect(span.text).toBe('bold');
    expect(span.style).toContainEqual({ fontWeight: '700' });
    expect(span.style).not.toContainEqual({ fontStyle: 'italic' });
  });

  it('nests emphasis inside emphasis', () => {
    const spans = parseInline('**bold and *both* **');
    const both = spans.find((s) => s.text === 'both');
    expect(both?.style).toContainEqual({ fontWeight: '700' });
    expect(both?.style).toContainEqual({ fontStyle: 'italic' });
  });

  it('leaves an unclosed delimiter as the character somebody typed', () => {
    // The alternative — treating it as an open emphasis — would silently
    // reformat the rest of the description.
    expect(textOf('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(textOf('**not closed')).toBe('**not closed');
  });

  it('honours a backslash escape', () => {
    expect(textOf('\\*not italic\\*')).toBe('*not italic*');
  });

  it('keeps surrounding prose intact', () => {
    expect(textOf('read **this** and *that* now')).toBe(
      'read this and that now'
    );
  });
});

describe('links', () => {
  it('turns [label](url) into a link carrying its target', () => {
    expect(linksIn('see [the notes](https://example.com/n)')).toEqual([
      { text: 'the notes', url: 'https://example.com/n' },
    ]);
  });

  it('formats inside a label', () => {
    const spans = parseInline('[**bold** link](https://example.com)');
    const bold = spans.find((s) => s.text === 'bold');
    expect(bold?.kind).toBe('link');
    expect(bold?.style).toContainEqual({ fontWeight: '700' });
  });

  it('refuses a scheme that is not http, https or mailto', () => {
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>',
      'tel:+15550000000',
    ]) {
      expect(isSafeUrl(url)).toBe(false);
      // The label still reads as text — a refused link leaves a sentence whole
      // rather than a hole in it — but nothing is tappable.
      expect(linksIn(`[tap](${url})`)).toEqual([]);
      expect(textOf(`[tap](${url})`)).toBe('tap');
    }
  });

  it('accepts the schemes a description legitimately needs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:someone@example.com')).toBe(true);
  });

  it('leaves a bare domain as text rather than guessing a scheme', () => {
    expect(isSafeUrl('example.com')).toBe(false);
    expect(linksIn('[here](example.com)')).toEqual([]);
  });

  it('keeps parentheses that belong to the URL', () => {
    // Balancing rather than taking the first ')' — otherwise every Wikipedia
    // article with a disambiguation suffix loses its tail, and the leftover
    // bracket lands in the prose.
    expect(
      linksIn('[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet))')
    ).toEqual([
      { text: 'Mercury', url: 'https://en.wikipedia.org/wiki/Mercury_(planet)' },
    ]);
    expect(
      textOf('[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet)) orbits')
    ).toBe('Mercury orbits');
  });

  it('leaves an unterminated link as text', () => {
    expect(textOf('[label](https://example.com')).toBe(
      '[label](https://example.com'
    );
  });
});

describe('plain text', () => {
  it('passes through untouched', () => {
    expect(textOf('Just a sentence.')).toBe('Just a sentence.');
  });

  it('keeps newlines, which Markdown treats as significant', () => {
    expect(textOf('one\n\ntwo')).toBe('one\n\ntwo');
  });

  it('is empty for an empty source', () => {
    expect(parseInline('')).toEqual([]);
  });
});

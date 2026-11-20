import { callLine, shownSteps, workingCounts, type KeptStep } from '../working';

/**
 * What the room is shown of Claude's working: noesis's answers, as the
 * server kept them beside a reply, read back into searches, reads and
 * failures. The texts are noesis's own shapes (noesis/library.py
 * `lookup_term`, noesis/mcp_server.py `list_documents`).
 */

const LOOKUP = [
  'artificial cognition',
  '  Documents:',
  '    2026/2026-11-07-mem-architecture-summary.document.md — Mem Architecture Summary — 4200w',
  '      Three domains, and functional similarity is not phenomenal similarity.',
  '    2026/2026-10-01-old.chat.md — An Old Chat',
  '  Related: consciousness; functionalism',
].join('\n');

const step = (tool: string, input: Record<string, unknown>, kept: string | null, library: string | null = 'alice/tech'): KeptStep => ({
  tool,
  library,
  input,
  kept,
});

describe("Claude's working, as the room sees it", () => {
  it('reads a lookup into its hits, each with its summary, and the term’s Related', () => {
    const [shown] = shownSteps([step('lookup_term', { term: 'artificial cognition' }, LOOKUP)]);
    expect(shown).toEqual({
      kind: 'search',
      term: 'artificial cognition',
      library: 'alice/tech',
      hits: [
        {
          name: '2026/2026-11-07-mem-architecture-summary.document.md',
          title: 'Mem Architecture Summary',
          words: 4200,
          summary: 'Three domains, and functional similarity is not phenomenal similarity.',
          library: 'alice/tech',
        },
        { name: '2026/2026-10-01-old.chat.md', title: 'An Old Chat', words: null, summary: null, library: 'alice/tech' },
      ],
      related: ['consciousness', 'functionalism'],
      call: 'lookup_term(term="artificial cognition") in alice/tech',
    });
  });

  it('gives each hit the library it came from where a lookup covered several', () => {
    const text = `# Library alice/tech\n\n${LOOKUP}\n\n# Library bob/essays\n\nTerm not found: 'artificial cognition'`;
    const [shown] = shownSteps([step('lookup_term', { term: 'artificial cognition' }, text, null)]);
    expect(shown.kind === 'search' && shown.hits.map((hit) => hit.library)).toEqual(['alice/tech', 'alice/tech']);
  });

  it('reads a listing, its library bracketed, and one with no query as listing them all', () => {
    const text = 'a.document.md — A [alice/tech]\nb.chat.md — B (not yet indexed) [bob/essays]';
    const [shown] = shownSteps([step('list_documents', {}, text, null)]);
    expect(shown).toMatchObject({
      kind: 'search',
      term: null,
      hits: [
        { name: 'a.document.md', title: 'A', library: 'alice/tech' },
        { name: 'b.chat.md', title: 'B', library: 'bob/essays' },
      ],
    });
  });

  it('names a read by its heading, else the documents the room let it read, else the search; its path from the search', () => {
    const shown = shownSteps(
      [
        step('lookup_term', { term: 'artificial cognition' }, LOOKUP),
        step('read_file', { name: '2026-11-07-mem-architecture-summary' }, 'read in full: 4200 words'),
        step('read_file', { name: 'x.document.md' }, 'read in full: 12 words, headed "Its Own Heading"'),
        step('read_file', { name: 'y.document.md' }, 'read in full: 3 words'),
      ],
      [{ name: 'y.document.md', title: 'Chosen By The Room' }]
    );
    expect(shown.slice(1)).toEqual([
      {
        kind: 'read',
        name: '2026/2026-11-07-mem-architecture-summary.document.md',
        title: 'Mem Architecture Summary',
        library: 'alice/tech',
        words: 4200,
        call: 'read_file(name="2026-11-07-mem-architecture-summary") in alice/tech',
      },
      expect.objectContaining({ name: 'x.document.md', title: 'Its Own Heading', words: 12 }),
      expect.objectContaining({ name: 'y.document.md', title: 'Chosen By The Room', words: 3 }),
    ]);
  });

  it('shows a failure with its error whole, and leaves out the guide', () => {
    const shown = shownSteps([
      step('guide', {}, null),
      { ...step('read_file', { name: 'x.document.md' }, null, null), error: 'name the library: one of a, b' },
    ]);
    expect(shown).toEqual([
      { kind: 'failed', subject: 'x.document.md', error: 'name the library: one of a, b', call: 'read_file(name="x.document.md")' },
    ]);
    expect(workingCounts(shown)).toEqual({ searches: 0, reads: 0, failed: 1 });
  });

  it('writes the call as sent, the library after it rather than among the arguments', () => {
    expect(callLine(step('read_file', { name: 'x', library: 'alice/tech' }, null))).toBe('read_file(name="x") in alice/tech');
  });
});

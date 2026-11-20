import type { FoundDocument, WorkingStepView } from './protocol';

/**
 * **What the room is shown of Claude's working**, since 2026-11-20: the
 * library calls the server kept beside a reply (`workingSteps` in
 * server/src/claude.ts), turned into searches, reads and failures. Here
 * rather than in the server because the app counts and words them, and the
 * filed transcript writes the same summary the room reads. See
 * planning/decision/2026-11-20-claude-s-working-is-kept-with-its-reply-and-the-room-is-shown-it.md.
 *
 * It reads noesis's answers as noesis writes them (`lookup_term` and
 * `list_documents` in noesis/mcp_server.py and noesis/library.py), so a
 * change there is a change here. A line it does not recognise is passed
 * over rather than shown wrong: the *Record* keeps the text whole anyway.
 */

/** A kept step, as the server stores it in `pastes.working`. */
export interface KeptStep {
  tool: string;
  library: string | null;
  input: Record<string, unknown>;
  kept: string | null;
  error?: string;
}

/** A document the room let Claude read, as `pastes.documents` keeps it: its title alone is wanted. */
export interface KeptTitle {
  name: string;
  title?: string;
}

/** The call as sent, as the *Record* writes it: drawn only under `debug`. */
export function callLine(step: KeptStep): string {
  const args = Object.entries(step.input)
    .filter(([key]) => key !== 'library')
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return `${step.tool}(${args.join(', ')})${step.library ? ` in ${step.library}` : ''}`;
}

const SEARCHES = new Set(['lookup_term', 'list_documents']);
const READS = new Set(['read_file', 'read_document']);

/** `2026/x.document.md — Title — 4200w`, a lookup's hit line. */
const HIT = /^(\S.*?) — (.+?)(?: — (\d+)w)?$/;
/** `x.document.md — Title (not yet indexed) [alice/tech]`, a listing's line. */
const LISTED = /^(\S.*?) — (.+?)(?: \(not yet indexed\))?(?: \[([^\]]+)\])?$/;
/** `read in full: 4200 words, headed "Title"`, what `keptOf` keeps of a read. */
const READ = /^read in full: (\d+) words(?:, headed "(.*)")?$/;

/** A lookup's text, one library's or several under `# Library <id>`. */
function lookupHits(text: string, library: string | null): { hits: FoundDocument[]; related: string[] } {
  const hits: FoundDocument[] = [];
  const related: string[] = [];
  let within = library;
  for (const line of text.split('\n')) {
    const heading = /^# Library (\S+)\s*$/.exec(line);
    if (heading) {
      within = heading[1];
      continue;
    }
    const relatedLine = /^ {2}Related: (.*)$/.exec(line);
    if (relatedLine) {
      for (const term of relatedLine[1].split(';').map((each) => each.trim())) {
        if (term && !related.includes(term)) related.push(term);
      }
      continue;
    }
    const hit = /^ {4}(?! )(.*)$/.exec(line);
    if (hit) {
      const found = HIT.exec(hit[1].trim());
      if (!found) continue;
      hits.push({
        name: found[1],
        title: found[2],
        words: found[3] ? Number(found[3]) : null,
        summary: null,
        library: within,
      });
      continue;
    }
    const summary = /^ {6}(.*)$/.exec(line);
    if (summary && hits.length > 0) {
      const last = hits[hits.length - 1];
      const said = summary[1].trim();
      last.summary = last.summary ? `${last.summary} ${said}` : said;
    }
  }
  return { hits, related };
}

/** A listing's text: one document a line, its library bracketed where several were searched. */
function listedHits(text: string, library: string | null): FoundDocument[] {
  return text.split('\n').flatMap((line) => {
    const found = LISTED.exec(line.trim());
    if (!found) return [];
    return [{ name: found[1], title: found[2], words: null, summary: null, library: found[3] ?? library }];
  });
}

/** The last part of a path, which is what Claude usually names a document by. */
const base = (name: string) => name.split('/').pop() ?? name;

/** Whether `asked` names `hit`: its path, its file name, or its stem. */
const names = (asked: string, hit: FoundDocument) =>
  hit.name === asked || base(hit.name) === base(asked) || base(hit.name).replace(/\.[^.]+\.[^.]+$/, '') === base(asked);

/**
 * A reply's kept steps as the room sees them, in the order made. The guide
 * is left out, being the same every time and nothing a room would read; so
 * is any tool this does not know. A read takes its title from the read
 * itself, else from `documents` (what the room let it read), else from a
 * search earlier in the same reply; and its path from that search, so that
 * noesis's web client can open it.
 */
export function shownSteps(
  kept: readonly KeptStep[],
  documents: readonly KeptTitle[] = []
): WorkingStepView[] {
  const shown: WorkingStepView[] = [];
  const found: FoundDocument[] = [];
  for (const step of kept) {
    const call = callLine(step);
    const searching = SEARCHES.has(step.tool);
    const reading = READS.has(step.tool);
    if (!searching && !reading) continue;
    const asked = String(
      (searching ? (step.input.term ?? step.input.query) : (step.input.name ?? step.input.path)) ?? ''
    );
    if (step.error) {
      shown.push({ kind: 'failed', subject: asked, error: step.error, call });
      continue;
    }
    if (searching) {
      const term = asked || null;
      const text = step.kept ?? '';
      const { hits, related } =
        step.tool === 'lookup_term'
          ? lookupHits(text, step.library)
          : { hits: listedHits(text, step.library), related: [] };
      found.push(...hits);
      shown.push({ kind: 'search', term, library: step.library, hits, related, call });
      continue;
    }
    const read = READ.exec(step.kept ?? '');
    const hit = found.find((each) => names(asked, each));
    const title =
      read?.[2] || documents.find((each) => each.name === asked)?.title || hit?.title || null;
    shown.push({
      kind: 'read',
      name: hit?.name ?? asked,
      title,
      library: step.library ?? hit?.library ?? null,
      words: read ? Number(read[1]) : null,
      call,
    });
  }
  return shown;
}

/** How many of each kind, for the line under the reply. */
export function workingCounts(steps: readonly WorkingStepView[]): {
  searches: number;
  reads: number;
  failed: number;
} {
  return {
    searches: steps.filter((each) => each.kind === 'search').length,
    reads: steps.filter((each) => each.kind === 'read').length,
    failed: steps.filter((each) => each.kind === 'failed').length,
  };
}

import type Anthropic from '@anthropic-ai/sdk';

import { CLAUDE_ID } from '../../core/constants';
import type { FiledView, RoomView, SegmentView } from '../../core/protocol';
import type { ChannelState, ReplyLength, ResponseModel } from '../../core/types';
import { lettered } from '../../core/transcript';
import { newId, type Db } from './db';
import { readableLines, type TranscriptLine } from './transcripts';

/**
 * **Claude in a conversation**, since 2026-10-22: somebody present presses
 * *Ask Claude* on the *Record* bar, and this reads the channel's *Record* as text,
 * asks Anthropic for one turn, and posts the answer into the *Record* as a
 * paste authored by `CLAUDE_ID`. The design, and the reason for every number
 * below, is planning/decision/2026-10-22-claude-joins-the-conversation-as-a-paste-in-the-record.md.
 *
 * Optional in the way transcription is: without `ANTHROPIC_API_KEY` there is
 * no client, no card, no route that answers anything but 503, and nothing on
 * `/privacy` about it.
 */

/** One grade of *Response model*: which model, how hard it thinks, how long. */
export interface ResponseGrade {
  model: string;
  effort: 'low' | 'medium' | 'high';
  /**
   * A ceiling on the whole answer, thinking included — never its intended
   * length, which is the prompt's word cap — *Extended*'s 450 at the most.
   * Only tokens generated are billed, so headroom here costs nothing.
   */
  maxTokens: number;
  /**
   * Whether the request carries the server-side refusal fallback. Sonnet 5.5
   * and Opus 5.5 take its `"default"` form on the Claude API; Haiku has none.
   */
  fallback: boolean;
}

/**
 * What each grade asks, as `ASSEMBLYAI_MODELS` is for transcription — and no
 * environment override: a setting the app shows everybody should not be
 * contradicted by a file on the box.
 *
 * **Both at low effort**, Rodrigo's call over medium for *Pro*: thinking is
 * generated before the reply, so every thinking token is added to the wait
 * under *Responding…*, and a turn in a conversation is judgement rather than
 * a chain of reasoning. *Pro*'s gain is meant to come from the larger model.
 * Effort is sent explicitly because Sonnet 5.5 defaults to `high` and Haiku
 * 5.5 to `medium`.
 *
 * ***Max*, since 2026-10-22, is Opus 5.5 at medium** — Rodrigo's call, the
 * one grade that buys thinking as well as size, and so the slowest under
 * *Responding…*. Medium is Opus 5.5's own default, sent anyway so the table
 * says it. Its ceiling is the largest because medium thinks the most.
 */
export const RESPONSE_MODELS: Record<ResponseModel, ResponseGrade> = {
  // 3072 since *Extended* became 450 words, about 600 tokens before any thinking.
  standard: { model: 'claude-haiku-5-5', effort: 'low', maxTokens: 3072, fallback: false },
  pro: { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4096, fallback: true },
  max: { model: 'claude-opus-5-5', effort: 'medium', maxTokens: 8192, fallback: true },
};

/** The beta that the refusal fallback's `"default"` form is under. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Either response type, the plain endpoint's or the beta's. */
type Reply = Anthropic.Message | Anthropic.Beta.Messages.BetaMessage;

/**
 * How many times a press resumes a turn the connector paused — each pause
 * being ten rounds of lookups already. A turn still paused after these posts
 * what it has, which is likely nothing, and says so as an empty reply does.
 */
export const LIBRARY_CONTINUATIONS = 2;

/** The beta the Messages API's MCP connector is under. See `libraryRequest`. */
export const MCP_BETA = 'mcp-client-2025-11-20';

/**
 * What a library's MCP server is called inside one request: `noesis` for the
 * first owner's, `noesis-2` and on for the others', the API requiring each
 * server's name be unique.
 */
export const LIBRARY_SERVER_NAME = 'noesis';

export function libraryServerName(index: number): string {
  return index === 0 ? LIBRARY_SERVER_NAME : `${LIBRARY_SERVER_NAME}-${index + 1}`;
}

/**
 * The library's tools a press may use: noesis's reading tools, and nothing else.
 * **An allowlist although noesis's server writes nothing today** — noesis plans more
 * tools, and one it adds should reach a room by a decision here, not by a
 * deploy there.
 */
export const LIBRARY_TOOLS = [
  'guide',
  'list_documents',
  'lookup_term',
  'read_document',
  'read_file',
] as const;

/**
 * The two request fields that hand the libraries to Claude, which must
 * travel together: a server per owner, with that owner's token, and a
 * toolset naming each — every tool off by default, then the reading ones on.
 * Anthropic's servers call noesis with each token and run the tool loop inside
 * the one request.
 */
export function libraryRequest(libraries: readonly ConsultedLibrary[]) {
  return {
    mcp_servers: libraries.map((library, index) => ({
      type: 'url' as const,
      url: library.url,
      name: libraryServerName(index),
      authorization_token: library.token,
    })),
    tools: libraries.map((_, index) => ({
      type: 'mcp_toolset' as const,
      mcp_server_name: libraryServerName(index),
      default_config: { enabled: false },
      configs: Object.fromEntries(LIBRARY_TOOLS.map((tool) => [tool, { enabled: true }])),
    })),
  };
}

/**
 * How much *Record* one request carries: 90,000 tokens, which keeps the whole
 * prompt under the 100K tokens past which Haiku 5.5 costs five times as much.
 * Spoken conversation runs about 12–13K tokens an hour, so this is about
 * seven hours of talk. The same for both grades, so the prompt is the same
 * whichever model reads it.
 */
export const RECORD_BUDGET_TOKENS = 90_000;

/**
 * Counted as characters rather than by a `count_tokens` round trip before
 * every press. 3.5 to the token is an estimate; `claude_usage.input_tokens`
 * is what calibrates it, which matters for Spanish.
 */
export const CHARS_PER_TOKEN = 3.5;

export const RECORD_BUDGET_CHARS = Math.floor(RECORD_BUDGET_TOKENS * CHARS_PER_TOKEN);

/**
 * How much of the *Record* a press that consults the channel's own library
 * carries in full: 40,000 tokens, about three hours of talk — Rodrigo's call,
 * 2026-11-07. What is older and already filed there goes as one line naming
 * its document (`composeLibraryRecord`), since Claude can read it whole when
 * the conversation turns to it, and every model turn of a lookup re-reads the
 * whole prompt.
 */
export const LIBRARY_RECORD_BUDGET_TOKENS = 40_000;

export const LIBRARY_RECORD_BUDGET_CHARS = Math.floor(LIBRARY_RECORD_BUDGET_TOKENS * CHARS_PER_TOKEN);

/**
 * How long a room may wait on *Responding…* before the request is abandoned
 * and the card goes back to *Ask Claude*. One request per press and no retry
 * of the press — the SDK's own retries of a failed connection fall inside
 * this, since they share its signal.
 */
export const CLAUDE_TIMEOUT_MS = 60_000;

/**
 * The same, for a press that consults the library: several model turns in
 * one request, lookups between them, possibly a resumed pause and a retry
 * without noesis — all inside this one timer. The card says *Responding…*
 * throughout, so the room is told it is waiting.
 */
export const CLAUDE_LIBRARY_TIMEOUT_MS = 120_000;

/**
 * **The length is an instruction, stated as a hard limit, and stated twice**
 * — Rodrigo's call: nothing trims a reply, so keeping it short is the
 * prompt's job. Both statements give the reason as well as the rule, because
 * a model given the reason applies it to cases the rule did not name, and
 * neither claims that a longer reply will be cut, because it will not be.
 *
 * **Three caps since 2026-10-22, one per button** — 30, 90 and 270 until
 * 2026-10-27, when Rodrigo made them 50, 150 and 450. The sentences are a shape to aim at, which a word count alone does
 * not give a model.
 */
export const REPLY_WORD_LIMITS: Record<ReplyLength, { words: number; shape: string }> = {
  brief: { words: 50, shape: 'two or three sentences' },
  medium: { words: 150, shape: 'a short paragraph' },
  extended: { words: 450, shape: 'a few paragraphs' },
};

/**
 * What a press asks for when it names no length: *Medium*, the
 * middle of the three, as builds before the three buttons asked for a hundred. For builds up to
 * 387, which send no body — planning/SHIMS.md, gate 388.
 */
export const DEFAULT_REPLY_LENGTH: ReplyLength = 'medium';

export const isReplyLength = (value: unknown): value is ReplyLength =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(REPLY_WORD_LIMITS, value);

/**
 * The asker's voices as a press sends them, or undefined for anything else —
 * an object of at most a few two- or three-letter subtags, each naming an
 * identifier of a sensible length. Never refused: a press with voices this
 * cannot read is still a press, and every phone then reads in its own.
 */
export function readVoices(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    ([language, voice]) =>
      /^[a-z]{2,3}$/.test(language) &&
      typeof voice === 'string' &&
      voice.length > 0 &&
      voice.length <= 200
  );
  if (entries.length === 0 || entries.length > 4) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

export function lengthRule(length: ReplyLength): string {
  const { words, shape } = REPLY_WORD_LIMITS[length];
  return (
    `Your reply must be at most ${words} words — ${shape}. ` +
    'This is a hard limit, not a target: it is one turn in a live conversation ' +
    'that people are waiting on, and they will read it at a glance.'
  );
}

/**
 * **What every library rule says about earlier calls and acting now**, since
 * 2026-11-07: that the record of a reply's calls is all a press has of them,
 * since one with no record described calls it never made; that the reply is
 * the whole turn, since presses twice said they would look something up and
 * made no call; and the record's `library`, which noesis's reads refuse to go
 * without where a server opens more than one. Only in the library rules, so
 * a plain press's prompt is what it was.
 */
export const LOOK_NOW =
  'Above an earlier reply that consulted a library is the server’s record of the calls you ' +
  'made for it and what each returned: it is exact, and it is all you have of them — you ' +
  'remember nothing else of an earlier turn. ' +
  'Your reply is the whole of your turn: nothing follows it, so make every lookup it needs ' +
  'before you write it, and never say you will look something up. When somebody asks you ' +
  'to consult the library, consult it. To read a document a recorded call found, pass the ' +
  'library that call names.';

/**
 * What a press that consults the library is told about it, beside the rest of
 * the system prompt. `owner` is the library's owner by display name, or null
 * where none has signed in yet; named because whoever presses may be anybody
 * in the channel, and a reply should be able to say whose writing it quotes.
 *
 * **It overrides noesis's guide on citation in so many words**: the guide, read
 * after this, asks for `## Related` and `## References` sections, which suit
 * a library chat and not a paste of plain lines.
 */
export function libraryRule(owner: string | null): string {
  const who = owner ?? 'the library’s owner';
  const whose = owner ? `${owner}’s` : 'the library owner’s';
  return [
    `You can consult a library through the noesis tools: ${whose} own writing — essays, notes and ` +
      `conversations, dated and indexed by term. It is ${whose} whoever asked you, and ${who} may ` +
      'or may not be in this conversation. Consult it only when the conversation turns to ' +
      `something ${who} has written about, or when somebody asks; most turns need nothing from ` +
      'it. Read the guide tool before the others.',
    LOOK_NOW,
    `Treat the titles in a document’s Related section as ${whose} own recommendations of what ` +
      'bears on it, and follow them when the question needs more than the document gives.',
    'When your reply draws on a document, name it by its title in plain words. The guide asks ' +
      'for Related and References sections at the end of a reply: do not write them here. Cite ' +
      'everything inline instead, and a work outside the library by its author and year. Only ' +
      'your final answer is shown, and the word limit is for it alone.',
  ].join(' ');
}

/**
 * `libraryRule` for a press consulting several people's libraries: who each
 * belongs to, by display name and by the ids noesis labels its results with,
 * since the same tools reach all of them and a reply quoting one has to be
 * able to say whose writing it is.
 */
export function librariesRule(
  libraries: readonly { owner: string | null; libraries: readonly string[] }[]
): string {
  const whose = libraries
    .map(
      ({ owner, libraries: ids }) =>
        `${owner ? `${owner}’s` : 'somebody who has left’s'} (${ids.join(', ')})`
    )
    .join('; ');
  return [
    'You can consult several libraries through the noesis tools, each one person’s own writing — ' +
      `essays, notes and conversations, dated and indexed by term: ${whose}. Every result names ` +
      'the library it came from. They are those people’s whoever asked you, and each of them may ' +
      'or may not be in this conversation. Consult them only when the conversation turns to ' +
      'something one of them has written about, or when somebody asks; most turns need nothing ' +
      'from them. Read a guide tool before the others.',
    LOOK_NOW,
    'Treat the titles in a document’s Related section as its author’s own recommendations of ' +
      'what bears on it, and follow them when the question needs more than the document gives.',
    'When your reply draws on a document, name it by its title and whose it is, in plain words. ' +
      'The guide asks for Related and References sections at the end of a reply: do not write ' +
      'them here. Cite everything inline instead, and a work outside the libraries by its author ' +
      'and year. Only your final answer is shown, and the word limit is for it alone.',
  ].join(' ');
}

/**
 * What a press consulting the channel's own library is told of it, beside
 * any person's: not anybody's writing but the channel's — its earlier
 * conversations and the sources its members brought in — of which the
 * *Record* it is given is only the recent part.
 */
export function channelLibraryRule(): string {
  return [
    'You can also consult this channel’s own library through the noesis tools: its earlier ' +
      'conversations, each transcribed, and sources its members brought in, dated and indexed ' +
      'by term. Each part of the record already filed there names its document, by the file ' +
      'name read_file takes and the title it was given. The recent parts are in the record in ' +
      'full, so never read their documents; the older ones are a line each, so read one with ' +
      'read_file when the conversation turns to it, and search the library for anything else ' +
      'said here before, or for its sources. Most turns need nothing from it unless somebody ' +
      'asks. Read a guide tool before the others.',
    LOOK_NOW,
    'When your reply draws on one of its documents, name it by its title in plain words, ' +
      'inline. Do not write Related or References sections. Only your final answer is shown, ' +
      'and the word limit is for it alone.',
  ].join(' ');
}

/** A line that heads a Related or References section, however it is marked. */
const CITATION_HEADING = /^[ \t]*(?:#{1,6}[ \t]*)?(?:Related|References)[ \t]*:?[ \t]*$/im;

/**
 * What a response posts: its text blocks, and nothing else — the thinking is
 * never posted, nor a fallback's switch-point block — **after the last
 * library lookup**. A press that consulted the library returns `mcp_tool_use`
 * and `mcp_tool_result` blocks with Claude's working between them ("let me
 * look that up"); only what follows the last of them is the answer. A
 * response with no lookup is all of its text, as before.
 *
 * Then **from a Related or References heading to the end is dropped**, in
 * case the model followed noesis's guide rather than the prompt: a paste is
 * plain lines, and the heading would arrive as a literal `##`. Inline
 * citations are untouched.
 */
export function replyText(
  content: ReadonlyArray<{ type: string; text?: string }>
): string {
  let start = 0;
  content.forEach((block, i) => {
    if (block.type === 'mcp_tool_use' || block.type === 'mcp_tool_result') start = i + 1;
  });
  const text = content
    .slice(start)
    .flatMap((block) => (block.type === 'text' ? [block.text ?? ''] : []))
    .join('')
    .trim();
  const heading = CITATION_HEADING.exec(text);
  return heading ? text.slice(0, heading.index).trim() : text;
}

/**
 * **One library call a press made, as the server keeps it beside the reply**
 * — Rodrigo's principle, 2026-11-07: the calls and something of what each
 * returned enter the *Record*, so the next press knows what this one found.
 * Until then each press began with nothing of the last one's lookups but its
 * prose, and guessed at a path it had been given a minute before. See
 * planning/task/claude-s-working-is-kept-with-its-reply.md.
 *
 * **Written from the response's own blocks, never by Claude**: asked what it
 * had done, a press with no record described calls it never made.
 */
export interface WorkingStep {
  tool: string;
  /**
   * The library it reached: the call's own `library`, else the only one its
   * server was opened on, else null — a search across several, whose result
   * names each.
   */
  library: string | null;
  input: Record<string, unknown>;
  /** What is kept of what came back; null where nothing is (the guide). */
  kept: string | null;
  /** The error's text in full, short as it is and being the diagnosis. */
  error?: string;
}

/** The text of a tool result, however the connector shaped it. */
const resultText = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block: { type?: string; text?: string }) => (block.type === 'text' ? (block.text ?? '') : '')).join('')
      : '';

/**
 * What a successful call keeps of its result. **A search keeps everything
 * the manifest returns for each hit** — path, title, word count and summary,
 * and a lookup's *Related* terms — Rodrigo's call, 2026-11-07: a few lines,
 * and what lets the next press judge whether a document is worth reading.
 * **A read keeps none of the document**, which can be read again: its length
 * and its heading. The guide keeps nothing, being the same every time.
 */
function keptOf(tool: string, text: string): string | null {
  if (tool === 'lookup_term' || tool === 'list_documents') return text.trim();
  if (tool === 'read_document' || tool === 'read_file') {
    const words = text.split(/\s+/).filter(Boolean).length;
    const heading = /^#[ \t]+(.+)$/m.exec(text)?.[1]?.trim();
    return `read in full: ${words} words${heading ? `, headed "${heading}"` : ''}`;
  }
  return null;
}

/**
 * The library calls in a response's content, in the order made, each paired
 * with its result. `libraries` is what the press consulted, in the order its
 * servers were named (`libraryServerName`).
 */
export function workingSteps(
  content: readonly unknown[],
  libraries: readonly ConsultedLibrary[]
): WorkingStep[] {
  const opened = new Map(libraries.map((each, index) => [libraryServerName(index), each.libraries]));
  const steps = new Map<string, WorkingStep>();
  for (const block of content as ReadonlyArray<Record<string, unknown>>) {
    if (block.type === 'mcp_tool_use') {
      const input = (block.input ?? {}) as Record<string, unknown>;
      const own = opened.get(block.server_name as string) ?? [];
      steps.set(block.id as string, {
        tool: block.name as string,
        library: typeof input.library === 'string' ? input.library : own.length === 1 ? own[0] : null,
        input,
        kept: null,
      });
    } else if (block.type === 'mcp_tool_result') {
      const step = steps.get(block.tool_use_id as string);
      if (!step) continue;
      const text = resultText(block.content);
      if (block.is_error) step.error = text.trim() || 'failed, saying nothing';
      else step.kept = keptOf(step.tool, text);
    }
  }
  return [...steps.values()];
}

/** A call as the *Record* writes it: the tool and its arguments, as sent. */
const callLine = (step: WorkingStep) => {
  const args = Object.entries(step.input)
    .filter(([key]) => key !== 'library')
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return `${step.tool}(${args.join(', ')})${step.library ? ` in ${step.library}` : ''}`;
};

/**
 * A reply's library calls as the *Record* carries them, above the reply:
 * each call, then what came back, indented beneath it.
 */
export function renderWorking(steps: readonly WorkingStep[]): string[] {
  if (steps.length === 0) return [];
  const indent = (text: string) => text.split('\n').map((line) => `    ${line}`);
  return [
    'Before replying, Claude made these library calls (the server’s record):',
    ...steps.flatMap((step) => [
      `  ${callLine(step)}`,
      ...(step.error ? indent(`failed: ${step.error}`) : step.kept ? indent(step.kept) : []),
    ]),
  ];
}

/**
 * `libraries` is whose a press consults, one entry per owner — absent or
 * empty for a press that consults none.
 */
export function systemPrompt(
  length: ReplyLength,
  consulted?: readonly { owner: string | null; libraries: readonly string[]; channel?: boolean }[]
): string {
  const libraries = consulted?.filter((each) => !each.channel);
  const channelLibrary = consulted?.some((each) => each.channel) ?? false;
  return [
    'You are Claude, taking part in a voice conversation among people using an ' +
      'app called The Floor. You are given the record of the conversation so far: ' +
      'what people said, transcribed by speech recognition and so imperfect — ' +
      'words may be misheard and names misspelled — and what they pasted into ' +
      'it, including your own earlier replies, which are labelled Claude. Times ' +
      'are in UTC.',
    'Contribute one turn to the conversation, as a thoughtful person in the room ' +
      'would: respond to where the conversation is now, not to everything in it, ' +
      'in the language being spoken, addressing people by name where that helps. ' +
      'Write plain text, with no Markdown, lists or headings, because your reply ' +
      'is shown as plain lines.',
    // Only where the press consults a library, so every other prompt is
    // byte for byte what it was — and one owner's in the words it always had.
    ...(libraries?.length === 1
      ? [libraryRule(libraries[0].owner)]
      : libraries?.length
        ? [librariesRule(libraries)]
        : []),
    ...(channelLibrary ? [channelLibraryRule()] : []),
    lengthRule(length),
  ].join('\n\n');
}

/** The Record, as one request will carry it. */
export interface ComposedRecord {
  text: string;
  /** Whether older conversation was left out to fit the budget. */
  trimmed: boolean;
  /** Whether older parts are a line each naming their document in the channel's library. */
  summarized?: boolean;
}

/** One room of the *Record*, rendered: its heading and its lines. */
interface RenderedRoom {
  heading: string;
  lines: string[];
}

const hhmm = (at: number) => new Date(at).toISOString().slice(11, 16);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

const roomHeading = (room: RoomView) =>
  `— ${day(room.openedAt)}, ${hhmm(room.openedAt)} to ${
    room.closedAt === null ? 'now' : hhmm(room.closedAt)
  } UTC —`;

/** A filed document as read_file takes it: its name, without the year's folder. */
const documentName = (filed: FiledView) => filed.file.split('/').pop()!;

const titled = (filed: FiledView) => (filed.title ? `, titled "${filed.title}"` : '');

/** Where the *Record*'s text comes from, so tests can supply it directly. */
export interface RecordSources {
  rooms: (channelId: string, now: number) => RoomView[];
  /**
   * A text segment's live lines, oldest first, with the stem each came from
   * and its voice's letter, which go on the name as the *Record* puts them.
   */
  liveLines: (
    channelId: string,
    from: number,
    until: number
  ) => Array<{ identity: string; speaker?: string | null; displayName: string; startAt: number; text: string }>;
  /** A recording's batch transcript, with the names frozen on it. */
  recording: (
    recordingId: string
  ) => { startedAt: number; lines: TranscriptLine[]; names: Record<string, string> } | null;
  /** The library calls a reply of Claude's was made with, by its paste's id. */
  working?: (pasteId: string) => WorkingStep[] | null;
}

/** The real sources, read from this server's database. */
export function databaseSources(
  db: Db,
  rooms: { forChannel(channelId: string, now: number): RoomView[] },
  transcripts: { linesFor(recordingId: string): TranscriptLine[] }
): RecordSources {
  return {
    rooms: (channelId, now) => rooms.forChannel(channelId, now),
    liveLines: (channelId, from, until) =>
      (
        db
          .prepare(
            `SELECT identity, speaker, display_name, start_at, text FROM live_lines
             WHERE channel_id = ? AND start_at >= ? AND start_at <= ? AND deleted_at IS NULL
             ORDER BY start_at, id`
          )
          .all(channelId, from, until) as unknown as Array<{
          identity: string;
          speaker: string | null;
          display_name: string;
          start_at: number;
          text: string;
        }>
      ).map((row) => ({
        identity: row.identity,
        speaker: row.speaker,
        displayName: row.display_name,
        startAt: row.start_at,
        text: row.text,
      })),
    recording: (recordingId) => {
      const row = db
        .prepare('SELECT started_at, participant_names FROM recordings WHERE id = ?')
        .get(recordingId) as unknown as
        | { started_at: number; participant_names: string | null }
        | undefined;
      if (!row) return null;
      return {
        startedAt: row.started_at,
        lines: transcripts.linesFor(recordingId),
        names: row.participant_names ? JSON.parse(row.participant_names) : {},
      };
    },
    working: (pasteId) => {
      const row = db.prepare('SELECT working FROM pastes WHERE id = ?').get(pasteId) as unknown as
        | { working: string | null }
        | undefined;
      return row?.working ? (JSON.parse(row.working) as WorkingStep[]) : null;
    },
  };
}

/**
 * A text segment's live lines as the *Record* names them: a separated voice's
 * letter on its name, or the name given it in the segment's menu.
 */
function saidIn(sources: RecordSources, channelId: string, segment: SegmentView, now: number) {
  return lettered(sources.liveLines(channelId, segment.startedAt, segment.endedAt ?? now), segment.voices);
}

function renderSegment(
  sources: RecordSources,
  channelId: string,
  segment: SegmentView,
  now: number
): string[] {
  if (segment.paste) {
    const { authorId, displayName, text } = segment.paste;
    const who = authorId === CLAUDE_ID ? 'Claude' : `${displayName} (pasted)`;
    const working = authorId === CLAUDE_ID ? (sources.working?.(segment.id) ?? []) : [];
    return [...renderWorking(working), `[${hhmm(segment.startedAt)}] ${who}: ${text}`];
  }
  if (segment.text) {
    return saidIn(sources, channelId, segment, now).map(
      (line) => `[${hhmm(line.startAt)}] ${line.displayName}: ${line.text}`
    );
  }
  if (segment.recordingId) {
    const recording = sources.recording(segment.recordingId);
    if (!recording || recording.lines.length === 0) return [];
    // Headed by the recording's start rather than a time per line: a batch
    // transcript is timed against the recorded audio, which pauses, so its
    // offsets are not wall-clock times and would be wrong as ones.
    return [
      `(A recording began at ${hhmm(recording.startedAt)}; its transcript follows.)`,
      ...readableLines(recording.lines, recording.names, segment.voices).map(
        (line) => `${line.displayName ?? 'Someone'}: ${line.text}`
      ),
    ];
  }
  return [];
}

/**
 * The channel's whole *Record* as text, oldest first, in rooms as the tab
 * lays it out — or null when it holds nothing anybody could read, which is
 * a press answered without asking anybody.
 *
 * **Capped from the oldest end**: whole rooms go first, then lines from the
 * front of the oldest room kept, and `trimmed` says so, for the prompt to
 * say where the record begins.
 */
export function composeRecord(
  sources: RecordSources,
  channelId: string,
  now: number,
  budget = RECORD_BUDGET_CHARS
): ComposedRecord | null {
  const rooms: RenderedRoom[] = sources
    .rooms(channelId, now)
    .map((room) => ({
      heading: roomHeading(room),
      lines: room.segments.flatMap((segment) => renderSegment(sources, channelId, segment, now)),
    }))
    .filter((room) => room.lines.length > 0);
  if (rooms.length === 0) return null;

  const size = (room: RenderedRoom) =>
    room.heading.length + 1 + room.lines.reduce((sum, line) => sum + line.length + 1, 0);
  let total = rooms.reduce((sum, room) => sum + size(room) + 1, 0);
  let trimmed = false;
  while (total > budget && rooms.length > 1) {
    total -= size(rooms.shift()!) + 1;
    trimmed = true;
  }
  const oldest = rooms[0];
  while (total > budget && oldest.lines.length > 1) {
    total -= oldest.lines.shift()!.length + 1;
    trimmed = true;
  }
  return {
    text: rooms.map((room) => [room.heading, ...room.lines].join('\n')).join('\n\n'),
    trimmed,
  };
}

/** Who spoke in a segment, in the order they first did. */
function speakersOf(
  sources: RecordSources,
  channelId: string,
  segment: SegmentView,
  now: number
): string[] {
  const names = segment.text
    ? saidIn(sources, channelId, segment, now).map((line) => line.displayName)
    : segment.recordingId
      ? (() => {
          const recording = sources.recording(segment.recordingId!);
          return recording
            ? readableLines(recording.lines, recording.names, segment.voices).map(
                (line) => line.displayName ?? 'Someone'
              )
            : [];
        })()
      : [];
  return [...new Set(names)];
}

/**
 * The *Record* for a press that consults the channel's own library: newest
 * first, **in full up to `full`** — the recent part, about three hours, and
 * the newest room whatever its length — and
 * past that, every segment already filed there as **one line naming its
 * document**, its hours and who spoke, for Claude to read with read_file when
 * it is wanted. A filed segment given in full names its document too, so
 * Claude knows it already holds it. Whatever the library does not hold — the
 * segment still being kept, one closed in the last minute, one closed while
 * nobody was Pro, everything from before 2026-11-07, a paste — stays in full,
 * within the usual `budget`, past which the oldest goes as `composeRecord`
 * lets it.
 */
export function composeLibraryRecord(
  sources: RecordSources,
  channelId: string,
  now: number,
  full = LIBRARY_RECORD_BUDGET_CHARS,
  budget = RECORD_BUDGET_CHARS
): ComposedRecord | null {
  const rooms = sources
    .rooms(channelId, now)
    .map((room) => ({
      heading: roomHeading(room),
      segments: room.segments
        .map((segment) => ({ segment, lines: renderSegment(sources, channelId, segment, now) }))
        .filter((each) => each.lines.length > 0),
    }))
    .filter((room) => room.segments.length > 0);
  if (rooms.length === 0) return null;

  const size = (lines: string[]) => lines.reduce((sum, line) => sum + line.length + 1, 0);
  const kept: RenderedRoom[] = [];
  let total = 0;
  let spent = false;
  let summarized = false;
  let trimmed = false;
  newest: for (let r = rooms.length - 1; r >= 0; r--) {
    const room = rooms[r];
    const lines: string[][] = [];
    total += room.heading.length + 2;
    for (let i = room.segments.length - 1; i >= 0; i--) {
      const { segment, lines: text } = room.segments[i];
      const filed = segment.filed;
      let chosen = filed
        ? [`(Filed in this channel's library as ${documentName(filed)}${titled(filed)}.)`, ...text]
        : text;
      // Once one filed segment is past the full part, every older one is: the
      // record is whole from one point on rather than in patches. Never the
      // newest room, which is the conversation being answered.
      const newestRoom = r === rooms.length - 1;
      if (filed && !newestRoom && (spent || total + size(chosen) > full)) {
        spent = summarized = true;
        const who = speakersOf(sources, channelId, segment, now);
        chosen = [
          `[${hhmm(segment.startedAt)}–${hhmm(segment.endedAt ?? now)}] ` +
            `${who.length ? `${who.join(', ')}. ` : ''}` +
            `In this channel's library as ${documentName(filed)}${titled(filed)}.`,
        ];
      }
      if (total + size(chosen) > budget) {
        // The newest part that does not fit is cut from its front, as
        // `composeRecord` cuts the oldest room it keeps.
        while (chosen.length > 1 && total + size(chosen) > budget) chosen = chosen.slice(1);
        if (total + size(chosen) <= budget) {
          total += size(chosen);
          lines.unshift(chosen);
        }
        trimmed = true;
        if (lines.length) kept.unshift({ heading: room.heading, lines: lines.flat() });
        break newest;
      }
      total += size(chosen);
      lines.unshift(chosen);
    }
    kept.unshift({ heading: room.heading, lines: lines.flat() });
  }
  return {
    text: kept.map((room) => [room.heading, ...room.lines].join('\n')).join('\n\n'),
    trimmed,
    summarized,
  };
}

/** The user message: the *Record*, then the length rule again, last. */
export function userMessage(record: ComposedRecord, length: ReplyLength): string {
  const opening = record.summarized
    ? 'The record of this conversation follows. Its recent part is in full; each older part ' +
      'already filed in this channel’s library is one line naming its document there.' +
      (record.trimmed ? ' Earlier conversation was left out for length.' : '')
    : record.trimmed
      ? 'The record of this conversation follows. It begins partway through: ' +
        'earlier conversation was left out for length.'
      : 'The record of this conversation so far follows.';
  return `${opening}\n\n<record>\n${record.text}\n</record>\n\n${lengthRule(length)}`;
}

/**
 * What this server needs of the SDK: one request either way. Narrow so that
 * tests pass a fake, as transcription's tests pass a fake `fetch`.
 */
export interface ClaudeClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal }
    ): Promise<Anthropic.Message>;
  };
  beta: {
    messages: {
      create(
        body: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        options?: { signal?: AbortSignal }
      ): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

/** How a press ended, as `claude_usage.outcome` records it. */
export type ClaudeOutcome =
  | 'posted'
  | 'too_long'
  | 'empty'
  | 'refused'
  | 'error'
  | 'timeout'
  | 'gone';

/** What the registry does for a press. See `ChannelRegistry.askClaude`. */
export interface ClaudeChannels {
  get(channelId: string): ChannelState | undefined;
  askClaude(
    channelId: string,
    userId: string
  ): { ok: true } | { ok: false; error: string; code: 'forbidden' | 'conflict' | 'not_found' | 'invalid' };
  claudeAnswered(channelId: string): void;
  postClaudeReply(
    channelId: string,
    askerId: string,
    text: string,
    voices?: Record<string, string>,
    working?: readonly WorkingStep[],
    askerLanguage?: string
  ): Promise<'posted' | 'too_long' | 'empty' | 'gone'>;
}

export type ClaudeResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** The sentence each failure answers with, and the status it travels under. */
const FAILURES: Record<Exclude<ClaudeOutcome, 'posted'>, { status: number; error: string }> = {
  too_long: { status: 422, error: 'Claude’s reply was too long to post.' },
  empty: { status: 422, error: 'Claude had nothing to add.' },
  refused: { status: 422, error: 'Claude declined to respond to this.' },
  error: { status: 502, error: 'Claude could not be reached. Try again in a moment.' },
  timeout: { status: 504, error: 'Claude took too long to respond.' },
  gone: { status: 409, error: 'The channel changed before Claude’s reply could be posted.' },
};

/**
 * noesis, where people keep their own writing indexed by term, and whose library
 * a press may let Claude consult through the Messages API's MCP connector:
 * Anthropic's servers call noesis, not this one. Reading only. A library is an
 * account's own, connected on *Floor Settings* (noesis.ts), and is consulted
 * only in a channel whose *Library* switch its owner turned on, on Pro and Max.
 * See planning/decision/2026-10-27-claude-consults-its-owner-s-library-channel-by-channel.md
 * and planning/decision/2026-11-01-each-account-connects-its-own-mdc-library.md.
 */
export interface LibraryOptions {
  /** noesis's MCP server, `https://noesis.rvanegas.co/mcp` in production. */
  url: string;
  /**
   * A current token for an account's own library, or null when it has none
   * connected or noesis no longer honours it — `NoesisConnections.accessToken`.
   * Since 2026-11-01 each account connects its own on *Floor Settings*; the
   * one `NOESIS_TOKEN` this replaced was Rodrigo's alone.
   */
  tokenFor: (accountId: string) => Promise<string | null>;
}

/**
 * One owner's libraries as a press consults them: noesis, with that owner's
 * token, and whose they are. `url` names the libraries they chose here,
 * `?libraries=a,b`, which noesis opens and no others, since the grant reaches
 * all of the owner's.
 */
export interface ConsultedLibrary {
  url: string;
  token: string;
  /** The account whose libraries they are: whoever switched them on here. */
  owner: string;
  /** Which, by noesis id, for the prompt to say whose each is. */
  libraries: string[];
  /** The channel's own library (channelLibraries.ts) rather than somebody's; `owner` is then empty. */
  channel?: boolean;
}

/**
 * The libraries a press consults, an entry per owner, or none: only where
 * this server has noesis, the channel's *Library* is on, and the grade is *Pro*
 * or *Max* — *Standard* stays the plain, fast call. **Whoever presses**: the
 * switches are the channel's, as the grade is, and each owner's consent was
 * given when they turned theirs on, so who asks is deliberately not an
 * argument here.
 *
 * Each owner's only while they are still in the channel: somebody who has
 * left took their consent with them, and everybody else's stays. An owner
 * who has disconnected, or whose grant noesis refuses, is passed over.
 */
export async function librariesFor(
  library: LibraryOptions | undefined,
  channel: Pick<ChannelState, 'library' | 'libraries' | 'participants'>,
  grade: ResponseModel
): Promise<ConsultedLibrary[]> {
  if (!library || !(channel.library ?? false) || grade === 'standard') return [];
  const owners = Object.entries(channel.libraries ?? {})
    .filter(([owner, chosen]) => chosen.length > 0 && channel.participants.includes(owner))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const consulted = await Promise.all(
    owners.map(async ([owner, chosen]): Promise<ConsultedLibrary | null> => {
      const token = await library.tokenFor(owner);
      if (!token) return null;
      const url = new URL(library.url);
      url.searchParams.set('libraries', chosen.join(','));
      return { url: url.toString(), token, owner, libraries: chosen };
    })
  );
  return consulted.filter((entry): entry is ConsultedLibrary => entry !== null);
}

export interface ClaudeResponderOptions {
  client: ClaudeClient;
  channels: ClaudeChannels;
  sources: RecordSources;
  db: Db;
  now: () => number;
  timeoutMs?: number;
  /** A library press's timeout; `CLAUDE_LIBRARY_TIMEOUT_MS` unless a test shortens it. */
  libraryTimeoutMs?: number;
  /** Absent, no press consults a library. See `LibraryOptions`. */
  library?: LibraryOptions;
  /**
   * The channel's own library (channelLibraries.ts): its id and a token
   * confined to it, or null where the channel has none, has switched it
   * off, or noesis gave no token. Absent, no press consults one.
   */
  channelLibrary?: {
    url: string;
    consult: (channelId: string) => Promise<{ id: string; token: string } | null>;
  };
  /**
   * An account's display name, for the prompt to say whose library a press
   * consults; asked at each press that consults one, null when it has none.
   */
  libraryOwner?: (accountId: string) => string | null;
  log?: { warn(details: object, message: string): void };
}

/**
 * One press of *Ask Claude*, start to finish. The card says *Responding…* on
 * every screen from the ask until `claudeAnswered` — which runs in `finally`,
 * whatever happened, so it can never outlive the request.
 */
export class ClaudeResponder {
  constructor(private options: ClaudeResponderOptions) {}

  async respond(
    channelId: string,
    userId: string,
    length: ReplyLength = DEFAULT_REPLY_LENGTH,
    /** The asker's, carried onto the reply for every phone to read it in. */
    voices?: Record<string, string>,
    /**
     * The asker's app language, `en` or `es`, which the reply is spoken in
     * where the channel has no transcript to say. Since 2026-11-13.
     */
    language?: string
  ): Promise<ClaudeResult> {
    const { channels, now } = this.options;
    const channel = channels.get(channelId);
    if (!channel) return { ok: false, status: 404, error: 'No such channel.' };

    // Read before asking, so an empty *Record* is answered without the card
    // ever saying *Responding…*.
    const record = composeRecord(this.options.sources, channelId, now());
    if (!record) {
      return {
        ok: false,
        status: 409,
        error: 'There is nothing in the Record yet for Claude to read.',
      };
    }

    const asked = channels.askClaude(channelId, userId);
    if (!asked.ok) {
      return {
        ok: false,
        status: asked.code === 'conflict' ? 409 : asked.code === 'forbidden' ? 403 : 400,
        error: asked.error,
      };
    }

    // The grade is read at the press and written to the ledger with it, so
    // changing the setting later never changes what an earlier reply was.
    const grade = channel.responseModel ?? 'standard';
    const ask = RESPONSE_MODELS[grade];
    // Read at the press with the grade, for the same reason.
    // None consulted is no library at all, as the request is concerned.
    const consulted = await librariesFor(this.options.library, channel, grade);
    // And the channel's own, on the same grades, beside whoever's are on.
    const own =
      grade === 'standard' || !this.options.channelLibrary
        ? null
        : await this.options.channelLibrary.consult(channelId);
    if (own) {
      const url = new URL(this.options.channelLibrary!.url);
      url.searchParams.set('libraries', own.id);
      consulted.push({ url: url.toString(), token: own.token, owner: '', libraries: [own.id], channel: true });
    }
    const library = consulted.length ? consulted : undefined;
    // With the channel's own library, what it already holds goes as a line
    // each past the recent part; asked again without noesis, in full.
    const sent = (own && composeLibraryRecord(this.options.sources, channelId, now())) || record;
    const controller = new AbortController();
    const timeoutMs = library
      ? (this.options.libraryTimeoutMs ?? CLAUDE_LIBRARY_TIMEOUT_MS)
      : (this.options.timeoutMs ?? CLAUDE_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let outcome: ClaudeOutcome = 'error';
    let response: Anthropic.Message | Anthropic.Beta.Messages.BetaMessage | undefined;
    try {
      response = await this.consult(ask, sent, record, length, controller.signal, library, channelId);
      if (response.stop_reason === 'refusal') {
        outcome = 'refused';
      } else {
        outcome = await channels.postClaudeReply(
          channelId,
          userId,
          replyText(response.content),
          voices,
          library ? workingSteps(response.content, library) : undefined,
          language
        );
      }
    } catch (error) {
      outcome = controller.signal.aborted ? 'timeout' : 'error';
      this.options.log?.warn({ err: error, channel: channelId, grade }, 'claude request failed');
    } finally {
      clearTimeout(timer);
      // A press that posted nothing keeps its calls nowhere else, so the
      // log has them: a failure leaves a trace too.
      const steps = library && response ? workingSteps(response.content, library) : [];
      if (outcome !== 'posted' && steps.length) {
        this.options.log?.warn({ channel: channelId, outcome, steps }, 'claude press posted nothing after library calls');
      }
      channels.claudeAnswered(channelId);
      this.recordUsage(channelId, userId, grade, ask, response, outcome, library !== undefined);
    }
    return outcome === 'posted' ? { ok: true } : { ok: false, ...FAILURES[outcome] };
  }

  /**
   * A press's request, start to finish, within the press's one timer.
   *
   * **noesis unreachable is not a failed press.** A request that consulted the
   * library and failed — without the timer having fired — is asked once more
   * without it — and with the whole *Record*, its older parts no longer a line
   * each — and nothing in the reply says so; the warning names noesis, so
   * the log does. A timeout is not retried: the time is already spent. A
   * lookup that merely errored comes back as an `mcp_tool_result` with
   * `is_error`, which Claude answers around and needs nothing here.
   */
  private async consult(
    ask: ResponseGrade,
    record: ComposedRecord,
    /** The whole *Record*, for the request asked again without noesis. */
    whole: ComposedRecord,
    length: ReplyLength,
    signal: AbortSignal,
    library: ConsultedLibrary[] | undefined,
    channelId: string
  ): Promise<Reply> {
    try {
      return await this.resumed(ask, record, length, signal, library);
    } catch (error) {
      if (!library || signal.aborted) throw error;
      this.options.log?.warn(
        { err: error, channel: channelId, noesis: library.map((each) => each.url) },
        'claude request with the noesis library failed; asking without it'
      );
      return this.resumed(ask, whole, length, signal, undefined);
    }
  }

  /**
   * One request, resumed while the connector says `pause_turn` — its
   * server-side loop stops after ten rounds of lookups, and is continued by
   * sending back what it returned. At most `LIBRARY_CONTINUATIONS` times.
   * Returns the last response with **every** response's content and usage,
   * so the reply is read from the whole of it and the ledger counts all of
   * what was spent.
   */
  private async resumed(
    ask: ResponseGrade,
    record: ComposedRecord,
    length: ReplyLength,
    signal: AbortSignal,
    library: ConsultedLibrary[] | undefined
  ): Promise<Reply> {
    let content: Reply['content'] = [];
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    for (let round = 0; ; round++) {
      const response = await this.request(
        ask,
        record,
        length,
        signal,
        library,
        round > 0 ? content : undefined
      );
      content = [...content, ...response.content] as Reply['content'];
      usage.input_tokens += response.usage?.input_tokens ?? 0;
      usage.output_tokens += response.usage?.output_tokens ?? 0;
      usage.cache_creation_input_tokens += response.usage?.cache_creation_input_tokens ?? 0;
      usage.cache_read_input_tokens += response.usage?.cache_read_input_tokens ?? 0;
      const paused = (response.stop_reason as string) === 'pause_turn';
      if (!paused || round >= LIBRARY_CONTINUATIONS) {
        return { ...response, content, usage: { ...response.usage, ...usage } } as Reply;
      }
    }
  }

  private request(
    ask: ResponseGrade,
    record: ComposedRecord,
    length: ReplyLength,
    signal: AbortSignal,
    // What `librariesFor` decided: the libraries this press may consult, if any.
    library?: ConsultedLibrary[],
    // What a paused turn returned so far, sent back to resume it.
    previous?: Reply['content']
  ): Promise<Reply> {
    const body = {
      model: ask.model,
      max_tokens: ask.maxTokens,
      system: systemPrompt(
        length,
        library?.map((each) => ({
          owner: each.channel ? null : (this.options.libraryOwner?.(each.owner) ?? null),
          libraries: each.libraries,
          channel: each.channel,
        }))
      ),
      messages: [
        { role: 'user' as const, content: userMessage(record, length) },
        // The response's own blocks, as the API asks a paused turn back.
        ...(previous
          ? [{ role: 'assistant' as const, content: previous as unknown as Anthropic.ContentBlockParam[] }]
          : []),
      ],
      output_config: { effort: ask.effort },
    };
    // Either reason takes the beta endpoint. Today they coincide — the
    // library is offered only on Pro and Max, the grades with the fallback —
    // but each is said on its own, so neither depends on the other staying so.
    if (!ask.fallback && !library) return this.options.client.messages.create(body, { signal });
    // `fallbacks` and the MCP connector's fields are newer than the SDK pinned
    // here, which sends the body as given; the cast is those fields.
    return this.options.client.beta.messages.create(
      {
        ...body,
        betas: [...(library ? [MCP_BETA] : []), ...(ask.fallback ? [FALLBACK_BETA] : [])],
        ...(ask.fallback ? { fallbacks: 'default' } : {}),
        ...(library ? libraryRequest(library) : {}),
      } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
      { signal }
    );
  }

  /**
   * One row per press, failed or not, holding counts and **no text**: the
   * reply is in `pastes` and the prompt is the *Record*, so a copy here would
   * be a second store of the conversation for no reason. A ledger, so it
   * outlives the account — `UsageMeter.forget` nulls the account instead.
   */
  private recordUsage(
    channelId: string,
    accountId: string,
    grade: ResponseModel,
    ask: ResponseGrade,
    response: Anthropic.Message | Anthropic.Beta.Messages.BetaMessage | undefined,
    outcome: ClaudeOutcome,
    consultedLibrary: boolean
  ): void {
    const usage = response?.usage;
    // Lookups across the whole of it, a resumed pause included: `resumed`
    // returns every round's content.
    const libraryCalls = consultedLibrary
      ? (response?.content ?? []).filter((block) => (block.type as string) === 'mcp_tool_use')
          .length
      : null;
    this.options.db
      .prepare(
        `INSERT INTO claude_usage
           (id, at, channel_id, account_id, grade, model, input_tokens,
            output_tokens, cache_write_tokens, cache_read_tokens, stop_reason,
            outcome, library_calls)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('claude'),
        this.options.now(),
        channelId,
        accountId,
        grade,
        // The model that served it, which a fallback can change.
        response?.model ?? ask.model,
        usage?.input_tokens ?? 0,
        usage?.output_tokens ?? 0,
        usage?.cache_creation_input_tokens ?? 0,
        usage?.cache_read_input_tokens ?? 0,
        response?.stop_reason ?? null,
        outcome,
        libraryCalls
      );
  }
}

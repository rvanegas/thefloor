import type Anthropic from '@anthropic-ai/sdk';

import { claudeReads } from '../../core/channel';
import { CLAUDE_ID, CLAUDE_READS_MS } from '../../core/constants';
import type { ClaudeProposal, FiledView, ProposedDocument, RoomView, SegmentView } from '../../core/protocol';
import type { ChannelState, ReplyLength } from '../../core/types';
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
 * ***Max*, Opus 5.5 at medium, was a third grade from 2026-10-22 until
 * 2026-11-19**, when the grade stopped being a choice (`isProChannel` in
 * channels.ts); its ledger rows keep `max`.
 *
 * **A press that consults a library thinks at medium at the least**, since
 * 2026-11-14 — Rodrigo's call (`consultingGrade`). At low effort *Pro* read
 * the guide and stopped: 26 of its first 108 library presses made any call.
 */
/**
 * The grade of model a channel's *Ask Claude* asks: `pro` while the channel
 * is *Pro* (`isProChannel` in channels.ts), `standard` otherwise.
 */
export type ResponseModel = 'standard' | 'pro';

export const RESPONSE_MODELS: Record<ResponseModel, ResponseGrade> = {
  // 3072 since *Extended* became 450 words, about 600 tokens before any thinking.
  standard: { model: 'claude-haiku-5-5', effort: 'low', maxTokens: 3072, fallback: false },
  pro: { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4096, fallback: true },
};

/**
 * A library press's ceiling: thinking and every lookup's turn share it, and
 * medium thinks more than low. *Max*'s, which it was until that grade went.
 */
const CONSULTING_MAX_TOKENS = 8192;

/**
 * What a grade asks when the press consults a library: at least medium
 * effort, and `CONSULTING_MAX_TOKENS`. Only *Pro* changes today —
 * *Standard* never consults one — but it is said by grade, not by name.
 */
export function consultingGrade(ask: ResponseGrade): ResponseGrade {
  return {
    ...ask,
    effort: ask.effort === 'low' ? 'medium' : ask.effort,
    maxTokens: Math.max(ask.maxTokens, CONSULTING_MAX_TOKENS),
  };
}

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
 * The library's tools a press may use: noesis's searching tools, and nothing
 * else. **An allowlist although noesis's server writes nothing today** — noesis
 * plans more tools, and one it adds should reach a room by a decision here,
 * not by a deploy there.
 *
 * **No reading tool since 2026-11-20**, `read_file` and `read_document`
 * having been on until then: Claude asks the room before it reads a document
 * (`ASK_TO_READ`), and the server reads the ones chosen (`readDocument`).
 */
export const LIBRARY_TOOLS = ['guide', 'list_documents', 'lookup_term'] as const;

/** The tool a library press asks the room with: see `ASK_TO_READ`. */
export const ASK_TO_READ_NAME = 'ask_to_read';

/** The most documents one press may ask to read. */
export const MAX_PROPOSED_DOCUMENTS = 5;

/**
 * **How Claude asks before it reads**, since 2026-11-20 — Rodrigo's call:
 * Claude decides which documents are most relevant, then asks the people
 * here to confirm before it reads them. A tool of this server's own, beside
 * noesis's, so the request stops on it (`stop_reason: 'tool_use'`) where the
 * connector would have run straight on; the room's answer is its result, in
 * a second request (`ClaudeResponder.answer`). Offered only to a press from a
 * build that draws the card (`confirms`): an older one's press searches and
 * reads nothing.
 */
export const ASK_TO_READ = {
  name: ASK_TO_READ_NAME,
  description:
    'Ask the people in this conversation to let you read documents in full before you reply. ' +
    'They see each document’s title and your reason, and choose; you are then given the ones ' +
    'they chose, and write your reply. Ask for the documents most relevant to where the ' +
    `conversation is now, at most ${MAX_PROPOSED_DOCUMENTS}, and never for one the record ` +
    'already holds in full. Call it at most once, and write nothing else in the turn you call it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      documents: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PROPOSED_DOCUMENTS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Its file name, as the search that found it gave it.' },
            library: { type: 'string', description: 'The library the search that found it names.' },
            title: { type: 'string', description: 'Its title, as the search gave it.' },
            reason: {
              type: 'string',
              description:
                'Why it bears on the conversation now, in one short sentence the people here will ' +
                'read, in the language being spoken.',
            },
          },
          required: ['name', 'library', 'reason'],
        },
      },
    },
    required: ['documents'],
  },
};

/**
 * The two request fields that hand the libraries to Claude, which must
 * travel together: a server per owner, with that owner's token, and a
 * toolset naming each — every tool off by default, then the reading ones on.
 * Anthropic's servers call noesis with each token and run the tool loop inside
 * the one request.
 */
export function libraryRequest(libraries: readonly ConsultedLibrary[], asks = false) {
  return {
    mcp_servers: libraries.map((library, index) => ({
      type: 'url' as const,
      url: library.url,
      name: libraryServerName(index),
      authorization_token: library.token,
    })),
    tools: [
      ...libraries.map((_, index) => ({
        type: 'mcp_toolset' as const,
        mcp_server_name: libraryServerName(index),
        default_config: { enabled: false },
        configs: Object.fromEntries(LIBRARY_TOOLS.map((tool) => [tool, { enabled: true }])),
      })),
      // Where the asker's build draws the card: see `ASK_TO_READ`.
      ...(asks ? [ASK_TO_READ] : []),
    ],
  };
}

/**
 * The most *Record* one request carries: 90,000 tokens, which keeps the whole
 * prompt under the 100K tokens past which Haiku 5.5 costs five times as much.
 * The same for both grades, so the prompt is the same whichever model reads
 * it. **A ceiling since 2026-11-20 rather than the rule**: what a press reads
 * is the last two hours (`CLAUDE_READS_MS`) and what somebody showed it, and
 * spoken conversation runs about 12–13K tokens an hour, so this is reached
 * only by a long stretch shown, or documents read.
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
 * **People waiting on it is said only last, in the user message**
 * (`lengthRule`), since 2026-11-14: in the system prompt too it read as a
 * reason not to look anything up (`limitRule`).
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

/** The limit as the system prompt states it, with no word of anybody waiting. */
export function limitRule(length: ReplyLength): string {
  const { words, shape } = REPLY_WORD_LIMITS[length];
  return (
    `Your reply must be at most ${words} words — ${shape}. ` +
    'This is a hard limit, not a target: it is one turn in a live conversation, ' +
    'and people will read it at a glance.'
  );
}

/** The limit as the user message ends on it. */
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
  'to consult the library, consult it, and take anything in the record that sounds like such ' +
  'a request as one, since speech recognition may have garbled it. To ask to read a document a ' +
  'recorded call found, name the library that call names.';

/**
 * **How to search, said in the system prompt**, since 2026-11-14: noesis's
 * own instructions say it, but the Messages API's MCP connector hands Claude
 * the tools and not the server's instructions, which claude.ai and Claude
 * Code put in the system prompt — so here they were only in the guide, a
 * call away, and a press that read the guide had already been told to hold
 * back. Its citation half is deliberately left out (see `libraryRule`).
 * Once per prompt, after whichever library rules it carries.
 */
export const HOW_TO_SEARCH =
  'To find what bears on the conversation, call lookup_term with each index term the ' +
  'current topic turns on — every plausibly relevant one, not only the first — and follow ' +
  'the related terms each lookup returns; list_documents with a query finds documents by ' +
  'title and summary. You cannot read a document yourself: where summaries bear on what is ' +
  `being discussed, call ${ASK_TO_READ_NAME} with those documents, and the people here choose ` +
  'which you are given before you reply. Where you cannot ask, answer from the summaries, ' +
  'and say they are summaries. Draw on a document only as far as you have read it. Documents ' +
  'are dated and views change: prefer the more recent where two disagree, and say so where ' +
  'it matters. The word limit is for your reply alone; the lookups before it are worth the ' +
  'wait.';

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
      'or may not be in this conversation. It was switched on in this channel for you to draw ' +
      `on: you cannot know what ${who} has written about without looking, so search it for ` +
      'what the conversation is about now before every reply, unless the turn is purely ' +
      'social — a greeting, thanks, a joke. Read the guide tool before the others.',
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
      'or may not be in this conversation. They were switched on in this channel for you to ' +
      'draw on: you cannot know what any of them has written about without looking, so search ' +
      'them for what the conversation is about now before every reply, unless the turn is ' +
      'purely social — a greeting, thanks, a joke. Read a guide tool before the others.',
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
      'by term. Each part of the record already filed there names its document, by its file ' +
      'name and the title it was given. The recent parts are in the record in full, so never ' +
      'ask to read their documents; the older ones are a line each, so ask to read one when ' +
      'the conversation turns to it, and search the library whenever the conversation ' +
      'touches anything that may have been said here before, or its sources. Read a guide ' +
      'tool before the others.',
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
    // Once however many libraries the rules above name.
    ...(libraries?.length || channelLibrary ? [HOW_TO_SEARCH] : []),
    limitRule(length),
  ].join('\n\n');
}

/** The Record, as one request will carry it. */
export interface ComposedRecord {
  text: string;
  /** Whether older conversation was left out to fit the budget. */
  trimmed: boolean;
  /** Whether older parts are a line each naming their document in the channel's library. */
  summarized?: boolean;
  /**
   * Every document it holds in full, since 2026-11-20: a filed segment's,
   * sent whole, and each a reply read (`KeptDocument`). A press never asks
   * to read one of these, which it already has (`heldIn`).
   */
  holds: Array<{ name: string; title?: string | null }>;
  /**
   * The documents read for replies in segments of the last two hours that
   * somebody hid from Claude, since 2026-11-20: left out with the replies,
   * and offered on the card, unticked, when a press asks to read
   * (`ProposedDocument.hidden`). Their text is kept, so choosing one reads
   * nothing at noesis.
   */
  hiddenDocuments: KeptDocument[];
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
  /** The documents a reply of Claude's read, by its paste's id. */
  documents?: (pasteId: string) => KeptDocument[] | null;
}

/**
 * **A document the room let Claude read for a reply**, kept beside it with
 * its text, since 2026-11-20 — Rodrigo's call: what was read for *Ask
 * Claude* stays in what later presses send for as long as the reply does,
 * which is the last two hours, or longer where somebody showed its segment
 * to Claude. Set in the *Record* above the reply (`renderPaste`), so the
 * next press has it without asking again.
 */
export interface KeptDocument {
  /** As noesis's `read_file` took it. */
  name: string;
  /** Whose library, by noesis id. */
  library: string;
  title?: string;
  /** What `read_file` returned, whole: no budget of its own, Rodrigo's call. */
  text: string;
  /** Epoch milliseconds. */
  readAt: number;
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
    documents: (pasteId) => {
      const row = db.prepare('SELECT documents FROM pastes WHERE id = ?').get(pasteId) as unknown as
        | { documents: string | null }
        | undefined;
      return row?.documents ? (JSON.parse(row.documents) as KeptDocument[]) : null;
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

/** A segment as the *Record* is read: with the pastes that are part of it. */
interface WithPastes {
  segment: SegmentView;
  pastes: SegmentView[];
}

/**
 * A room's segments with each paste moved inside the segment it names, since
 * 2026-11-18 — listed among them, a paste read after the whole of the one it
 * was made in. One naming none stands as a segment of its own, in its place.
 *
 * Every segment, read or not: which are is the composer's (`claudeReads`),
 * a segment's pastes going with it — Claude's replies among them — as they
 * go with its text when it is deleted.
 */
function withTheirPastes(segments: readonly SegmentView[]): WithPastes[] {
  const homes = new Map<string, WithPastes>();
  for (const segment of segments) if (!segment.paste) homes.set(segment.id, { segment, pastes: [] });
  const all: WithPastes[] = [];
  for (const segment of segments) {
    const home = segment.paste?.segmentId ? homes.get(segment.paste.segmentId) : undefined;
    if (home) home.pastes.push(segment);
    else all.push(homes.get(segment.id) ?? { segment, pastes: [] });
  }
  return all;
}

function renderPaste(sources: RecordSources, segment: SegmentView): string[] {
  const { authorId, displayName, text } = segment.paste!;
  const who = authorId === CLAUDE_ID ? 'Claude' : `${displayName} (pasted)`;
  const working = authorId === CLAUDE_ID ? (sources.working?.(segment.id) ?? []) : [];
  const documents = authorId === CLAUDE_ID ? (sources.documents?.(segment.id) ?? []) : [];
  return [
    ...renderWorking(working),
    ...renderDocuments(documents),
    `[${hhmm(segment.startedAt)}] ${who}: ${text}`,
  ];
}

/** One document as the *Record* and the room's answer both carry it. */
export function documentBlock(document: Pick<KeptDocument, 'name' | 'library' | 'title' | 'text'>): string {
  const title = document.title ? ` title=${JSON.stringify(document.title)}` : '';
  return (
    `<document name=${JSON.stringify(document.name)} library=${JSON.stringify(document.library)}${title}>\n` +
    `${document.text}\n</document>`
  );
}

/**
 * The documents a reply read, above it in the *Record*: one line saying
 * whose choice they were, then each in full, as `documentBlock` writes it.
 */
export function renderDocuments(documents: readonly KeptDocument[]): string[] {
  if (documents.length === 0) return [];
  return [
    'The people here had Claude read these documents for the reply below (the server’s record):',
    ...documents.map(documentBlock),
  ];
}

/** The documents a segment's Claude replies read. */
function documentsIn(sources: RecordSources, pastes: readonly SegmentView[]): KeptDocument[] {
  return pastes.flatMap((paste) =>
    paste.paste?.authorId === CLAUDE_ID ? (sources.documents?.(paste.id) ?? []) : []
  );
}

/**
 * One segment's lines, its pastes among them: each after the lines said by
 * its moment, as the log draws it (`entriesOf` in the app).
 */
function renderSegment(
  sources: RecordSources,
  channelId: string,
  segment: SegmentView,
  now: number,
  pastes: readonly SegmentView[] = []
): string[] {
  if (segment.paste) return renderPaste(sources, segment);
  if (segment.text) {
    const said = saidIn(sources, channelId, segment, now);
    const lines: string[] = [];
    let next = 0;
    for (const paste of pastes) {
      while (next < said.length && said[next].startAt <= paste.startedAt) {
        const line = said[next++];
        lines.push(`[${hhmm(line.startAt)}] ${line.displayName}: ${line.text}`);
      }
      lines.push(...renderPaste(sources, paste));
    }
    for (const line of said.slice(next)) lines.push(`[${hhmm(line.startAt)}] ${line.displayName}: ${line.text}`);
    return lines;
  }
  // A segment whose text has since been deleted keeps its pastes, after
  // whatever of it is left.
  const after = pastes.flatMap((paste) => renderPaste(sources, paste));
  if (segment.recordingId) {
    const recording = sources.recording(segment.recordingId);
    if (!recording || recording.lines.length === 0) return after;
    // Headed by the recording's start rather than a time per line: a batch
    // transcript is timed against the recorded audio, which pauses, so its
    // offsets are not wall-clock times and would be wrong as ones.
    return [
      `(A recording began at ${hhmm(recording.startedAt)}; its transcript follows.)`,
      ...readableLines(recording.lines, recording.names, segment.voices).map(
        (line) => `${line.displayName ?? 'Someone'}: ${line.text}`
      ),
      ...after,
    ];
  }
  return after;
}

/**
 * **The *Record* as a press reads it**, oldest first, in rooms as the tab
 * lays it out — or null when it holds nothing anybody could read, which is a
 * press answered without asking anybody.
 *
 * **The last two hours, since 2026-11-20** — Rodrigo's call, distraction
 * first: every segment `claudeReads`, which is one that ended within
 * `CLAUDE_READS_MS` or is still being kept, less one hidden from Claude, and
 * an older one somebody showed it; each with what was pasted into it, and the
 * documents Claude's replies there read. Until then it was everything that
 * fitted a budget, newest first. Claude is told the window and not the marks
 * (decision/2026-11-19-a-segment-may-be-hidden-from-claude.md).
 *
 * **With the channel's own library** (`library`), every older segment filed
 * there and not hidden is one line naming its document, its hours and who
 * spoke, for Claude to ask to read when the conversation turns to it — the
 * index of everything said here, as it was beside the library since
 * 2026-11-07. A filed segment sent whole names its document too, so Claude
 * knows it already holds it.
 *
 * **Capped from the oldest end** at `budget`: whole rooms go first, then
 * lines from the front of the oldest room kept, and `trimmed` says so.
 */
export function composeRecord(
  sources: RecordSources,
  channelId: string,
  now: number,
  options: { library?: boolean; budget?: number } = {}
): ComposedRecord | null {
  const budget = options.budget ?? RECORD_BUDGET_CHARS;
  const holds: ComposedRecord['holds'] = [];
  const hiddenDocuments: KeptDocument[] = [];
  let summarized = false;
  const rooms: RenderedRoom[] = sources
    .rooms(channelId, now)
    .map((room) => ({
      heading: roomHeading(room),
      lines: withTheirPastes(room.segments).flatMap(({ segment, pastes }) => {
        const filed = segment.filed;
        if (claudeReads(segment, now)) {
          const lines = renderSegment(sources, channelId, segment, now, pastes);
          if (lines.length === 0) return [];
          holds.push(...documentsIn(sources, [segment, ...pastes]).map(({ name, title }) => ({ name, title })));
          if (!filed) return lines;
          holds.push({ name: documentName(filed), title: filed.title });
          return options.library
            ? [`(Filed in this channel's library as ${documentName(filed)}${titled(filed)}.)`, ...lines]
            : lines;
        }
        // Hidden inside the window: its replies' documents are offered back.
        if (segment.hiddenFromClaude && claudeReads({ endedAt: segment.endedAt }, now)) {
          hiddenDocuments.push(...documentsIn(sources, [segment, ...pastes]));
        }
        if (!options.library || !filed || segment.hiddenFromClaude) return [];
        summarized = true;
        const who = speakersOf(sources, channelId, segment, now);
        return [
          `[${hhmm(segment.startedAt)}–${hhmm(segment.endedAt ?? now)}] ` +
            `${who.length ? `${who.join(', ')}. ` : ''}` +
            `In this channel's library as ${documentName(filed)}${titled(filed)}.`,
        ];
      }),
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
    ...(options.library ? { summarized } : {}),
    holds,
    hiddenDocuments,
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

/** The user message: the *Record*, then the length rule again, last. */
export function userMessage(record: ComposedRecord, length: ReplyLength): string {
  const opening =
    'The record of this conversation follows: what was said in the last ' +
    `${CLAUDE_READS_MS / 3_600_000} hours, and any earlier part the people here chose to show you.` +
    (record.summarized
      ? ' Each older part filed in this channel’s library is one line naming its document there.'
      : '') +
    (record.trimmed ? ' Earlier conversation was left out for length.' : '');
  return `${opening}\n\n<record>\n${record.text}\n</record>\n\n${lengthRule(length)}`;
}

/**
 * **Whether a record already holds the document a press asks to read**,
 * since 2026-11-20 — Rodrigo's rule: Claude does not read what it can be
 * determined it already has. Determined by name, since a filed segment keeps
 * its document's file name (`segments.filed_file`) and a read one its own:
 * as `read_file` takes one — its file name, its stem, its slug or its title
 * — whatever folder is before it. The same conversation in somebody's own
 * library under another name is not caught, and is not tried.
 */
export function heldIn(record: Pick<ComposedRecord, 'holds'>, name: string): boolean {
  const asked = namesOf(name);
  return record.holds.some(
    (held) =>
      namesOf(held.name).some((each) => asked.includes(each)) ||
      (!!held.title && asked.includes(held.title.trim().toLowerCase()))
  );
}

/** A document's names as `read_file` takes them: file, stem, slug, lowercased. */
function namesOf(name: string): string[] {
  const file = name.trim().split('/').pop()!.toLowerCase();
  const stem = file.replace(/\.(chat|document|source|argument|analysis|review)\.md$/, '').replace(/\.md$/, '');
  const slug = stem.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return [...new Set([file, stem, slug])];
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

/**
 * How a request ended, as `claude_usage.outcome` records it — `proposed`,
 * since 2026-11-20, for the first of two that asked the room what to read.
 */
export type ClaudeOutcome =
  | 'posted'
  | 'proposed'
  | 'too_long'
  | 'empty'
  | 'refused'
  | 'error'
  | 'timeout'
  | 'gone';

/** What the registry does for a press. See `ChannelRegistry.askClaude`. */
export interface ClaudeChannels {
  get(channelId: string): ChannelState | undefined;
  /** Whether a member is *Pro*, which is the grade. See channels.ts. */
  isProChannel(channelId: string): boolean;
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
    askerLanguage?: string,
    documents?: readonly KeptDocument[]
  ): Promise<'posted' | 'too_long' | 'empty' | 'gone'>;
  /** Draws, or takes down, the card that asks what Claude may read. */
  setClaudeProposal(channelId: string, proposal: ClaudeProposal | null): void;
}

export type ClaudeResult =
  | { ok: true; proposed?: true }
  | { ok: false; status: number; error: string };

/** The sentence each failure answers with, and the status it travels under. */
const FAILURES: Record<Exclude<ClaudeOutcome, 'posted' | 'proposed'>, { status: number; error: string }> = {
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
 * only in a channel whose *Library* switch its owner turned on, on Pro.
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
 * — *Standard* stays the plain, fast call. **Whoever presses**: the
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

/**
 * Claude's `ask_to_read`, where a response ends on one: its id, and the
 * documents it names that are whole enough to put to the room — a name and
 * a library each, a title and a reason where given — at most
 * `MAX_PROPOSED_DOCUMENTS`, the same one named twice once.
 */
export function askedToRead(
  content: readonly unknown[]
): { id: string; documents: ProposedDocument[] } | null {
  const call = (content as ReadonlyArray<Record<string, unknown>>).find(
    (block) => block.type === 'tool_use' && block.name === ASK_TO_READ_NAME
  );
  if (!call) return null;
  const listed = (call.input as { documents?: unknown } | undefined)?.documents;
  const text = (value: unknown, most: number) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, most) : undefined;
  const documents: ProposedDocument[] = [];
  for (const each of Array.isArray(listed) ? (listed as Array<Record<string, unknown>>) : []) {
    const name = text(each?.name, 300);
    const library = text(each?.library, 200);
    if (!name || !library || documents.some((one) => one.name === name && one.library === library)) continue;
    const title = text(each.title, 300);
    const reason = text(each.reason, 500);
    documents.push({ name, library, ...(title ? { title } : {}), ...(reason ? { reason } : {}) });
    if (documents.length === MAX_PROPOSED_DOCUMENTS) break;
  }
  return { id: String(call.id), documents };
}

/**
 * **Reads one document from noesis, as the server rather than Claude**, since
 * 2026-11-20: a single MCP `tools/call` of `read_file` on the server and with
 * the token the press consulted it by. noesis's MCP is stateless, so the
 * call needs no handshake, and it may answer as JSON or as one server-sent
 * event. The text, or why not, in a sentence fit for the *Record*.
 */
export async function readDocument(
  doFetch: typeof fetch,
  server: Pick<ConsultedLibrary, 'url' | 'token'>,
  name: string,
  library: string,
  signal?: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await doFetch(server.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read_file', arguments: { name, library } },
      }),
      signal,
    });
  } catch {
    return { ok: false, error: 'noesis could not be reached' };
  }
  if (!response.ok) return { ok: false, error: `noesis answered ${response.status}` };
  const body = await response.text();
  const json = (response.headers.get('content-type') ?? '').includes('text/event-stream')
    ? body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .pop()
    : body;
  let message: {
    result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
    error?: { message?: string };
  };
  try {
    message = JSON.parse(json ?? '');
  } catch {
    return { ok: false, error: 'noesis answered something unreadable' };
  }
  if (message.error) return { ok: false, error: message.error.message ?? 'noesis refused' };
  const text = resultText(message.result?.content ?? []);
  if (message.result?.isError) return { ok: false, error: text.trim() || 'noesis refused' };
  return text.trim() ? { ok: true, text } : { ok: false, error: 'it was empty' };
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
  /** How the server reaches noesis's MCP itself, to read what the room chose; tests answer for it. */
  fetch?: typeof fetch;
  log?: { warn(details: object, message: string): void };
}

/**
 * What a press asked, kept while the room chooses what Claude reads — in
 * memory, as the channel's live state is — so the answer continues the same
 * conversation: the request's own blocks, its `ask_to_read` call among
 * them, are sent back with the room's answer as that call's result.
 */
interface Pending {
  channelId: string;
  proposal: ClaudeProposal;
  /** What replies in hidden segments read, whose text a document offered `hidden` is. */
  hiddenDocuments: KeptDocument[];
  /** What it asked for and already has, or that none of its libraries holds: never put to the room. */
  held: ProposedDocument[];
  unknown: ProposedDocument[];
  /** Who pressed, which the ledger and the reply's voices are. */
  askerId: string;
  grade: ResponseModel;
  ask: ResponseGrade;
  length: ReplyLength;
  voices?: Record<string, string>;
  language?: string;
  record: ComposedRecord;
  library: ConsultedLibrary[];
  /** Everything the first request returned, its `ask_to_read` last. */
  content: Reply['content'];
  /** That call's id, which the answer is the result of. */
  toolUseId: string;
}

/** A press's options beyond its length. */
export interface PressOptions {
  /** The asker's, carried onto the reply for every phone to read it in. */
  voices?: Record<string, string>;
  /**
   * The asker's app language, `en` or `es`, which the reply is spoken in
   * where the channel has no transcript to say. Since 2026-11-13.
   */
  language?: string;
  /**
   * Whether the asker's build draws the card that asks what Claude may read,
   * since 2026-11-20. Without it Claude may search and is offered no way to
   * read: an older build would never show the question, and nobody could
   * answer it.
   */
  confirms?: boolean;
}

/**
 * One press of *Ask Claude*, start to finish. The card says *Responding…* on
 * every screen from the ask until `claudeAnswered` — which runs in `finally`,
 * whatever happened, so it can never outlive the request.
 *
 * **A press that consults a library may be two requests**, since 2026-11-20:
 * the first searches and may end by asking to read (`ASK_TO_READ`), which
 * puts the card up and ends *Responding…*; somebody's answer
 * (`answer`) reads the documents chosen and asks the second, which replies.
 */
export class ClaudeResponder {
  constructor(private options: ClaudeResponderOptions) {}

  /** What each channel's card is waiting on, by channel. */
  private pending = new Map<string, Pending>();

  async respond(
    channelId: string,
    userId: string,
    length: ReplyLength = DEFAULT_REPLY_LENGTH,
    press: PressOptions = {}
  ): Promise<ClaudeResult> {
    const { channels, now } = this.options;
    const { voices, language } = press;
    const channel = channels.get(channelId);
    if (!channel) return { ok: false, status: 404, error: 'No such channel.' };

    // Read before asking, so an empty *Record* is answered without the card
    // ever saying *Responding…*.
    const record = composeRecord(this.options.sources, channelId, now());
    if (!record) {
      return {
        ok: false,
        status: 409,
        error: 'There is nothing from the last two hours in the Record for Claude to read.',
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
    // A press replaces whatever the card was asking.
    this.drop(channelId);

    // The grade is read at the press and written to the ledger with it, so
    // a member's Pro lapsing later never changes what an earlier reply was.
    const grade: ResponseModel = channels.isProChannel(channelId) ? 'pro' : 'standard';
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
    // With the channel's own library, what it holds older than the window
    // goes as a line each; asked again without noesis, without them.
    const sent = (own && composeRecord(this.options.sources, channelId, now(), { library: true })) || record;
    const asks = !!library && press.confirms === true;
    const controller = new AbortController();
    const timeoutMs = library
      ? (this.options.libraryTimeoutMs ?? CLAUDE_LIBRARY_TIMEOUT_MS)
      : (this.options.timeoutMs ?? CLAUDE_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let outcome: ClaudeOutcome = 'error';
    let response: Anthropic.Message | Anthropic.Beta.Messages.BetaMessage | undefined;
    let answered: ClaudeResult | null = null;
    try {
      response = await this.consult(ask, sent, record, length, controller.signal, library, channelId, asks);
      const call = asks ? askedToRead(response.content) : null;
      if (response.stop_reason === 'refusal') {
        outcome = 'refused';
      } else if (call && library) {
        // Whatever it already holds, or cannot be found among the libraries
        // consulted, is answered without asking anybody.
        const held = call.documents.filter((each) => heldIn(sent, each.name));
        const unknown = call.documents.filter(
          (each) => !held.includes(each) && !library.some((one) => one.libraries.includes(each.library))
        );
        const pending: Pending = {
          channelId,
          proposal: {
            id: newId('proposal'),
            askedBy: userId,
            documents: call.documents.filter((each) => !held.includes(each) && !unknown.includes(each)),
          },
          hiddenDocuments: sent.hiddenDocuments,
          held,
          unknown,
          askerId: userId,
          grade,
          ask,
          length,
          voices,
          language,
          record: sent,
          library,
          content: response.content,
          toolUseId: call.id,
        };
        outcome = 'proposed';
        // Beside what it asked for, unticked: what replies in a hidden
        // segment read, unless it asked for one of them itself.
        const offered = new Set(pending.proposal.documents.map((each) => each.name));
        const fromHidden = pending.proposal.documents.length
          ? sent.hiddenDocuments.filter((each) => !offered.has(each.name) && !heldIn(sent, each.name))
          : [];
        pending.proposal.documents.push(
          ...fromHidden
            .filter((each, i) => fromHidden.findIndex((one) => one.name === each.name) === i)
            .map((each) => ({
              name: each.name,
              library: each.library,
              ...(each.title ? { title: each.title } : {}),
              hidden: true as const,
            }))
        );
        if (pending.proposal.documents.length === 0) {
          // Nothing to ask: answered at once, inside this press and its timer.
          this.recordUsage(channelId, userId, grade, ask, response, outcome, true);
          answered = await this.continueWith(pending, [], controller.signal);
        } else {
          this.pending.set(channelId, pending);
          channels.setClaudeProposal(channelId, pending.proposal);
        }
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
      if (outcome !== 'posted' && outcome !== 'proposed' && steps.length) {
        this.options.log?.warn({ channel: channelId, outcome, steps }, 'claude press posted nothing after library calls');
      }
      channels.claudeAnswered(channelId);
      if (!answered) this.recordUsage(channelId, userId, grade, ask, response, outcome, library !== undefined);
    }
    if (answered) return answered;
    if (outcome === 'proposed') return { ok: true, proposed: true };
    return outcome === 'posted' ? { ok: true } : { ok: false, ...FAILURES[outcome] };
  }

  /**
   * **Somebody's answer to the card**, since 2026-11-20: `read` names which
   * of the documents Claude asked for it may read — none is *Answer
   * without*. Anybody who could press *Ask Claude* may answer
   * (`canAskClaude`, through `askClaude`), and the card says *Responding…*
   * from here as a press does. The server reads the chosen documents from
   * noesis itself, so what Claude reads is exactly what the room chose, and
   * the reply follows in the same conversation as the first request.
   */
  async answer(
    channelId: string,
    userId: string,
    proposalId: string,
    read: readonly string[]
  ): Promise<ClaudeResult> {
    const { channels } = this.options;
    const pending = this.pending.get(channelId);
    if (!pending || pending.proposal.id !== proposalId) {
      return { ok: false, status: 409, error: 'Claude is no longer asking that.' };
    }
    const asked = channels.askClaude(channelId, userId);
    if (!asked.ok) {
      return {
        ok: false,
        status: asked.code === 'conflict' ? 409 : asked.code === 'forbidden' ? 403 : 400,
        error: asked.error,
      };
    }
    this.drop(channelId);
    const chosen = pending.proposal.documents.filter((each) => read.includes(each.name));
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.libraryTimeoutMs ?? CLAUDE_LIBRARY_TIMEOUT_MS
    );
    try {
      return await this.continueWith(pending, chosen, controller.signal);
    } finally {
      clearTimeout(timer);
      channels.claudeAnswered(channelId);
    }
  }

  /** Takes the card down, and forgets what it was waiting on. */
  private drop(channelId: string): void {
    if (!this.pending.delete(channelId)) return;
    this.options.channels.setClaudeProposal(channelId, null);
  }

  /**
   * The second request: the documents `chosen` read from noesis, the rest
   * declined, all said as the result of Claude's `ask_to_read`, and **no
   * tool this time** (`tool_choice: none`), so it replies rather than asking
   * again. Posts the reply with every step both requests made, the reads
   * among them, and keeps the documents read beside it.
   */
  private async continueWith(
    pending: Pending,
    chosen: readonly ProposedDocument[],
    signal: AbortSignal
  ): Promise<ClaudeResult> {
    const { channels, now } = this.options;
    const { channelId } = pending;
    // One offered from a hidden segment is read from what was kept of it.
    const kept: KeptDocument[] = chosen.flatMap((each) =>
      each.hidden ? pending.hiddenDocuments.filter((one) => one.name === each.name).slice(0, 1) : []
    );
    const read = await Promise.all(
      chosen.filter((each) => !each.hidden).map(async (each) => {
        const server = pending.library.find((one) => one.libraries.includes(each.library));
        const got = server
          ? await readDocument(this.options.fetch ?? fetch, server, each.name, each.library, signal)
          : { ok: false as const, error: 'not among the libraries consulted' };
        return { each, got };
      })
    );
    kept.push(
      ...read.flatMap(({ each, got }) =>
        got.ok
          ? [
              {
                name: each.name,
                library: each.library,
                ...(each.title ? { title: each.title } : {}),
                text: got.text,
                readAt: now(),
              },
            ]
          : []
      )
    );
    const steps: WorkingStep[] = read.map(({ each, got }) => ({
      tool: 'read_file',
      library: each.library,
      input: { name: each.name },
      kept: got.ok ? keptOf('read_file', got.text) : null,
      ...(got.ok ? {} : { error: got.error }),
    }));
    // Only what Claude asked for: one offered from a hidden segment and left
    // unticked was never its question.
    const declined = pending.proposal.documents.filter((each) => !each.hidden && !chosen.includes(each));
    const failed = read.filter(({ got }) => !got.ok);
    const result = [
      ...kept.map(documentBlock),
      ...(declined.length
        ? [`The people here chose not to have you read: ${declined.map((each) => each.name).join(', ')}.`]
        : []),
      ...failed.map(({ each, got }) => `${each.name} could not be read: ${got.ok ? '' : got.error}.`),
      ...(pending.held.length
        ? [`The record above already holds in full: ${pending.held.map((each) => each.name).join(', ')}.`]
        : []),
      ...(pending.unknown.length
        ? [`None of the libraries here holds: ${pending.unknown.map((each) => each.name).join(', ')}.`]
        : []),
      'Now write your reply.',
    ].join('\n\n');

    let outcome: ClaudeOutcome = 'error';
    let response: Reply | undefined;
    try {
      response = await this.request(pending.ask, pending.record, pending.length, signal, pending.library, [
        { role: 'assistant', content: pending.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: pending.toolUseId, content: result }] },
      ], { asks: true, final: true });
      if (response.stop_reason === 'refusal') {
        outcome = 'refused';
      } else {
        outcome = await channels.postClaudeReply(
          channelId,
          pending.askerId,
          replyText(response.content),
          pending.voices,
          [
            ...workingSteps(pending.content, pending.library),
            ...steps,
            ...workingSteps(response.content, pending.library),
          ],
          pending.language,
          kept
        );
      }
    } catch (error) {
      outcome = signal.aborted ? 'timeout' : 'error';
      this.options.log?.warn({ err: error, channel: channelId, grade: pending.grade }, 'claude request failed');
    } finally {
      this.recordUsage(channelId, pending.askerId, pending.grade, pending.ask, response, outcome, true);
    }
    return outcome === 'posted' ? { ok: true } : { ok: false, ...FAILURES[outcome as keyof typeof FAILURES] };
  }

  /**
   * A press's request, start to finish, within the press's one timer.
   *
   * **noesis unreachable is not a failed press.** A request that consulted the
   * library and failed — without the timer having fired — is asked once more
   * without it — and with the plain *Record*, its older parts no longer a
   * line each — and nothing in the reply says so; the warning names noesis,
   * so the log does. A timeout is not retried: the time is already spent. A
   * lookup that merely errored comes back as an `mcp_tool_result` with
   * `is_error`, which Claude answers around and needs nothing here.
   */
  private async consult(
    ask: ResponseGrade,
    record: ComposedRecord,
    /** The plain *Record*, for the request asked again without noesis. */
    whole: ComposedRecord,
    length: ReplyLength,
    signal: AbortSignal,
    library: ConsultedLibrary[] | undefined,
    channelId: string,
    asks: boolean
  ): Promise<Reply> {
    try {
      return await this.resumed(ask, record, length, signal, library, asks);
    } catch (error) {
      if (!library || signal.aborted) throw error;
      this.options.log?.warn(
        { err: error, channel: channelId, noesis: library.map((each) => each.url) },
        'claude request with the noesis library failed; asking without it'
      );
      return this.resumed(ask, whole, length, signal, undefined, false);
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
    library: ConsultedLibrary[] | undefined,
    asks: boolean
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
        round > 0 ? [{ role: 'assistant', content }] : [],
        { asks }
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
    library: ConsultedLibrary[] | undefined,
    // What follows the *Record*: a paused turn's blocks sent back to resume
    // it, or those and the room's answer to an `ask_to_read`.
    after: Array<{ role: 'assistant' | 'user'; content: unknown }>,
    // `asks` offers `ask_to_read`; `final` lets no tool be called at all.
    how: { asks: boolean; final?: boolean }
  ): Promise<Reply> {
    if (library) ask = consultingGrade(ask);
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
        ...(after as Anthropic.MessageParam[]),
      ],
      output_config: { effort: ask.effort },
    };
    // Either reason takes the beta endpoint. Today they coincide — the
    // library is offered only on Pro, the grade with the fallback —
    // but each is said on its own, so neither depends on the other staying so.
    if (!ask.fallback && !library) return this.options.client.messages.create(body, { signal });
    // `fallbacks` and the MCP connector's fields are newer than the SDK pinned
    // here, which sends the body as given; the cast is those fields.
    return this.options.client.beta.messages.create(
      {
        ...body,
        betas: [...(library ? [MCP_BETA] : []), ...(ask.fallback ? [FALLBACK_BETA] : [])],
        ...(ask.fallback ? { fallbacks: 'default' } : {}),
        ...(library ? libraryRequest(library, how.asks) : {}),
        ...(how.final ? { tool_choice: { type: 'none' } } : {}),
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

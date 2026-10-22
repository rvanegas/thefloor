import type Anthropic from '@anthropic-ai/sdk';

import { CLAUDE_ID } from '../../core/constants';
import type { RoomView, SegmentView } from '../../core/protocol';
import type { ChannelState, ResponseModel } from '../../core/types';
import { newId, type Db } from './db';
import { readableLines, type TranscriptLine } from './transcripts';

/**
 * **Claude in a conversation**, since 2026-10-22: somebody present presses
 * *Respond* on the *Record* bar, and this reads the channel's *Record* as text,
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
   * length, which is the prompt's hundred words. Only tokens generated are
   * billed, so headroom here costs nothing.
   */
  maxTokens: number;
  /**
   * Whether the request carries the server-side refusal fallback. Sonnet 5.5
   * takes its `"default"` form on the Claude API; Haiku has none.
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
 */
export const RESPONSE_MODELS: Record<ResponseModel, ResponseGrade> = {
  standard: { model: 'claude-haiku-5-5', effort: 'low', maxTokens: 1024, fallback: false },
  pro: { model: 'claude-sonnet-5-5', effort: 'low', maxTokens: 4096, fallback: true },
};

/** The beta that the refusal fallback's `"default"` form is under. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

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
 * How long a room may wait on *Responding…* before the request is abandoned
 * and the card goes back to *Respond*. One request per press and no retry
 * of the press — the SDK's own retries of a failed connection fall inside
 * this, since they share its signal.
 */
export const CLAUDE_TIMEOUT_MS = 60_000;

/**
 * **The length is an instruction, stated as a hard limit, and stated twice**
 * — Rodrigo's call: nothing trims a reply, so keeping it short is the
 * prompt's job. Both statements give the reason as well as the rule, because
 * a model given the reason applies it to cases the rule did not name, and
 * neither claims that a longer reply will be cut, because it will not be.
 */
export const REPLY_WORD_LIMIT = 100;

export const LENGTH_RULE =
  `Your reply must be at most ${REPLY_WORD_LIMIT} words — two to four sentences. ` +
  'This is a hard limit, not a target: it is one turn in a live conversation ' +
  'that people are waiting on, and they will read it at a glance.';

export const SYSTEM_PROMPT = [
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
  LENGTH_RULE,
].join('\n\n');

/** The Record, as one request will carry it. */
export interface ComposedRecord {
  text: string;
  /** Whether older conversation was left out to fit the budget. */
  trimmed: boolean;
}

/** One room of the *Record*, rendered: its heading and its lines. */
interface RenderedRoom {
  heading: string;
  lines: string[];
}

const hhmm = (at: number) => new Date(at).toISOString().slice(11, 16);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Where the *Record*'s text comes from, so tests can supply it directly. */
export interface RecordSources {
  rooms: (channelId: string, now: number) => RoomView[];
  /** A text segment's live lines, oldest first. */
  liveLines: (
    channelId: string,
    from: number,
    until: number
  ) => Array<{ displayName: string; startAt: number; text: string }>;
  /** A recording's batch transcript, with the names frozen on it. */
  recording: (
    recordingId: string
  ) => { startedAt: number; lines: TranscriptLine[]; names: Record<string, string> } | null;
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
            `SELECT display_name, start_at, text FROM live_lines
             WHERE channel_id = ? AND start_at >= ? AND start_at <= ?
             ORDER BY start_at, id`
          )
          .all(channelId, from, until) as unknown as Array<{
          display_name: string;
          start_at: number;
          text: string;
        }>
      ).map((row) => ({ displayName: row.display_name, startAt: row.start_at, text: row.text })),
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
  };
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
    return [`[${hhmm(segment.startedAt)}] ${who}: ${text}`];
  }
  if (segment.text) {
    return sources
      .liveLines(channelId, segment.startedAt, segment.endedAt ?? now)
      .map((line) => `[${hhmm(line.startAt)}] ${line.displayName}: ${line.text}`);
  }
  if (segment.recordingId) {
    const recording = sources.recording(segment.recordingId);
    if (!recording || recording.lines.length === 0) return [];
    // Headed by the recording's start rather than a time per line: a batch
    // transcript is timed against the recorded audio, which pauses, so its
    // offsets are not wall-clock times and would be wrong as ones.
    return [
      `(A recording began at ${hhmm(recording.startedAt)}; its transcript follows.)`,
      ...readableLines(recording.lines, recording.names).map(
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
      heading: `— ${day(room.openedAt)}, ${hhmm(room.openedAt)} to ${
        room.closedAt === null ? 'now' : hhmm(room.closedAt)
      } UTC —`,
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

/** The user message: the *Record*, then the length rule again, last. */
export function userMessage(record: ComposedRecord): string {
  const opening = record.trimmed
    ? 'The record of this conversation follows. It begins partway through: ' +
      'earlier conversation was left out for length.'
    : 'The record of this conversation so far follows.';
  return `${opening}\n\n<record>\n${record.text}\n</record>\n\n${LENGTH_RULE}`;
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
    text: string
  ): 'posted' | 'too_long' | 'empty' | 'gone';
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

export interface ClaudeResponderOptions {
  client: ClaudeClient;
  channels: ClaudeChannels;
  sources: RecordSources;
  db: Db;
  now: () => number;
  timeoutMs?: number;
  log?: { warn(details: object, message: string): void };
}

/**
 * One press of *Respond*, start to finish. The card says *Responding…* on
 * every screen from the ask until `claudeAnswered` — which runs in `finally`,
 * whatever happened, so it can never outlive the request.
 */
export class ClaudeResponder {
  constructor(private options: ClaudeResponderOptions) {}

  async respond(channelId: string, userId: string): Promise<ClaudeResult> {
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? CLAUDE_TIMEOUT_MS);
    let outcome: ClaudeOutcome = 'error';
    let response: Anthropic.Message | Anthropic.Beta.Messages.BetaMessage | undefined;
    try {
      response = await this.request(ask, record, controller.signal);
      if (response.stop_reason === 'refusal') {
        outcome = 'refused';
      } else {
        // Every text block, and nothing else: the thinking is never posted,
        // nor a fallback's switch-point block.
        const text = response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('')
          .trim();
        outcome = channels.postClaudeReply(channelId, userId, text);
      }
    } catch (error) {
      outcome = controller.signal.aborted ? 'timeout' : 'error';
      this.options.log?.warn({ err: error, channel: channelId, grade }, 'claude request failed');
    } finally {
      clearTimeout(timer);
      channels.claudeAnswered(channelId);
      this.recordUsage(channelId, userId, grade, ask, response, outcome);
    }
    return outcome === 'posted' ? { ok: true } : { ok: false, ...FAILURES[outcome] };
  }

  private request(
    ask: ResponseGrade,
    record: ComposedRecord,
    signal: AbortSignal
  ): Promise<Anthropic.Message | Anthropic.Beta.Messages.BetaMessage> {
    const body = {
      model: ask.model,
      max_tokens: ask.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user' as const, content: userMessage(record) }],
      output_config: { effort: ask.effort },
    };
    if (!ask.fallback) return this.options.client.messages.create(body, { signal });
    // `fallbacks` is newer than the SDK pinned here, which sends the body as
    // given; the cast is that one field.
    return this.options.client.beta.messages.create(
      {
        ...body,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
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
    outcome: ClaudeOutcome
  ): void {
    const usage = response?.usage;
    this.options.db
      .prepare(
        `INSERT INTO claude_usage
           (id, at, channel_id, account_id, grade, model, input_tokens,
            output_tokens, cache_write_tokens, cache_read_tokens, stop_reason,
            outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        outcome
      );
  }
}

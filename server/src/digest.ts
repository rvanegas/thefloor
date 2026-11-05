/**
 * **The digest**, since 2026-11-05: once a room has been transcribed for five
 * minutes from its beginning, Claude reads what was said and the members of
 * the channel who are not in it are sent a few sentences of it as a
 * notification. Once per room, and never again in it.
 *
 * **The beginning is the room's first transcribed line** — the earliest
 * moment in the room after which the *live transcript* recorded something
 * said, its `start_at` — however long after the room opened that was, and
 * however many people are in it. **And the transcript must run the whole
 * five minutes from there**: paused, switched off or the room emptied at any
 * point after that line, and the room is passed over rather than waited on,
 * since the digest is of a conversation transcribed throughout. Stops before
 * the first line do not count; nothing had begun.
 *
 * A room that resumes inside `ROOM_DEPARTURE_MS` is the same room, so one
 * already digested is not digested again, and one emptied after its first
 * line is not either. A restart ends the room and the transcript with it, so
 * nothing here needs to survive one.
 *
 * Optional as *Ask Claude* is: without `ANTHROPIC_API_KEY` there is no client
 * and nothing is attached. What was said goes to Anthropic without anybody
 * pressing anything, which is why the privacy page says so wherever this can
 * happen.
 */
import { isTranscribingLive } from '../../core/channel';
import type { ChannelState } from '../../core/types';
import type { ClaudeClient } from './claude';
import { newId, type Db } from './db';

/** How long a room must have been transcribed, from its beginning. */
export const DIGEST_AFTER_MS = 5 * 60_000;

/**
 * Sonnet, as `task/a-digest-of-each-call-and-of-the-channel.md` chose, at low
 * effort: a summary of five minutes is reading, not reasoning, and nobody is
 * waiting on it. The ceiling counts thinking too, and is generous for that.
 */
export const DIGEST_MODEL = 'claude-sonnet-5-5';
export const DIGEST_MAX_TOKENS = 2048;

/**
 * The digest's length in words. A notification's body, read on a lock
 * screen: two or three sentences, which iOS shows in full when expanded.
 */
export const DIGEST_WORDS = 50;

/**
 * A ceiling on what is sent, whatever the model wrote, cut at a word. APNs
 * refuses a payload over 4 KB, and the words the prompt asks for are about
 * a tenth of this.
 */
export const DIGEST_MAX_CHARS = 600;

export const DIGEST_TIMEOUT_MS = 60_000;

/** How a digest ended, as `claude_usage.outcome` records it. */
export type DigestOutcome = 'sent' | 'empty' | 'refused' | 'error' | 'timeout' | 'gone';

/** One room being watched, from its opening until it is digested or passed over. */
interface Watch {
  roomId: string;
  openedAt: number;
  /** When its first transcribed line began, or null while there is none. */
  since: number | null;
  /** The last commit at which it was not being transcribed, if any. */
  stoppedAt: number | null;
  /** Whether it was being transcribed at the last commit. */
  transcribing: boolean;
  /** Digested, being digested, or passed over: nothing more is done in it. */
  done: boolean;
}

export interface RoomDigestsOptions {
  client: ClaudeClient;
  db: Db;
  now: () => number;
  /** When the first line said in a channel at or after `from` began, or null. */
  firstLine: (channelId: string, from: number) => number | null;
  /** What was said in a channel between two instants, oldest first. */
  liveLines: (
    channelId: string,
    from: number,
    until: number
  ) => Array<{ displayName: string; text: string }>;
  /** Hands the digest to the registry, which knows who is absent and what each calls the channel. */
  send: (channelId: string, text: string) => void;
  timeoutMs?: number;
  log?: { warn(details: object, message: string): void };
}

export class RoomDigests {
  private watches = new Map<string, Watch>();

  constructor(private options: RoomDigestsOptions) {}

  /**
   * A room is standing in this channel — new, or the same one resumed.
   * Called on the transition to somebody here, before `follow`.
   */
  opened(channelId: string, roomId: string, openedAt: number): void {
    if (this.watches.get(channelId)?.roomId === roomId) return;
    this.watches.set(channelId, {
      roomId,
      openedAt,
      since: null,
      stoppedAt: null,
      transcribing: false,
      done: false,
    });
  }

  /** Called on every commit, with the channel as it now stands. */
  follow(state: ChannelState, now: number): void {
    const watch = this.watches.get(state.id);
    if (!watch || watch.done) return;
    watch.transcribing = isTranscribingLive(state);
    if (watch.transcribing) return;
    // Remembered rather than judged: the first line is found on the tick,
    // and a stop between its beginning and its being written still counts.
    watch.stoppedAt = now;
    if (watch.since !== null) watch.done = true;
  }

  /** Called on every tick: digests whichever rooms have reached five minutes. */
  sweep(now: number): void {
    for (const [channelId, watch] of this.watches) {
      if (watch.done) continue;
      if (watch.since === null) {
        // Asked only while it is being transcribed, since only then can a
        // first line arrive.
        if (!watch.transcribing) continue;
        watch.since = this.options.firstLine(channelId, watch.openedAt);
        if (watch.since === null) continue;
      }
      if (watch.stoppedAt !== null && watch.stoppedAt > watch.since) {
        watch.done = true;
        continue;
      }
      if (now - watch.since < DIGEST_AFTER_MS) continue;
      watch.done = true;
      void this.digest(channelId, watch.openedAt, now);
    }
  }

  /** The channel is gone; forget its room. */
  forget(channelId: string): void {
    this.watches.delete(channelId);
  }

  /** One room's digest, start to finish. Never throws. */
  async digest(channelId: string, from: number, until: number): Promise<DigestOutcome> {
    const lines = this.options.liveLines(channelId, from, until);
    if (lines.length === 0) return 'empty';
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DIGEST_TIMEOUT_MS
    );
    let outcome: DigestOutcome = 'error';
    let response: Awaited<ReturnType<ClaudeClient['messages']['create']>> | undefined;
    try {
      response = await this.options.client.messages.create(
        {
          model: DIGEST_MODEL,
          max_tokens: DIGEST_MAX_TOKENS,
          system: DIGEST_SYSTEM,
          messages: [{ role: 'user', content: digestMessage(lines) }],
          output_config: { effort: 'low' },
        } as Parameters<ClaudeClient['messages']['create']>[0],
        { signal: controller.signal }
      );
      const text = clip(
        response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('')
          .trim()
      );
      if (response.stop_reason === 'refusal') outcome = 'refused';
      else if (!text) outcome = 'empty';
      else {
        this.options.send(channelId, text);
        outcome = 'sent';
      }
    } catch (error) {
      outcome = controller.signal.aborted ? 'timeout' : 'error';
      this.options.log?.warn({ err: error, channel: channelId }, 'room digest failed');
    } finally {
      clearTimeout(timer);
      this.recordUsage(channelId, response, outcome);
    }
    return outcome;
  }

  /**
   * A row in *Ask Claude*'s ledger, so what Claude costs is one sum: no
   * account, since nobody pressed anything and the house pays, and `digest`
   * where a press has its grade.
   */
  private recordUsage(
    channelId: string,
    response: Awaited<ReturnType<ClaudeClient['messages']['create']>> | undefined,
    outcome: DigestOutcome
  ): void {
    const usage = response?.usage;
    this.options.db
      .prepare(
        `INSERT INTO claude_usage
           (id, at, channel_id, account_id, grade, model, input_tokens,
            output_tokens, cache_write_tokens, cache_read_tokens, stop_reason,
            outcome, library_calls)
         VALUES (?, ?, ?, NULL, 'digest', ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        newId('claude'),
        this.options.now(),
        channelId,
        response?.model ?? DIGEST_MODEL,
        usage?.input_tokens ?? 0,
        usage?.output_tokens ?? 0,
        usage?.cache_creation_input_tokens ?? 0,
        usage?.cache_read_input_tokens ?? 0,
        response?.stop_reason ?? null,
        outcome
      );
  }
}

export const DIGEST_SYSTEM = [
  'You write the digest of a voice conversation in a channel of an app called ' +
    'The Floor. It is sent as a notification to the members of the channel who ' +
    'are not in the conversation, so that they can decide whether to join it.',
  'You are given what has been said in its first five minutes, transcribed by ' +
    'speech recognition and so imperfect: words may be misheard and names ' +
    'misspelled.',
  'Say who is talking and what about, naming people as the transcript does, in ' +
    'the language being spoken. Report rather than address anyone, and do not ' +
    'begin with a heading or a preamble. Write plain text, with no Markdown, ' +
    `because it is shown as a notification. Use at most ${DIGEST_WORDS} words.`,
].join('\n\n');

/** The user message: the transcript, one line per turn. */
export function digestMessage(lines: ReadonlyArray<{ displayName: string; text: string }>): string {
  const transcript = lines.map((line) => `${line.displayName}: ${line.text}`).join('\n');
  return `<transcript>\n${transcript}\n</transcript>`;
}

/** At most `DIGEST_MAX_CHARS`, cut at a word. */
export function clip(text: string): string {
  if (text.length <= DIGEST_MAX_CHARS) return text;
  const cut = text.slice(0, DIGEST_MAX_CHARS - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

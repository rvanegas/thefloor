import { describeChannel } from '../../core/naming';
import type { TranscriptLine } from '../../core/transcript';
import type { AuthClient } from './auth';
import type { Db } from './db';
import { finished, noesisFilename, type NoesisSent } from './noesis';
import { readableLines } from './transcripts';

/**
 * A channel's own noesis library, `thefloor/<handle>`, and every transcript
 * filed into it by itself — task/a-channel-has-its-own-noesis-library.md.
 *
 * - **Made the first time a channel has a transcript to file** while somebody
 *   in it is Pro and has connected their own noesis library: the handle minted (`ChannelRegistry.handleFor`), and the
 *   library made at noesis, where The Floor is the owner and signs in with a
 *   token of its own from auth (`noesis:keep`, auth.ts). Nothing else makes one.
 * - **Each segment is one document**, its text as *Share* hands it
 *   (`segmentText`, the app's `formatSegmentText` in UTC), filed through
 *   noesis's import as if somebody had sent it with *Send to noesis*.
 * - **When it is final**: a segment with *Text* a minute after it closes, the
 *   live lines having had time to land; one with *Audio* alone once its
 *   recording's transcript is ready, which somebody has to ask for.
 * - **A channel with no Pro member who has connected their own library
 *   files nothing**, since 2026-11-09 — any Pro member before — and what
 *   closed then is never filed later: it stops taking transcripts, and
 *   otherwise works. A member is shown the channel's library only once their
 *   own is connected, so one that files is one at least somebody there sees.
 * - **Kept on the segment** (`segments.filed_at`), so a restart neither loses
 *   nor repeats one: null is owed, a time is filed, -1 was passed over, and 0
 *   is a segment from before this existed, never owed.
 * - **noesis refusing or not answering leaves it owed**, asked again at the
 *   next sweep, for as long as it is recent (`OWED_FOR_MS`).
 *
 * Members are told on *Channel Settings*, and noesis asks The Floor who they
 * are (app.ts, `/noesis/libraries/:handle`).
 */
export interface ChannelLibrariesOptions {
  /** noesis's origin. */
  origin: string;
  /** auth, for The Floor's own token at noesis. */
  auth: AuthClient;
  /** Tests answer for noesis. */
  fetch?: typeof fetch;
}

export interface ChannelLibrariesDeps {
  /** The channel's handle, minted on first asking; null for no such channel. */
  handleFor(channelId: string): string | null;
  /** The channel's name and members, from the database; null for none, or one deleted. */
  channel(channelId: string): { name: string | null; participants: string[] } | null;
  isPro(accountId: string): boolean;
  /** Whether the account has connected its own noesis library (noesis.ts). */
  connected(accountId: string): boolean;
  displayName(accountId: string): string | null;
  /** A recording's batch transcript, as held. */
  transcriptLines(recordingId: string): TranscriptLine[];
  now(): number;
  /**
   * A segment of the channel was just filed: nobody did anything, so nothing
   * else pushes the snapshot whose `filedAt` tells the Record to look again.
   */
  onFiled?(channelId: string): void;
  log?: { warn(details: object, message: string): void };
}

/** How long after a text segment closes it is filed: its last lines land first. */
export const SETTLE_MS = 60_000;
/** How long a segment is owed for, waiting on a transcript or on noesis. */
export const OWED_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_MS = 60_000;

interface OwedRow {
  id: string;
  channel_id: string;
  started_at: number;
  ended_at: number;
  recording_id: string | null;
  text: number;
  transcript: string | null;
}

/** The scope of The Floor's own token at noesis: the owner of its channels' libraries. */
export const KEEP_SCOPE = 'noesis:keep';

export class ChannelLibraries {
  private made = new Set<string>();
  private tokens = new Map<string, { token: string; until: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeping: Promise<void> | null = null;

  constructor(
    private db: Db,
    private deps: ChannelLibrariesDeps,
    private options: ChannelLibrariesOptions
  ) {}

  /** The Authorization header The Floor signs in to noesis with, as its channels' libraries' owner. */
  private async owner(): Promise<string> {
    return `Bearer ${await this.options.auth.ownToken(KEEP_SCOPE)}`;
  }

  start(everyMs = SWEEP_MS): void {
    this.timer ??= setInterval(() => void this.sweep(), everyMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Files every segment that is owed and final; one sweep at a time. */
  sweep(): Promise<void> {
    this.sweeping ??= this.fileOwed().finally(() => (this.sweeping = null));
    return this.sweeping;
  }

  private async fileOwed(): Promise<void> {
    const now = this.deps.now();
    const owed = this.db
      .prepare(
        `SELECT s.id, s.channel_id, s.started_at, s.ended_at, s.recording_id, s.text,
                t.state AS transcript
           FROM segments s LEFT JOIN transcripts t ON t.recording_id = s.recording_id
          WHERE s.filed_at IS NULL AND s.ended_at IS NOT NULL AND s.ended_at >= ?
          ORDER BY s.ended_at`
      )
      .all(now - OWED_FOR_MS) as unknown as OwedRow[];
    for (const row of owed) {
      const final = row.text ? row.ended_at + SETTLE_MS <= now : row.transcript === 'ready';
      if (!final) continue;
      const channel = this.deps.channel(row.channel_id);
      if (!channel || !channel.participants.some((id) => this.deps.isPro(id) && this.deps.connected(id))) {
        this.mark(row.id, -1);
        continue;
      }
      const name = channel.name ?? describeChannel(this.names(channel.participants));
      const text = this.segmentText(row, name);
      if (text === null) {
        this.mark(row.id, -1);
        continue;
      }
      const sent = await this.file(row.channel_id, segmentFilename(name, row.started_at), text);
      if (sent.ok) {
        this.mark(row.id, now);
        this.db
          .prepare('UPDATE segments SET filed_file = ?, filed_title = ? WHERE id = ?')
          .run(sent.file, sent.title ?? null, row.id);
        this.deps.onFiled?.(row.channel_id);
      }
      else this.deps.log?.warn({ segment: row.id, ...sent }, 'channel library: a segment was not filed');
    }
  }

  private mark(segmentId: string, at: number): void {
    this.db.prepare('UPDATE segments SET filed_at = ? WHERE id = ?').run(at, segmentId);
  }

  private names(participants: string[]): string[] {
    return participants.map((id) => this.deps.displayName(id)).filter((n): n is string => !!n);
  }

  /** The segment's text, or null when it kept no words at all. */
  private segmentText(row: OwedRow, name: string): string | null {
    const entries: Entry[] = [];
    if (row.text) {
      const lines = this.db
        .prepare(
          `SELECT display_name, start_at, text FROM live_lines
            WHERE channel_id = ? AND start_at >= ? AND start_at <= ? AND deleted_at IS NULL
            ORDER BY start_at, id`
        )
        .all(row.channel_id, row.started_at, row.ended_at) as unknown as Array<{
        display_name: string;
        start_at: number;
        text: string;
      }>;
      for (const line of lines) entries.push({ who: line.display_name, at: line.start_at, text: line.text });
    } else if (row.recording_id) {
      const recording = this.db
        .prepare('SELECT started_at, participant_names FROM recordings WHERE id = ?')
        .get(row.recording_id) as { started_at: number; participant_names: string | null } | undefined;
      if (recording) {
        const names = recording.participant_names ? JSON.parse(recording.participant_names) : {};
        for (const line of readableLines(this.deps.transcriptLines(row.recording_id), names)) {
          entries.push({ who: line.displayName ?? 'Someone', at: recording.started_at + line.startMs, text: line.text });
        }
      }
    }
    if (entries.length === 0) return null;
    const pastes = this.db
      .prepare(
        `SELECT display_name, pasted_at, text FROM pastes
          WHERE channel_id = ? AND pasted_at >= ? AND pasted_at <= ?`
      )
      .all(row.channel_id, row.started_at, row.ended_at) as unknown as Array<{
      display_name: string;
      pasted_at: number;
      text: string;
    }>;
    for (const paste of pastes) {
      entries.push({ who: paste.display_name, at: paste.pasted_at, text: paste.text, pasted: true });
    }
    return segmentText(name, row.started_at, row.ended_at, entries);
  }

  /**
   * A token for noesis's MCP that reaches the channel's library and nothing
   * else, for *Ask Claude* to consult it with: an hour long, kept until a
   * minute before it lapses. Null where the channel has no library yet, or
   * noesis will not issue one — the press goes without it.
   */
  async consultToken(channelId: string, handle: string): Promise<string | null> {
    const kept = this.tokens.get(handle);
    if (kept && kept.until > this.deps.now()) return kept.token;
    const doFetch = this.options.fetch ?? fetch;
    try {
      const response = await doFetch(new URL('/applications/token', this.options.origin), {
        method: 'POST',
        headers: { Authorization: await this.owner(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ library: handle }),
      });
      if (!response.ok) return null;
      const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
      this.tokens.set(handle, { token: access_token, until: this.deps.now() + (expires_in - 60) * 1000 });
      return access_token;
    } catch (error) {
      this.deps.log?.warn({ err: error, channelId }, 'channel library: no token to consult it');
      return null;
    }
  }

  /**
   * Deletes a channel's library whole, thirty days after the channel was deleted
   * (`ChannelRegistry.sweepDeleted`). True once it is gone, which a library
   * noesis no longer has already is; false leaves the channel's row held for
   * the next sweep, or for `ts library-orphans`.
   */
  async deleteLibrary(handle: string): Promise<boolean> {
    const doFetch = this.options.fetch ?? fetch;
    try {
      const response = await doFetch(new URL(`/libraries/thefloor/${handle}`, this.options.origin), {
        method: 'DELETE',
        headers: { Authorization: await this.owner() },
      });
      return response.ok || response.status === 404;
    } catch (error) {
      this.deps.log?.warn({ err: error, handle }, 'channel library: could not delete it');
      return false;
    }
  }

  /**
   * Deletes one document a segment was filed as, thirty days after its recording
   * was deleted: noesis asks for the file's hash to delete it, so it is read
   * from the library's listing first. True once it is gone.
   */
  async deleteDocument(handle: string, file: string): Promise<boolean> {
    const doFetch = this.options.fetch ?? fetch;
    const base = `/libraries/thefloor/${handle}/files`;
    try {
      const listing = await doFetch(new URL(base, this.options.origin), { headers: { Authorization: await this.owner() } });
      if (listing.status === 404) return true;
      if (!listing.ok) return false;
      const sha = ((await listing.json()) as Record<string, string>)[file];
      if (!sha) return true;
      const path = file.split('/').map(encodeURIComponent).join('/');
      const response = await doFetch(new URL(`${base}/${path}`, this.options.origin), {
        method: 'DELETE',
        headers: { Authorization: await this.owner(), 'If-Match': `"${sha}"` },
      });
      return response.ok || response.status === 404;
    } catch (error) {
      this.deps.log?.warn({ err: error, handle, file }, 'channel library: could not delete a document');
      return false;
    }
  }

  /** Files `text` in the channel's library, making the library first if it has none. */
  private async file(channelId: string, filename: string, text: string): Promise<NoesisSent> {
    const handle = this.deps.handleFor(channelId);
    if (!handle) return { ok: false, reason: 'failed', message: 'no such channel' };
    const doFetch = this.options.fetch ?? fetch;
    try {
      if (!this.made.has(handle)) {
        const made = await doFetch(new URL('/libraries', this.options.origin), {
          method: 'POST',
          headers: { Authorization: await this.owner(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: handle }),
        });
        if (!made.ok && made.status !== 409) {
          return { ok: false, reason: 'failed', message: `making the library: ${made.status}` };
        }
        this.made.add(handle);
      }
      const url = new URL(`/libraries/thefloor/${handle}/import`, this.options.origin);
      url.search = new URLSearchParams({ filename, replace: 'true' }).toString();
      const response = await doFetch(url, {
        method: 'POST',
        headers: { Authorization: await this.owner(), 'Content-Type': 'text/markdown; charset=utf-8' },
        body: text,
      });
      if (response.status === 402) return { ok: false, reason: 'allowance' };
      if (response.status === 409) return { ok: false, reason: 'busy' };
      if (!response.ok) return { ok: false, reason: 'failed', message: `importing: ${response.status}` };
      return finished(await response.text());
    } catch (error) {
      return { ok: false, reason: 'failed', message: String(error) };
    }
  }
}

interface Entry {
  who: string;
  at: number;
  text: string;
  pasted?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const hhmm = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * A segment's text as *Share* hands it — `The Floor — <channel>`, its day and
 * hours, then each speaker's run under their name and the time it began, a
 * paste where it was made — which is what noesis's import reads
 * (`from_the_floor`). In UTC, and saying so, since a server has no reader's
 * clock to keep.
 */
export function segmentText(name: string, startedAt: number, endedAt: number, entries: Entry[]): string {
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  const blocks: string[] = [];
  let last: { who: string; pasted: boolean } | null = null;
  for (const entry of sorted) {
    const pasted = !!entry.pasted;
    if (!pasted && last && !last.pasted && last.who === entry.who) {
      blocks[blocks.length - 1] += `\n${entry.text}`;
      continue;
    }
    blocks.push(`${pasted ? 'Pasted by ' : ''}${entry.who} · ${hhmm(entry.at)}\n${entry.text}`);
    last = { who: entry.who, pasted };
  }
  const head = `The Floor — ${name}\n${day(startedAt)} · ${hhmm(startedAt)}–${hhmm(endedAt)} UTC`;
  return [head, ...blocks].join('\n\n');
}

/** What a segment's file is called: noesis reads the channel and day from it too. */
export function segmentFilename(name: string, startedAt: number): string {
  const d = new Date(startedAt);
  return noesisFilename(`The Floor — ${name} — ${day(startedAt)} ${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`);
}

import { randomUUID } from 'node:crypto';
import { TRANSCRIPT_DELETED_RETENTION_MS } from '../../core/constants';
import {
  intoBlocks,
  readable,
  voiceKey,
  VOICE_SEPARATOR,
  type TranscriptLine,
  type VoiceDeclarations,
} from '../../core/transcript';
import { MEDIA_IDENTITY } from './channels';
import { hasSearchIndex, type Db, type RecordingRow } from './db';
import { encodeStem, type ExportRequest } from './export';
import type { RecordingStore } from './storage';
import type { TranscriptionProvider } from './transcription';
import type { UsageMeter } from './usage';

/**
 * Turning one recording into text, and keeping the promises that go with it.
 *
 * The provider is `transcription.ts`; this is when it is asked, what is sent
 * to it, and what happens to a job that outlives the process that started it.
 *
 * Three things here are not incidental:
 *
 * **What is submitted is the gated stem, never the bytes in the bucket.** The
 * stored stems are complete — they contain what a silenced person said while
 * they held no floor — and `encodeStem` is what removes it, using the same
 * graph the exported recording is built from. Sending the stored object
 * instead would walk straight round the floor and produce a searchable,
 * permanent text of the remark the recording deliberately does not carry.
 *
 * **A job's provider id is in the database before anything waits on it.** A
 * restart between submitting and storing the text is otherwise a second charge
 * for audio the provider has already transcribed; with the id on the row,
 * `restore()` resumes polling instead.
 *
 * **Deletion is promised on a public page**, so it is done twice: when the
 * text lands, and again when the recording is swept. The first can fail and
 * nobody would notice.
 *
 * See planning/TRANSCRIPTS.md. Nothing routes to any of this yet — that is
 * phase 4.
 */

/** How long to wait before polling a job again, and the ceiling it climbs to. */
const POLL_START_MS = 5_000;
const POLL_MAX_MS = 60_000;

/**
 * How often the timer looks for work.
 *
 * Faster than any individual job's backoff on purpose: this is the interval at
 * which *something* might be due, and each job decides for itself whether it
 * is. With nothing open it is one indexed query against two small tables, and
 * that is the whole standing cost of transcription being configured.
 */
const TICK_MS = 5_000;

export interface TranscriptsOptions {
  db: Db;
  usage: UsageMeter;
  /** Absent, transcription is unavailable and nothing here can be started. */
  provider?: TranscriptionProvider;
  /** Absent likewise: there is nothing to read the stems out of. */
  store?: RecordingStore;
  now?: () => number;
  /** Where a failure that nobody is waiting on goes. */
  onError?: (error: unknown, context: string) => void;
  /**
   * Told which channel to push a fresh snapshot to when a transcript changes
   * state.
   *
   * A transcript landing is not an action anybody took, so nothing else is
   * going to send one — the same reason the mix emits when it is stored.
   * Without this the card reads "Transcribing…" until something unrelated
   * happens in that channel.
   */
  onChanged?: (channelId: string) => void;
  /**
   * Told when a transcript settles with nothing to show for itself.
   *
   * It exists for the free-use allowance: a failure has to give the credit
   * back, because the account spent it on a transcript that never arrived.
   * Not called for a partial success — one speaker missing out of four is a
   * transcript, and it cost what it cost.
   */
  onFailed?: (recordingId: string) => void;
}

/** What one recording's transcript looks like from the outside. */
export interface TranscriptView {
  state: 'pending' | 'ready' | 'failed';
  requestedBy: string;
  requestedAt: number;
  failure?: string;
  /** Which speakers produced nothing, and why. Empty when all of them did. */
  missing: Array<{ identity: string; failure: string | null }>;
}

/** One matching line, and which recording it was said in. */
export interface TranscriptHit extends TranscriptLine {
  recordingId: string;
}

/**
 * Re-exported rather than declared, because the app reads these rows too and
 * the naming and grouping rules that go with them live in `core/`.
 */
export type { TranscriptLine };

interface JobRow {
  id: string;
  recording_id: string;
  identity: string;
  provider_id: string | null;
  state: string;
  language: string | null;
  failure: string | null;
  billed_ms: number | null;
}

export class Transcripts {
  private readonly db: Db;
  private readonly usage: UsageMeter;
  private readonly provider?: TranscriptionProvider;
  private readonly store?: RecordingStore;
  private readonly now: () => number;
  private readonly onError: (error: unknown, context: string) => void;
  private readonly onChanged: (channelId: string) => void;
  private readonly onFailed: (recordingId: string) => void;

  /**
   * When each job may next be polled, by job id. In memory only: after a
   * restart every open job is simply due, which costs one early poll and saves
   * a column that would have to be kept honest.
   */
  private readonly nextPoll = new Map<string, { at: number; every: number }>();

  /**
   * The work in flight, as one chain rather than a set.
   *
   * Rendering a stem is ffmpeg on a box that is also the SFU, and the mix is
   * already the loudest thing that happens there — so jobs are done one at a
   * time. Being slow is not a problem anybody is waiting on: nothing here
   * holds a request open, and a transcript that arrives a minute later is a
   * transcript.
   */
  private working: Promise<void> = Promise.resolve();

  private timer?: ReturnType<typeof setInterval>;

  constructor(options: TranscriptsOptions) {
    this.db = options.db;
    this.usage = options.usage;
    this.provider = options.provider;
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.onError = options.onError ?? (() => {});
    this.onChanged = options.onChanged ?? (() => {});
    this.onFailed = options.onFailed ?? (() => {});
  }

  /**
   * Whether this server can transcribe anything at all.
   *
   * Both halves are required and neither is the other's fault: no provider is
   * an unconfigured credential, no store is a server with nothing to read the
   * audio out of. The route in phase 4 answers 503 on this, and the app is
   * told the feature is unavailable rather than shown a button that fails.
   */
  available(): boolean {
    return !!this.provider && !!this.store;
  }

  /**
   * What transcribing this recording would be billed, in channel-milliseconds,
   * or nothing when there is nothing here to transcribe.
   *
   * The same expression `request` writes into `billed_ms` — the recording's
   * length times the number of stems, an upper bound because a stem is
   * rendered from the start and so is never longer than the recording. It is
   * public so the free-use allowance can be checked *before* the money is
   * spent; asking afterwards would be a bill with a rule beside it.
   *
   * **Keep the two in step.** If one of them learns to be cleverer about what
   * a stem costs and the other does not, a recording refused by the cap is one
   * whose billed figure disagrees with the reason it was refused.
   */
  costEstimateMs(recordingId: string): number | undefined {
    const recording = this.recording(recordingId);
    if (!recording) return undefined;
    const identities = this.speakersOf(recording);
    if (identities.length === 0) return undefined;
    return recording.duration_ms * identities.length;
  }

  /**
   * Starts a transcript for one recording.
   *
   * Named for the asking rather than for the starting, because `start` is the
   * lifecycle pair with `stop` here as it is on the channel registry, and two
   * meanings of the word on one class is how somebody wires a timer to a
   * recording id.
   *
   * **Does not decide who may ask.** That is the caller's, and it is the
   * `manageable` rule rather than the export rule: this sends everybody's
   * audio to a third party and puts a shared artefact on everybody's screen,
   * which is a change to the channel rather than a private read.
   *
   * Throws when there is nothing to transcribe or a transcript already exists,
   * both of which are answers a caller should relay rather than retry.
   */
  async request(recordingId: string, requestedBy: string): Promise<void> {
    const provider = this.provider;
    if (!provider || !this.store) {
      throw new Error('Transcription is not configured.');
    }

    const recording = this.recording(recordingId);
    if (!recording) throw new Error(`No such recording: ${recordingId}`);
    if (recording.deleted_at) throw new Error('This recording was deleted.');

    const identities = this.speakersOf(recording);
    if (identities.length === 0) {
      // A run that captured nothing, or one whose only stem is played media.
      // Starting jobs over no audio would spend nothing and fail slowly; the
      // caller can say so immediately instead.
      throw new Error('This recording has no speech to transcribe.');
    }

    const existing = this.db
      .prepare(
        'SELECT state, deleted_at FROM transcripts WHERE recording_id = ?'
      )
      .get(recordingId) as
      | { state: string; deleted_at: number | null }
      | undefined;
    if (existing) {
      // A failed one may be replaced — that is the retry — and so may a
      // deleted one, which is somebody asking again for what they threw away.
      // Anything else is a second charge for an answer already held or
      // already coming.
      if (existing.state !== 'failed' && existing.deleted_at === null) {
        throw new Error('This recording already has a transcript.');
      }
      this.clear(recordingId);
    }

    const at = this.now();
    this.db
      .prepare(
        `INSERT INTO transcripts
           (recording_id, state, requested_by, requested_at, provider, billed_ms)
         VALUES (?, 'pending', ?, ?, ?, ?)`
      )
      .run(
        recordingId,
        requestedBy,
        at,
        provider.name,
        // The ceiling rather than a measurement: every stem is rendered from
        // the start of the recording, so none is longer than the recording is.
        recording.duration_ms * identities.length
      );

    const insert = this.db.prepare(
      `INSERT INTO transcript_jobs (id, recording_id, identity, state)
       VALUES (?, ?, ?, 'pending')`
    );
    for (const identity of identities) {
      insert.run(randomUUID(), recordingId, identity);
    }

    // Everybody in the channel, not just whoever asked: this is a change to a
    // shared thing, and the other screens should say "Transcribing…" from the
    // moment it starts rather than from whenever they next hear anything.
    this.onChanged(recording.channel_id);
    this.pump();
  }

  /**
   * One pass: submit what has not been submitted, poll what has.
   *
   * Called on a timer, and directly by tests. Cheap and quiet when there is
   * nothing open, which is nearly always — the query below is the whole cost
   * of transcription being switched on and unused.
   */
  async tick(): Promise<void> {
    // Sweeping first, and outside `pump`, because neither sweep needs a
    // provider: a credential withdrawn tomorrow must not leave marked
    // transcripts sitting in the database forever, and the rows of a deleted
    // recording should go whether or not this server can still transcribe.
    this.sweepDeleted();
    this.sweepOrphans();
    this.pump();
    await this.settled();
  }

  /**
   * Begins polling on a timer, and picks up whatever the last process left.
   *
   * Separate from the constructor because a test harness wants the rows and
   * the rules without a timer — it drives `tick` itself, which is exact where
   * a wall clock is a race. `index.ts` starts it; nothing else should.
   */
  start(everyMs = TICK_MS): void {
    if (this.timer) return;
    this.restore();
    this.timer = setInterval(() => {
      this.sweepDeleted();
      this.sweepOrphans();
      this.pump();
    }, everyMs);
    // Nothing here should hold the process open: an open job is on the row,
    // and the next boot resumes it.
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Resolves once no rendering, submission or poll is in flight. */
  async settled(): Promise<void> {
    let seen: Promise<void> | null = null;
    while (seen !== this.working) {
      seen = this.working;
      await seen.catch(() => {});
    }
  }

  /**
   * Picks up jobs left open by a process that stopped.
   *
   * Nothing to undo and nothing to finalize: a job with a provider id is
   * resumed by polling it, and one without is submitted. Which is why the id
   * is written before anything waits on it — the alternative is re-uploading
   * audio the provider has already been paid to read.
   */
  restore(): void {
    if (!this.available()) return;
    this.pump();
  }

  /**
   * Removes a recording's transcript, and asks the provider to forget whatever
   * it still holds.
   *
   * The second half is the belt to `finish`'s braces. The privacy page says
   * the audio and the text are deleted from the provider as soon as the text
   * is stored here; a `forget` that failed then would leave a copy nobody is
   * tracking, and this is the sweep that catches it.
   */
  deleteFor(recordingId: string): void {
    // The provider is told now rather than in thirty days' time. Nothing about
    // the grace period depends on their copy — the text is here, which is what
    // a recovery by hand would read — and leaving a conversation with a third
    // party for a month after somebody asked for it to go is the opposite of
    // what the tap meant.
    for (const job of this.jobsOf(recordingId)) {
      if (job.provider_id) this.forget(job.provider_id);
    }

    const channelId = this.recording(recordingId)?.channel_id;
    this.db
      .prepare(
        `UPDATE transcripts SET deleted_at = ?
         WHERE recording_id = ? AND deleted_at IS NULL`
      )
      .run(this.now(), recordingId);
    if (channelId) this.onChanged(channelId);
  }

  /**
   * Removes what the mark above left behind, once its window has passed.
   *
   * The recordings sweep's shape, and for the recordings sweep's reason: a
   * deletion nobody can undo from inside the app should still be undoable by
   * somebody with the database, for long enough that the mistake is noticed.
   * See TRANSCRIPT_DELETED_RETENTION_MS for why that window is longer here
   * than for a recording.
   */
  private sweepDeleted(): void {
    const cutoff = this.now() - TRANSCRIPT_DELETED_RETENTION_MS;
    const due = this.db
      .prepare(
        'SELECT recording_id FROM transcripts WHERE deleted_at IS NOT NULL AND deleted_at <= ?'
      )
      .all(cutoff) as unknown as Array<{ recording_id: string }>;
    for (const row of due) this.clear(row.recording_id);
  }

  /**
   * Where one recording's transcript stands, or nothing if it has none — which
   * includes one somebody has deleted, since a marked transcript is
   * unreachable from the moment the mark is set.
   *
   * `missing` is the honest half. A transcript is ready when *any* speaker
   * produced text, so a screen that only said "ready" would quietly present a
   * conversation with somebody missing from it as though it were complete.
   */
  viewFor(recordingId: string): TranscriptView | undefined {
    const row = this.db
      .prepare(
        `SELECT state, requested_by, requested_at, failure
         FROM transcripts WHERE recording_id = ? AND deleted_at IS NULL`
      )
      .get(recordingId) as
      | {
          state: string;
          requested_by: string;
          requested_at: number;
          failure: string | null;
        }
      | undefined;
    if (!row) return undefined;

    return {
      state: row.state as TranscriptView['state'],
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      ...(row.failure ? { failure: row.failure } : {}),
      missing: this.jobsOf(recordingId)
        .filter((job) => job.state === 'failed')
        .map((job) => ({ identity: job.identity, failure: job.failure })),
    };
  }

  /**
   * The text, in the order it was said.
   *
   * Ordered by time across every speaker rather than grouped by them, because
   * that is the conversation. Two people talking over each other produce two
   * lines at overlapping times, which per-stem jobs can represent honestly and
   * a transcript of a mix could not represent at all.
   */
  linesFor(recordingId: string): TranscriptLine[] {
    return (
      this.db
        .prepare(
          `SELECT l.identity, l.speaker, l.start_ms, l.end_ms, l.text,
                  l.confidence
           FROM transcript_lines l
           JOIN transcripts t ON t.recording_id = l.recording_id
           WHERE l.recording_id = ? AND t.deleted_at IS NULL
           ORDER BY l.start_ms, l.identity`
        )
        .all(recordingId) as unknown as Array<{
        identity: string;
        speaker: string | null;
        start_ms: number;
        end_ms: number;
        text: string;
        confidence: number | null;
      }>
    ).map((row) => ({
      identity: row.identity,
      speaker: row.speaker,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      confidence: row.confidence,
    }));
  }

  /**
   * Every line in one channel's transcripts matching what somebody typed.
   *
   * **This is the feature the denormalised `channel_id` on a line exists for**
   * — one index scan rather than a join through `recordings` on every
   * keystroke.
   *
   * Searched as a phrase rather than as an expression. FTS5's query language
   * would otherwise read an apostrophe, a stray quote or the word `AND` as
   * syntax and answer with an error where a person expected results; quoting
   * the whole thing makes every input a search for those words in that order,
   * which is what a search box means anyway.
   *
   * Ordered by recording and then by time, so the caller can group without
   * sorting, and capped: a common word across a year of conversation is not a
   * result set anybody scrolls.
   */
  search(channelId: string, query: string, limit = 200): TranscriptHit[] {
    const needle = query.trim();
    if (!needle) return [];

    const rows = hasSearchIndex(this.db)
      ? (this.db
          .prepare(
            `SELECT l.recording_id, l.identity, l.speaker, l.start_ms, l.end_ms,
                    l.text, l.confidence
             FROM transcript_fts f
             JOIN transcript_lines l ON l.rowid = f.rowid
             JOIN transcripts t ON t.recording_id = l.recording_id
             JOIN recordings r ON r.id = l.recording_id
             WHERE f.text MATCH ? AND l.channel_id = ?
               AND t.deleted_at IS NULL AND r.deleted_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM transcript_voices v
                 WHERE v.recording_id = l.recording_id
                   AND v.identity = l.identity
                   AND v.speaker = COALESCE(l.speaker, '')
                   AND v.removed = 1
               )
             ORDER BY l.recording_id, l.start_ms
             LIMIT ?`
          )
          .all(`"${needle.replace(/"/g, '""')}"`, channelId, limit) as unknown)
      : // No index on this build. A scan over one channel's lines, which at
        // this scale is fine — and is what the design said the first version
        // should be if there were any doubt.
        (this.db
          .prepare(
            `SELECT l.recording_id, l.identity, l.speaker, l.start_ms, l.end_ms,
                    l.text, l.confidence
             FROM transcript_lines l
             JOIN transcripts t ON t.recording_id = l.recording_id
             JOIN recordings r ON r.id = l.recording_id
             WHERE l.channel_id = ? AND t.deleted_at IS NULL
               AND r.deleted_at IS NULL
               AND lower(l.text) LIKE '%' || lower(?) || '%'
               AND NOT EXISTS (
                 SELECT 1 FROM transcript_voices v
                 WHERE v.recording_id = l.recording_id
                   AND v.identity = l.identity
                   AND v.speaker = COALESCE(l.speaker, '')
                   AND v.removed = 1
               )
             ORDER BY l.recording_id, l.start_ms
             LIMIT ?`
          )
          .all(channelId, needle, limit) as unknown);

    return (
      rows as Array<{
        recording_id: string;
        identity: string;
        speaker: string | null;
        start_ms: number;
        end_ms: number;
        text: string;
        confidence: number | null;
      }>
    ).map((row) => ({
      recordingId: row.recording_id,
      identity: row.identity,
      speaker: row.speaker,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      confidence: row.confidence,
    }));
  }

  /**
   * What has been declared about one transcript's voices.
   *
   * Empty for a transcript nobody has said anything about, which is the
   * default naming and is most of them.
   */
  voicesFor(recordingId: string): VoiceDeclarations {
    const rows = this.db
      .prepare(
        `SELECT identity, speaker, name, removed FROM transcript_voices
         WHERE recording_id = ?`
      )
      .all(recordingId) as unknown as Array<{
      identity: string;
      speaker: string;
      name: string | null;
      removed: number;
    }>;
    const out: VoiceDeclarations = {};
    for (const row of rows) {
      out[voiceKey(row.identity, row.speaker || null)] = {
        ...(row.name ? { name: row.name } : {}),
        ...(row.removed ? { removed: true } : {}),
      };
    }
    return out;
  }

  /**
   * Replaces the whole declaration for one transcript.
   *
   * Whole rather than per voice, because the screen that sends it holds the
   * whole thing and because that is what makes clearing expressible: a voice
   * absent from what arrives has nothing declared about it, and an empty
   * object puts the transcript back exactly as the provider left it. There is
   * no separate reset path to get wrong.
   *
   * A declaration that says nothing — no name, not removed — is dropped rather
   * than stored, so "cleared" has one representation in the table instead of
   * two.
   */
  declareVoices(
    recordingId: string,
    voices: VoiceDeclarations,
    by: string
  ): void {
    this.db
      .prepare('DELETE FROM transcript_voices WHERE recording_id = ?')
      .run(recordingId);
    const insert = this.db.prepare(
      `INSERT INTO transcript_voices
         (recording_id, identity, speaker, name, removed, declared_by, declared_at)
       VALUES (?,?,?,?,?,?,?)`
    );
    for (const [key, voice] of Object.entries(voices)) {
      const name = voice.name?.trim();
      if (!name && !voice.removed) continue;
      const [identity, speaker = ''] = key.split(VOICE_SEPARATOR);
      if (!identity) continue;
      insert.run(
        recordingId,
        identity,
        speaker,
        name ?? null,
        voice.removed ? 1 : 0,
        by,
        this.now()
      );
    }
  }

  /**
   * Which stems, across these recordings, came back carrying more than one
   * voice — keyed `<recording id>\u0000<identity>`.
   *
   * The same question `core`'s `multiVoiceStems` answers, asked of the
   * database instead of a line array. Search needs it and cannot use the pure
   * one: a search result is the handful of lines that matched, and counting
   * voices in those would call a two-voice stem single-voiced whenever only
   * one of them happened to say the word. One indexed group-by over the
   * recordings a result set touched, rather than loading their transcripts.
   */
  stemsWithManyVoices(recordingIds: readonly string[]): Set<string> {
    if (!recordingIds.length) return new Set();
    const holes = recordingIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT l.recording_id, l.identity, COUNT(DISTINCT l.speaker) AS voices
         FROM transcript_lines l
         WHERE l.recording_id IN (${holes}) AND l.speaker IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM transcript_voices v
             WHERE v.recording_id = l.recording_id AND v.identity = l.identity
               AND v.speaker = l.speaker AND v.removed = 1
           )
         GROUP BY l.recording_id, l.identity
         HAVING voices > 1`
      )
      .all(...recordingIds) as unknown as Array<{
      recording_id: string;
      identity: string;
    }>;
    return new Set(rows.map((row) => `${row.recording_id}\u0000${row.identity}`));
  }

  // --- the work -------------------------------------------------------------

  /**
   * Drops the transcript of any recording that has been deleted.
   *
   * The deletion in `recordings` is a mark, and the row survives it for about
   * a week so a mistake can be undone. That week is the window this runs in,
   * and it matters: a foreign key cascade would take these rows when the sweep
   * finally removes the recording, but silently, without asking the provider
   * to drop whatever it still holds. The cascade is the backstop. This is the
   * part that keeps the promise.
   */
  private sweepOrphans(): void {
    const gone = this.db
      .prepare(
        `SELECT t.recording_id FROM transcripts t
         LEFT JOIN recordings r ON r.id = t.recording_id
         WHERE r.id IS NULL OR r.deleted_at IS NOT NULL`
      )
      .all() as unknown as Array<{ recording_id: string }>;
    for (const row of gone) {
      for (const job of this.jobsOf(row.recording_id)) {
        if (job.provider_id) this.forget(job.provider_id);
      }
      // Cleared outright rather than marked. The recording is on its own way
      // out and the cascade will take these rows with it; a grace period here
      // would only protect a transcript of a conversation that is going
      // anyway, for three weeks longer than the conversation gets.
      this.clear(row.recording_id);
    }
  }

  /** Queues a pass onto the single chain. Never throws at the caller. */
  private pump(): void {
    if (!this.available()) return;
    this.working = this.working
      .then(() => this.advance())
      .catch((error) => this.onError(error, 'transcripts'));
  }

  private async advance(): Promise<void> {
    const open = this.db
      .prepare(
        `SELECT j.* FROM transcript_jobs j
         JOIN transcripts t ON t.recording_id = j.recording_id
         WHERE j.state = 'pending' AND t.state = 'pending'
           AND t.deleted_at IS NULL`
      )
      .all() as unknown as JobRow[];

    for (const job of open) {
      if (job.provider_id) await this.pollJob(job);
      else await this.submitJob(job);
    }

    // Whatever settled above may have completed a recording. Done after the
    // loop rather than inside it so that one transcript is finished once,
    // whichever of its jobs happened to land last.
    for (const recordingId of new Set(open.map((j) => j.recording_id))) {
      this.finish(recordingId);
    }
  }

  /** Renders one speaker's gated audio and hands it to the provider. */
  private async submitJob(job: JobRow): Promise<void> {
    const provider = this.provider;
    const store = this.store;
    if (!provider || !store) return;

    const recording = this.recording(job.recording_id);
    if (!recording || recording.deleted_at) {
      // Deleted while its transcript was in flight. Nothing to submit and
      // nothing to keep — the rows go with the recording.
      this.deleteFor(job.recording_id);
      return;
    }

    try {
      const { data, durationMs } = await encodeStem(
        requestFrom(recording),
        job.identity,
        async (key) => {
          const bytes = await store.get(key);
          this.usage.recordBytes({
            kind: 'transcript-read',
            bytes: bytes.length,
            recordingId: job.recording_id,
          });
          return bytes;
        }
      );

      // What we sent, measured, before anybody is asked what they charged for
      // it. If the provider reports its own figure on the way out this is
      // replaced by that — but a job that fails, or one whose response says
      // nothing about duration, still has a real number rather than a share of
      // an estimate.
      if (durationMs !== null) {
        this.db
          .prepare('UPDATE transcript_jobs SET billed_ms = ? WHERE id = ?')
          .run(durationMs, job.id);
      }

      const providerId = await provider.submit(data, {
        languageDetection: true,
        // Every stem — see TranscriptionOptions.diarize. Not to tell
        // participants apart, which the stems answer, but because how many
        // voices are inside one stem is not something this system knows.
        diarize: true,
      });

      // Before anything waits on it. A crash after this line costs a poll; a
      // crash before it costs the upload again, and this is the line that
      // decides which.
      this.db
        .prepare('UPDATE transcript_jobs SET provider_id = ? WHERE id = ?')
        .run(providerId, job.id);
      this.usage.recordBytes({
        kind: 'transcript-send',
        bytes: data.length,
        recordingId: job.recording_id,
      });
      this.schedule(job.id);
    } catch (error) {
      // One stem that cannot be rendered or accepted fails alone. The others
      // are already their own jobs, which is what per-stem submission buys.
      this.failJob(job, describe(error));
    }
  }

  private async pollJob(job: JobRow): Promise<void> {
    const provider = this.provider;
    if (!provider || !job.provider_id) return;

    const due = this.nextPoll.get(job.id);
    if (due && due.at > this.now()) return;

    let answered;
    try {
      answered = await provider.poll(job.provider_id);
    } catch (error) {
      // A refused poll is not a failed job — the transcript is still being
      // made, and the provider is rate limiting us or having an afternoon. Back
      // off and ask again.
      this.onError(error, `transcript poll ${job.id}`);
      this.schedule(job.id);
      return;
    }

    if (answered.state === 'pending') {
      this.schedule(job.id);
      return;
    }
    if (answered.state === 'failed') {
      this.failJob(job, answered.error);
      this.forget(job.provider_id);
      return;
    }

    const recording = this.recording(job.recording_id);
    if (!recording || recording.deleted_at) {
      // Deleted while the provider was working. The text is not written, and
      // what the provider holds is dropped rather than left behind.
      this.forget(job.provider_id);
      this.deleteFor(job.recording_id);
      return;
    }

    const insert = this.db.prepare(
      `INSERT INTO transcript_lines
         (id, recording_id, channel_id, identity, speaker, start_ms, end_ms,
          text, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const line of answered.utterances) {
      if (!line.text) continue;
      insert.run(
        randomUUID(),
        job.recording_id,
        recording.channel_id,
        job.identity,
        line.speaker,
        Math.round(line.startMs),
        Math.round(line.endMs),
        line.text,
        line.confidence
      );
    }

    this.db
      .prepare(
        `UPDATE transcript_jobs SET state = 'ready', language = ?,
           billed_ms = COALESCE(?, billed_ms) WHERE id = ?`
      )
      .run(answered.languageCode, answered.billedMs, job.id);
    this.nextPoll.delete(job.id);

    // The promise the privacy page makes, kept the moment it can be: the text
    // is here, so the provider has no reason to hold the audio or its copy.
    this.forget(job.provider_id);
  }

  /** Marks a transcript done once none of its jobs are still open. */
  private finish(recordingId: string): void {
    const jobs = this.jobsOf(recordingId);
    if (jobs.length === 0) return;
    if (jobs.some((job) => job.state === 'pending')) return;

    this.total(recordingId, jobs);

    const channelId = this.recording(recordingId)?.channel_id;
    if (channelId) this.onChanged(channelId);

    const ready = jobs.filter((job) => job.state === 'ready');
    if (ready.length > 0) {
      // Partly ready is ready. A transcript missing one speaker is worth far
      // more than no transcript, and the job rows say which one is missing and
      // why — so the screen can be honest about it rather than silent.
      this.db
        .prepare(
          `UPDATE transcripts SET state = 'ready', completed_at = ?,
             failure = NULL WHERE recording_id = ?`
        )
        .run(this.now(), recordingId);
      return;
    }

    this.db
      .prepare(
        `UPDATE transcripts SET state = 'failed', completed_at = ?, failure = ?
         WHERE recording_id = ?`
      )
      .run(
        this.now(),
        jobs[0].failure ?? 'The transcript could not be made.',
        recordingId
      );
    // After the write, so whatever this does sees the settled state rather
    // than a row still reading 'pending'.
    this.onFailed(recordingId);
  }

  /**
   * Replaces the estimate with what the jobs actually cost.
   *
   * A job nobody could measure keeps its share of the original estimate rather
   * than counting as zero — the alternative is a transcript that looks free
   * because the one thing that went wrong was the measuring. `billed_exact`
   * says which kind of number this is, so a usage report does not add a month
   * of estimates to a month of measurements as though they were the same.
   */
  private total(recordingId: string, jobs: JobRow[]): void {
    const estimate = this.db
      .prepare('SELECT billed_ms FROM transcripts WHERE recording_id = ?')
      .get(recordingId) as { billed_ms: number | null } | undefined;
    const share =
      jobs.length > 0 ? (estimate?.billed_ms ?? 0) / jobs.length : 0;

    let exact = true;
    let total = 0;
    for (const job of jobs) {
      if (job.billed_ms === null) {
        exact = false;
        total += share;
      } else {
        total += job.billed_ms;
      }
    }

    this.db
      .prepare(
        'UPDATE transcripts SET billed_ms = ?, billed_exact = ? WHERE recording_id = ?'
      )
      .run(Math.round(total), exact ? 1 : 0, recordingId);
  }

  private failJob(job: JobRow, failure: string): void {
    this.db
      .prepare(
        `UPDATE transcript_jobs SET state = 'failed', failure = ? WHERE id = ?`
      )
      .run(failure, job.id);
    this.nextPoll.delete(job.id);
  }

  /**
   * Asks the provider to drop a job, and does not wait.
   *
   * Fire and forget on purpose, like `RecordingStore.delete`: nobody is
   * waiting, and a failure here is exactly what `deleteFor` exists to catch
   * later.
   */
  private forget(providerId: string): void {
    this.provider?.forget(providerId).catch((error) => {
      this.onError(error, `transcript forget ${providerId}`);
    });
  }

  private schedule(jobId: string): void {
    const previous = this.nextPoll.get(jobId);
    const every = previous
      ? Math.min(previous.every * 2, POLL_MAX_MS)
      : POLL_START_MS;
    this.nextPoll.set(jobId, { at: this.now() + every, every });
  }

  private clear(recordingId: string): void {
    this.db
      .prepare('DELETE FROM transcript_lines WHERE recording_id = ?')
      .run(recordingId);
    this.db
      .prepare('DELETE FROM transcript_jobs WHERE recording_id = ?')
      .run(recordingId);
    this.db
      .prepare('DELETE FROM transcripts WHERE recording_id = ?')
      .run(recordingId);
  }

  private jobsOf(recordingId: string): JobRow[] {
    return this.db
      .prepare('SELECT * FROM transcript_jobs WHERE recording_id = ?')
      .all(recordingId) as unknown as JobRow[];
  }

  private recording(id: string): RecordingRow | undefined {
    return this.db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as
      | unknown as RecordingRow
      | undefined;
  }

  /**
   * Whose stems are worth transcribing, which is all of them.
   *
   * **`media` included, decided 2026-08-25.** It is the shared playback stem —
   * whatever somebody played into the room — and it was excluded on the
   * argument that a recording containing a song would become a transcript of
   * the lyrics attributed to a participant who does not exist. Half of that
   * was right and the wrong half was the conclusion: the attribution problem
   * is solved by naming the stem honestly, and excluding it lost the case that
   * makes transcription worth having on a channel that plays anything — a
   * discussion of a recorded talk, where the talk is most of what was said.
   *
   * It is also the one stem where diarisation buys real information rather
   * than confirming what we already hold: nothing here knows how many voices
   * are inside a played track, or what any of them are called.
   *
   * **What somebody plays is theirs to have the right to play**, and that is
   * true of the recording already — transcribing it does not make a copy that
   * did not exist. BACKLOG.md § *Playing media into a channel is a copyright
   * surface nobody has addressed* is where that sits, and it is not this
   * function's to answer.
   */
  private speakersOf(recording: RecordingRow): string[] {
    const stems = parse<Record<string, unknown[]>>(recording.stems) ?? {};
    return Object.keys(stems).filter((identity) => stems[identity]?.length);
  }
}

/**
 * What to call the played-media stem on screen and in an export.
 *
 * It has no owner, so there is no name to freeze and nothing in
 * `participant_names` to look up. Named rather than left to fall through to
 * "Someone", which would read as a participant nobody can identify — the exact
 * confusion excluding the stem was once meant to avoid, arrived at from the
 * other side.
 */
export const MEDIA_LABEL = 'Played audio';

/** The name to show for one identity, given the names frozen with the run. */
export function speakerName(
  identity: string,
  names: Record<string, string>
): string {
  if (identity === MEDIA_IDENTITY) return MEDIA_LABEL;
  return names[identity] ?? identity;
}

/**
 * A transcript's lines as they are read: removed voices gone, every line named.
 *
 * The whole set goes in because that is what the questions need — whether to
 * print a letter is a fact about the stem across the transcript, and removing
 * a voice changes the answer for the ones beside it. See `core/transcript.ts`,
 * which is where the rules are and where the app reads them from too.
 */
export function readableLines(
  lines: readonly TranscriptLine[],
  names: Record<string, string>,
  voices: VoiceDeclarations = {}
): Array<TranscriptLine & { displayName: string | null }> {
  return readable(lines, (identity) => speakerName(identity, names), voices);
}

/**
 * Renders a transcript for download.
 *
 * Three formats because they are read by three different things. `txt` is for
 * a person: speaker-labelled prose with a timestamp, which is what somebody
 * pastes into a message. `vtt` is what a media player wants and what pairs
 * with the exported audio — same timeline, since the stems were rendered with
 * their delays in place. `json` is for anybody who wants to do something else
 * with it, and is the only one that carries confidence and the raw within-stem
 * speaker label.
 *
 * **Only `txt` groups.** Consecutive utterances from one voice are one entry
 * with paragraphs, because that is how a person reads prose. A WebVTT cue is a
 * different unit — it is on screen for exactly as long as it says, and a
 * grouped cue would hold a minute of text under one subtitle; and `json` is
 * the format somebody groups differently, so it hands over the rows.
 *
 * `names` is `participant_names`, frozen when the run was filed. A transcript
 * that relabels itself when somebody renames themselves is worse than one with
 * an old name in it — the whole reason that column exists.
 */
export function formatTranscript(
  lines: TranscriptLine[],
  names: Record<string, string>,
  format: 'txt' | 'vtt' | 'json',
  voices: VoiceDeclarations = {}
): { body: string; contentType: string; extension: string } {
  const named = readableLines(lines, names, voices);
  const who = (line: { displayName: string | null }) => line.displayName ?? 'Someone';

  if (format === 'json') {
    return {
      body: JSON.stringify(named, null, 2),
      contentType: 'application/json',
      extension: 'json',
    };
  }

  if (format === 'vtt') {
    const cues = named.map(
      (line, n) =>
        `${n + 1}\n${timecode(line.startMs)} --> ${timecode(line.endMs)}\n` +
        `<v ${who(line)}>${line.text}`
    );
    return {
      body: `WEBVTT\n\n${cues.join('\n\n')}\n`,
      contentType: 'text/vtt',
      extension: 'vtt',
    };
  }

  // One entry per run of a voice, its paragraphs blank-line separated — so
  // every blank line is a paragraph break and only the `[time] Name:` prefix
  // starts a new speaker, which is the convention printed transcripts use.
  const body = intoBlocks(named)
    .map((block) => {
      const [first, ...rest] = block.lines;
      const head = `[${clock(block.startMs)}] ${who(first)}: ${first.text}`;
      return [head, ...rest.map((line) => line.text)].join('\n\n');
    })
    .join('\n\n');
  return { body: `${body}\n`, contentType: 'text/plain', extension: 'txt' };
}

/** `HH:MM:SS.mmm`, which is what WebVTT wants and will not tolerate less of. */
function timecode(ms: number): string {
  const millis = String(Math.floor(ms % 1000)).padStart(3, '0');
  return `${clock(ms)}.${millis}`;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    pad(Math.floor(total / 3600)),
    pad(Math.floor(total / 60) % 60),
    pad(total % 60),
  ].join(':');
}

function requestFrom(recording: RecordingRow): ExportRequest {
  return {
    stems: parse(recording.stems) ?? {},
    timeline: parse(recording.floor_timeline) ?? [],
  };
}

function parse<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

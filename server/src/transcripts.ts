import { randomUUID } from 'node:crypto';
import { MEDIA_IDENTITY } from './channels';
import type { Db, RecordingRow } from './db';
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
}

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
      .prepare('SELECT state FROM transcripts WHERE recording_id = ?')
      .get(recordingId) as { state: string } | undefined;
    if (existing) {
      // A failed one may be replaced — that is the retry — and anything else
      // is a second charge for an answer already held or already coming.
      if (existing.state !== 'failed') {
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
    if (this.timer || !this.available()) return;
    this.restore();
    this.timer = setInterval(() => {
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
    const jobs = this.jobsOf(recordingId);
    for (const job of jobs) {
      if (job.provider_id) this.forget(job.provider_id);
    }
    this.clear(recordingId);
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
  private sweep(): void {
    const gone = this.db
      .prepare(
        `SELECT t.recording_id FROM transcripts t
         LEFT JOIN recordings r ON r.id = t.recording_id
         WHERE r.id IS NULL OR r.deleted_at IS NOT NULL`
      )
      .all() as unknown as Array<{ recording_id: string }>;
    for (const row of gone) this.deleteFor(row.recording_id);
  }

  /** Queues a pass onto the single chain. Never throws at the caller. */
  private pump(): void {
    if (!this.available()) return;
    this.working = this.working
      .then(() => this.advance())
      .catch((error) => this.onError(error, 'transcripts'));
  }

  private async advance(): Promise<void> {
    this.sweep();

    const open = this.db
      .prepare(
        `SELECT j.* FROM transcript_jobs j
         JOIN transcripts t ON t.recording_id = j.recording_id
         WHERE j.state = 'pending' AND t.state = 'pending'`
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
   * Whose stems are worth transcribing.
   *
   * `media` is excluded, and it is the interesting exclusion: it is the shared
   * playback stem — a track somebody played into the room — rather than
   * anybody's microphone. Transcribing it would turn a recording containing a
   * song into a transcript of the lyrics attributed to a participant who does
   * not exist, and would charge for the privilege. Whether it should be
   * transcribable *as the track* is an open question in TRANSCRIPTS.md, and it
   * is a different feature from this one.
   */
  private speakersOf(recording: RecordingRow): string[] {
    const stems = parse<Record<string, unknown[]>>(recording.stems) ?? {};
    return Object.keys(stems).filter(
      (identity) => identity !== MEDIA_IDENTITY && stems[identity]?.length
    );
  }
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

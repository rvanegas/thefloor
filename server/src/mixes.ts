import { type Db, type RecordingRow } from './db';
import { encodeRecording } from './export';
import { getWhenReady, type RecordingStore } from './storage';
import type { UsageMeter } from './usage';

/**
 * Making, storing and fetching a recording's finished audio.
 *
 * Split out of `channels.ts` on 2026-09-23. It is the one cluster of that
 * class that was not really about channel state: everything here is keyed by
 * a recording id, reads its own row out of the database, and talks to the
 * bucket — `ChannelRegistry` lends it five dependencies and a way to say that
 * a channel's snapshot has changed, and otherwise it touches none of the
 * registry's several dozen maps. That is what makes it separable where the
 * guest and seat flow, which reaches into `channels` and `apply` and `emit`
 * alike, is not.
 *
 * The mixes in flight are held here rather than by the registry, because
 * `mixesSettled` is the only thing that ever asks about them.
 */
export class Mixer {
  private mixing = new Map<string, Promise<void>>();

  constructor(
    private db: Db,
    private usage: UsageMeter,
    /** `ChannelRegistry.emit`: a mix finishing is not an action anybody took. */
    private emit: (channelIds: string[]) => void,
    private onMediaError: (error: unknown, context: string) => void,
    /** Read and delete on the recordings bucket; absent in tests that do not need it. */
    private store?: RecordingStore,
    /**
     * How long a mix waits for a stem that is not in the bucket yet. See
     * `getWhenReady` for why it waits at all; zero means one attempt, which is
     * what a test wants when the objects are never going to appear.
     */
    private mixWaitMs?: number
  ) {}

  /**
   * Makes a filed run's mix, and shows the recording once it exists.
   *
   * The recording is invisible until this resolves, which is the point: by the
   * time a card appears, playing it and exporting it are a fetch rather than a
   * fetch and an encode. What used to happen when somebody tapped Play — the
   * several seconds a long recording takes to mix, spent looking at "Loading…"
   * — happens here instead, while nobody is waiting for it.
   *
   * A failure is not fatal to the recording. It becomes `'unmixed'`, which is
   * displayable and exports by encoding on demand: exactly the behaviour every
   * recording had before this existed, so the worst case is the old speed
   * rather than a conversation nobody can reach.
   */
  startMix(recordingId: string, channelId: string): void {
    // Not through `this.run`, which reports a failure in a continuation of a
    // promise it has already handed back. Everything that decides whether this
    // recording is visible has to have happened by the time the tracked
    // promise settles, or `mixesSettled` resolves before the row is right and
    // a test — or a shutdown — reads a state that is still moving.
    const work = (async () => {
      try {
        await this.mix(recordingId, { wait: true });
      } catch (error) {
        this.onMediaError(error, `mix ${recordingId}`);
        // Before the state changes, because `'unmixed'` is a promise that the
        // audio can be encoded on demand and this is what establishes whether
        // that promise can be kept.
        await this.dropHollowStems(recordingId);
        this.db
          .prepare(
            `UPDATE recordings SET mix_state = 'unmixed'
             WHERE id = ? AND mix_state = 'pending'`
          )
          .run(recordingId);
      } finally {
        this.mixing.delete(recordingId);
        // Both paths emit: one has a recording to show and the other has a
        // recording to stop hiding, and neither can wait for whatever else
        // might next happen in that channel.
        this.emit([channelId]);
      }
    })();
    this.mixing.set(recordingId, work);
  }

  /**
   * Takes back the stem keys the bucket has no object for.
   *
   * A key is *reserved* by `startEgress` before LiveKit has accepted
   * anything, and read back by `fileRun` as proof that something was
   * captured. Between those two the egress can be stopped before its worker
   * ever attaches, which writes no object at all — a run of a few seconds, on
   * a microphone that opened partway through it, is enough. Observed
   * 2026-09-04 on `rec_ub4l1XLe6NCd`.
   *
   * What that leaves is worse than a failure because it does not look like
   * one: a card offering Play, a mix that cannot be made, and an export that
   * fetches a key S3 has never heard of. So a mix that failed is asked the
   * narrower question — *which of these keys is real* — and the row is
   * rewritten to claim only those.
   *
   * **A key is dropped only on a fetch that already had its wait, and a wait
   * of zero is not one.** The caller is the mix, which polls `getWhenReady`
   * for ten minutes before giving up, so an object still in flight is not
   * what this sees — what it sees is an object that is not coming. Where the
   * wait was configured away there is no such evidence and nothing is
   * dropped: `mixWaitMs: 0` is a harness saying *do not wait*, and a stem that
   * arrives a moment later is the transient failure `__tests__/mixing.test.ts`
   * pins the recovery from.
   *
   * **Every failure counts as absent, and it has to.** Without
   * `s3:ListBucket` the bucket answers a missing key with `AccessDenied`
   * naming the *list* permission rather than `NoSuchKey` — it will not
   * confirm or deny existence to a caller who cannot list — so the two cases
   * are not distinguishable from here. Treating an outage as absence is the
   * cost, and it is bounded: the row keeps its duration, its roster and its
   * name, and loses only a claim to audio that could not be fetched.
   */
  private async dropHollowStems(recordingId: string): Promise<void> {
    const store = this.store;
    if (!store) return;
    // No wait means no evidence. See the note above.
    if (this.mixWaitMs === 0) return;
    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as RecordingRow | undefined;
    if (!row) return;

    const stems: Record<string, Array<{ key: string; startMs: number }>> =
      parseJson(row.stems) ?? {};
    const hollow = new Set<string>();
    for (const segments of Object.values(stems)) {
      for (const segment of segments) {
        try {
          await store.get(segment.key);
        } catch {
          hollow.add(segment.key);
        }
      }
    }
    // The mix failed for some other reason — an encode, a write, a bucket
    // briefly unreachable and not any more. Nothing here is wrong, and
    // rewriting the row on the strength of it is the destructive answer.
    if (hollow.size === 0) return;

    const kept: Record<string, Array<{ key: string; startMs: number }>> = {};
    for (const [identity, segments] of Object.entries(stems)) {
      const surviving = segments.filter((segment) => !hollow.has(segment.key));
      if (surviving.length > 0) kept[identity] = surviving;
    }
    const flat = Object.values(kept)
      .flat()
      .map((segment) => segment.key);

    // The same words `fileRun` uses for a run that ended with no stems at
    // all, because it is the same fact arriving late. Said once, so a reader
    // is not left deciding whether two messages mean two things.
    const failure =
      flat.length === 0
        ? 'Nothing was captured — no audio was being published.'
        : row.failure;

    this.db
      .prepare(
        `UPDATE recordings SET stems = ?, segment_keys = ?, s3_key = ?,
                failure = ? WHERE id = ?`
      )
      .run(
        JSON.stringify(kept),
        JSON.stringify(flat),
        flat[0] ?? '',
        failure,
        recordingId
      );
  }

  /**
   * Resolves once no mix is in flight.
   *
   * Exposed for the same reason `tick` is: mixing is the one thing a recording
   * now waits on before it exists, and a test that cannot await it is left
   * racing a promise chain with a `setTimeout(0)`.
   */
  async mixesSettled(): Promise<void> {
    while (this.mixing.size > 0) {
      await Promise.allSettled([...this.mixing.values()]);
    }
  }

  /**
   * Encodes one recording and stores the result beside its stems.
   *
   * `wait` is whether a stem that is not in the bucket yet is worth waiting
   * for. It is, immediately after a run: `stopEgress` returns when LiveKit has
   * accepted the stop, not when the upload has landed. It is not when somebody
   * is holding an HTTP request open — there, a missing object means missing,
   * and the caller should be told so rather than left hanging.
   */
  private async mix(
    recordingId: string,
    { wait }: { wait: boolean }
  ): Promise<Buffer> {
    const store = this.store;
    if (!store) throw new Error('Recording storage is not configured.');

    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as RecordingRow | undefined;
    if (!row) throw new Error(`No such recording: ${recordingId}`);

    const { data } = await encodeRecording(
      {
        stems: parseJson(row.stems) ?? {},
        timeline: parseJson(row.floor_timeline) ?? [],
      },
      async (key) => {
        const stem = await (wait
          ? getWhenReady(store, key, { waitMs: this.mixWaitMs })
          : store.get(key));
        // Nobody asked for this, so no account is named. Mixing is what a
        // recording costs by existing, and it is charged to the recording.
        this.usage.recordBytes({
          kind: 'mix-read',
          bytes: stem.length,
          recordingId,
        });
        return stem;
      }
    );

    // Stored before the row says it exists, so a crash between the two leaves
    // an object nobody reads rather than a row promising one that is not
    // there. The sweep deletes the key whether or not the state says 'ready',
    // so the orphan is not permanent either.
    await store.put(mixKeyFor(row.channel_id, row.id), data);
    this.usage.recordBytes({
      kind: 'mix-write',
      bytes: data.length,
      recordingId,
    });
    this.db
      .prepare("UPDATE recordings SET mix_state = 'ready' WHERE id = ?")
      .run(row.id);
    // The card is on screen with Play and Export greyed; this is what ungreys
    // them. Nothing else would: a mix finishing is not an action anybody took,
    // so no dispatch is going to push a snapshot on its behalf.
    this.emit([row.channel_id]);
    return data;
  }

  /**
   * One recording's finished audio, with the floor applied — the bytes both
   * exporting it and playing it back into its channel are made of.
   *
   * Normally one GetObject, because the mix was made when the run ended. The
   * fallbacks are what make that an optimisation rather than a dependency: a
   * row from before mixes existed, or one whose mix failed, is encoded here
   * and stored on the way past, so it is only ever slow once.
   *
   * **This does not decide who may hear it.** The caller has already asked
   * `recordingsFor`, which is the one place that rule lives.
   */
  async recordingAudio(recordingId: string): Promise<Buffer> {
    const store = this.store;
    if (!store) throw new Error('Recording storage is not configured.');

    const row = this.db
      .prepare('SELECT id, channel_id, mix_state FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as
      | Pick<RecordingRow, 'id' | 'channel_id' | 'mix_state'>
      | undefined;
    if (!row) throw new Error(`No such recording: ${recordingId}`);

    if (row.mix_state === 'ready') {
      try {
        return await store.get(mixKeyFor(row.channel_id, row.id));
      } catch (error) {
        // The row says there is a mix and the bucket disagrees. Making it
        // again is both the fix and the answer, and it costs the caller what
        // an export used to cost everybody.
        this.onMediaError(error, `mix missing ${recordingId}`);
      }
    }
    return this.mix(recordingId, { wait: false });
  }
}

/**
 * Where a recording's mix lives, beside the stems it was made from.
 *
 * The same `<channel>/<run>/` prefix `startEgress` writes stems under, so
 * everything one run produced is in one place in the bucket — which is what
 * makes an orphaned object identifiable by eye when something has gone wrong.
 * `mixed` cannot collide with a stem, whose name is always `<identity>-<nnn>`.
 *
 * Derived rather than stored: unlike the stems, there is exactly one of these
 * per recording and it is rewritten in place whenever the mix is remade, so a
 * column would only be a second place for the same fact to be wrong.
 */
export function mixKeyFor(channelId: string, recordingId: string): string {
  return `${channelId}/${recordingId}/mixed.ogg`;
}

/** Tolerates the malformed, which is the point: a sweep must not be stoppable. */
function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

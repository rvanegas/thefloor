import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants, setPriority, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Turns a channel's isolated stems into the single recording a user receives,
 * with the floor applied.
 *
 * This is where being silenced becomes a fact about the artefact rather than a
 * promise: a speaker's stem is muted across every window in which they held no
 * floor while someone else did. Capture deliberately does not enforce it — the
 * stems are complete, and live in a bucket only the server can read — so this
 * step is the last thing standing between a silenced remark and a user's ears.
 */

export interface FloorWindow {
  identity: string;
  fromMs: number;
  toMs: number;
}

/** One captured object and where in the recorded audio it begins. */
export interface StemSegment {
  key: string;
  startMs: number;
}

export interface ExportRequest {
  /**
   * Each participant's segments, in order. Recordings made since channels
   * could gain people mid-run carry a start offset per segment, so a late
   * joiner's audio lands where it happened; older rows are plain key lists
   * whose segments all abut, and are concatenated as they always were.
   */
  stems: Record<string, StemSegment[] | string[]>;
  timeline: FloorWindow[];
}

const ms = (value: number) => (value / 1000).toFixed(3);

const segmentKey = (segment: StemSegment | string): string =>
  typeof segment === 'string' ? segment : segment.key;

/** Every object key referenced by a request, in stem order. */
export function stemKeys(request: ExportRequest): string[] {
  return Object.values(request.stems).flat().map(segmentKey);
}

/** Every object key one identity's stem is made of, in order. */
export function stemKeysFor(request: ExportRequest, identity: string): string[] {
  return (request.stems[identity] ?? []).map(segmentKey);
}

/**
 * Builds one identity's branch of the graph: their segments rejoined onto the
 * recording's timeline, then gated to silence across every window in which they
 * held no floor.
 *
 * **This is the whole of what the floor means to a stored artefact**, and it is
 * separate so that it cannot be got right in one place and wrong in another.
 * `buildFilterGraph` calls it once per speaker and mixes what comes back, and
 * anything else that wants one person's audio — a transcript is the first — asks
 * for it here rather than reaching for the ungated bytes in the bucket. If the
 * gating is ever changed, both change together, which is the property that
 * matters. See planning/TRANSCRIPTS.md § *What is sent is the gated stem*.
 *
 * `label` names this branch's intermediate streams and must be unique within a
 * graph; the default suits a graph containing only this stem.
 */
export function buildStemGraph(
  request: ExportRequest,
  identity: string,
  inputIndex: Map<string, number>,
  label = 's0'
): { filter: string; label: string } | null {
  const files = request.stems[identity];
  if (!files || files.length === 0) return null;

  const parts: string[] = [];
  const indexes = files.map((f) => inputIndex.get(segmentKey(f)));
  if (indexes.some((i) => i === undefined)) {
    throw new Error(`Missing input for a segment of ${identity}`);
  }

  // The segments are rejoined into one timeline before anything is gated —
  // the window offsets are positions in the recorded audio, which is exactly
  // what recordedMs measured.
  if (typeof files[0] === 'string') {
    // Legacy rows: no offsets, every segment abuts the last, so
    // concatenation reconstructs the timeline as it always did.
    if (files.length === 1) {
      parts.push(`[${indexes[0]}:a]anull[${label}_j]`);
    } else {
      const ins = indexes.map((i) => `[${i}:a]`).join('');
      parts.push(`${ins}concat=n=${files.length}:v=0:a=1[${label}_j]`);
    }
  } else {
    // Each segment is delayed to where its capture began, then the segments
    // are mixed. They never overlap — one person cannot be captured twice at
    // once — so the mix is a join, and normalize=0 keeps their level.
    const segments = files as StemSegment[];
    const placed = segments.map((segment, s) => {
      const part = `${label}_p${s}`;
      parts.push(
        `[${indexes[s]}:a]adelay=${Math.round(segment.startMs)}:all=1[${part}]`
      );
      return `[${part}]`;
    });
    if (placed.length === 1) {
      parts.push(`${placed[0]}anull[${label}_j]`);
    } else {
      parts.push(
        `${placed.join('')}amix=inputs=${placed.length}:normalize=0:duration=longest[${label}_j]`
      );
    }
  }

  // One volume filter per window, chained. A single combined expression
  // would be terser and much harder to read when a gate misfires.
  const windows = request.timeline.filter((w) => w.identity === identity);
  let current = `${label}_j`;
  windows.forEach((window, w) => {
    const next = `${label}_g${w}`;
    parts.push(
      `[${current}]volume=enable='between(t,${ms(window.fromMs)},${ms(
        window.toMs
      )})':volume=0[${next}]`
    );
    current = next;
  });
  return { filter: parts.join(';'), label: current };
}

/**
 * Builds the ffmpeg filter graph for the whole recording. Kept pure and
 * separate from running anything, because the gating is the part that must be
 * right and a filter string can be asserted on directly.
 *
 * `inputIndex` maps each stem file, in the order it will be passed to ffmpeg.
 */
export function buildFilterGraph(
  request: ExportRequest,
  inputIndex: Map<string, number>
): { filter: string; label: string } | null {
  const identities = Object.keys(request.stems).filter(
    (id) => request.stems[id].length > 0
  );
  if (identities.length === 0) return null;

  const parts: string[] = [];
  const mixInputs: string[] = [];

  identities.forEach((identity, n) => {
    // Verbatim, per speaker. The mix is a mix of gated stems and nothing more,
    // so there is no arrangement of inputs under which a transcript could hear
    // something the exported recording does not.
    const stem = buildStemGraph(request, identity, inputIndex, `s${n}`);
    if (!stem) return;
    parts.push(stem.filter);
    mixInputs.push(`[${stem.label}]`);
  });

  if (mixInputs.length === 1) {
    return { filter: parts.join(';'), label: mixInputs[0].slice(1, -1) };
  }

  // normalize=0 keeps each speaker at their recorded level; the default would
  // duck everyone whenever both are talking, which is not what was heard.
  parts.push(
    `${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0[out]`
  );
  return { filter: parts.join(';'), label: 'out' };
}

/** Fetches an object's bytes. Separated so tests can supply stems directly. */
export type FetchObject = (key: string) => Promise<Buffer>;

/**
 * What a mixed recording is, whether it was just encoded or fetched from the
 * bucket having been encoded when the run ended. One constant because those
 * two paths must not be able to describe the same bytes differently.
 */
export const RECORDING_CONTENT_TYPE = 'audio/ogg';

export interface EncodeResult {
  data: Buffer;
  contentType: string;
}

export interface StemResult extends EncodeResult {
  /**
   * How long the rendered audio runs, in milliseconds, or null if it could not
   * be measured.
   *
   * Only the stem path measures this, because only the stem path is billed for
   * by the second. Nullable rather than falling back to a guess: a caller that
   * gets a number can record what it sent, and one that gets null knows it is
   * estimating instead of being quietly handed an estimate.
   */
  durationMs: number | null;
}

/**
 * Fetches the stems, applies the floor, and mixes them into one file.
 *
 * Everything happens in a temporary directory that is always removed: these are
 * private conversations, and leaving them on a disk after the response has been
 * sent would be a quiet way to accumulate copies nobody knows about.
 */
export async function encodeRecording(
  request: ExportRequest,
  fetchObject: FetchObject,
  ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'
): Promise<EncodeResult> {
  const files = stemKeys(request);
  if (files.length === 0) throw new Error('This recording has no audio.');

  const dir = await mkdtemp(join(tmpdir(), 'thefloor-export-'));
  try {
    const inputIndex = new Map<string, number>();
    const args: string[] = [];
    let index = 0;
    for (const key of files) {
      const local = join(dir, `${index}.ogg`);
      await writeFile(local, await fetchObject(key));
      inputIndex.set(key, index);
      args.push('-i', local);
      index += 1;
    }

    const graph = buildFilterGraph(request, inputIndex);
    if (!graph) throw new Error('This recording has no audio.');

    const output = join(dir, 'mixed.ogg');
    await run(
      ffmpegPath,
      [
        '-v',
        'error',
        // One core, so the other stays free for the SFU. See `run` below.
        '-threads',
        '1',
        '-filter_threads',
        '1',
        ...args,
        '-filter_complex',
        graph.filter,
        '-map',
        `[${graph.label}]`,
        '-c:a',
        'libopus',
        '-y',
        output,
      ],
      dir
    );

    return { data: await readFile(output), contentType: RECORDING_CONTENT_TYPE };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Renders one participant's gated audio as a single Opus file.
 *
 * The same graph the mix is built from, for one speaker, encoded on its own —
 * which is what a transcript is submitted from. **Never the bytes in the
 * bucket**: those are ungated and contain what a silenced person said while
 * holding no floor, so transcribing them would produce a searchable, permanent
 * text of the remark the recording deliberately does not carry.
 *
 * The delays are left in place, so the result begins where the recording does
 * rather than where this person's first segment does. That costs a little
 * silence to encode and to send, and it buys the property everything
 * downstream leans on: a time in this file is a time in the recording, so a
 * transcript's word timings need no offset arithmetic and can seek shared
 * playback directly.
 */
export async function encodeStem(
  request: ExportRequest,
  identity: string,
  fetchObject: FetchObject,
  ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'
): Promise<StemResult> {
  const files = stemKeysFor(request, identity);
  if (files.length === 0) {
    throw new Error(`This recording has no audio for ${identity}.`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'thefloor-stem-'));
  try {
    const inputIndex = new Map<string, number>();
    const args: string[] = [];
    let index = 0;
    for (const key of files) {
      const local = join(dir, `${index}.ogg`);
      await writeFile(local, await fetchObject(key));
      inputIndex.set(key, index);
      args.push('-i', local);
      index += 1;
    }

    const graph = buildStemGraph(request, identity, inputIndex);
    if (!graph) throw new Error(`This recording has no audio for ${identity}.`);

    const output = join(dir, 'stem.ogg');
    await run(
      ffmpegPath,
      [
        '-v',
        'error',
        // One core, so the other stays free for the SFU. See `run` below.
        '-threads',
        '1',
        '-filter_threads',
        '1',
        ...args,
        '-filter_complex',
        graph.filter,
        '-map',
        `[${graph.label}]`,
        '-c:a',
        'libopus',
        '-y',
        output,
      ],
      dir
    );

    return {
      data: await readFile(output),
      contentType: RECORDING_CONTENT_TYPE,
      durationMs: await duration(output, ffmpegPath),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * How long an encoded file runs, by asking ffprobe.
 *
 * Never throws: this is a measurement taken beside the work rather than part
 * of it, and a recording that cannot be measured is still a recording. The
 * caller decides what an unmeasured one means.
 *
 * ffprobe rather than reading it off the encode, because ffmpeg reports
 * duration on stderr in a format that has changed between versions, and
 * because ffprobe ships with every ffmpeg this could be pointed at.
 */
async function duration(
  path: string,
  ffmpegPath: string
): Promise<number | null> {
  const probe = ffmpegPath.replace(/ffmpeg([^/\\]*)$/, 'ffprobe$1');
  try {
    const seconds = await capture(probe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path,
    ]);
    const value = Number(seconds.trim());
    return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
  } catch {
    return null;
  }
}

function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}`))
    );
  });
}

/**
 * Runs ffmpeg, and makes sure it yields to the conversation.
 *
 * **The media plane is on this box.** Since 2026-08-13 the SFU, the egress
 * jobs and this server share two vCPUs, so a mix is not a background job on a
 * quiet machine — it is competition for the cores that are carrying live
 * audio. A six-person four-hour recording is twenty-four stream-hours, which
 * is minutes of pinned CPU, and nobody is waiting on the file.
 *
 * **An export has no urgency and a call has nothing but.** So the mix is made
 * to lose every contest for the processor, by two mechanisms that fail
 * differently and are therefore both worth having:
 *
 * - `-threads 1` and `-filter_threads 1` at the call sites cap ffmpeg at one
 *   core, so **one of the two is always left for the SFU** regardless of what
 *   the scheduler decides.
 * - `setPriority` here makes it yield *on that core* too, whenever anything
 *   else is runnable.
 *
 * Niceness rather than a hard `CPUQuota`, deliberately: a quota would slow the
 * mix even on an idle box, where nice costs nothing when nothing else wants
 * the CPU and everything when something does. That is exactly the trade
 * wanted — an export should be free when the box is quiet and invisible when
 * it is not.
 *
 * **Best-effort by construction.** A platform that refuses to renice is one
 * where the export still works, so the failure is swallowed: this is a
 * courtesy to the conversation, and a courtesy that could fail an export would
 * be the wrong way round.
 */
function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    try {
      if (child.pid !== undefined) {
        setPriority(child.pid, constants.priority.PRIORITY_LOW);
      }
    } catch {
      // No permission, or a platform without priorities. The mix runs anyway.
    }
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

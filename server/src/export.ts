import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
): Promise<EncodeResult> {
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

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
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

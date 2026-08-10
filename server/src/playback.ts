import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Shared playback: one file, decoded here, heard by both parties at once.
 *
 * The pump produces a continuous stream of 10ms frames for as long as a track
 * is loaded — decoded audio while playing, silence otherwise — and sends every
 * frame to two places: the room, so the pair hear it, and (while recording) an
 * encoder, so the recording gets it.
 *
 * **Those are the same samples.** That is the whole design. What the recording
 * contains is what was heard, including the seeks, the pauses and the volume,
 * because it is literally the same bytes rather than a re-render from a log of
 * what happened. A second rendering path would be a second thing to get wrong,
 * and it could not reproduce what the first one actually did anyway.
 *
 * The frame loop is also what keeps the stem aligned with the speakers' stems:
 * silence costs exactly as many samples as sound, so a paused track occupies
 * its real duration in the recording instead of collapsing to nothing.
 *
 * Everything the pump talks to is an interface, for the reason MediaServer is
 * one: the parts that have to be right — offsets, silence, levels — are then
 * testable without a media server or a real decoder.
 */

export const SAMPLE_RATE = 48_000;
export const CHANNELS = 1;
export const FRAME_MS = 10;
export const SAMPLES_PER_FRAME = (SAMPLE_RATE / 1000) * FRAME_MS;

export function msToSamples(ms: number): number {
  return Math.round((ms * SAMPLE_RATE) / 1000);
}

/** Where frames go to be heard. Wraps LiveKit's AudioSource. */
export interface FrameSink {
  capture(samples: Int16Array): Promise<void>;
  close(): Promise<void>;
}

/** Decoded PCM from one position in one file. Wraps an ffmpeg child. */
export interface Decoder {
  /**
   * The next `samples` samples, zero-padded if the file ends mid-frame, or null
   * once it is exhausted.
   */
  read(samples: number): Promise<Int16Array | null>;
  stop(): Promise<void>;
}

/** Where the recorded stem is written. Wraps a second ffmpeg child. */
export interface StemEncoder {
  write(samples: Int16Array): void;
  /** Closes the stream and resolves when the file is complete. */
  finish(): Promise<void>;
}

export interface PlaybackPumpOptions {
  sink: FrameSink;
  /** Opens a decoder on `file` positioned at `fromMs`. */
  openDecoder: (file: string, fromMs: number) => Decoder;
  volume?: number;
  /** Reported when decoding fails; the session turns it into a visible failure. */
  onFailure?: (error: unknown) => void;
}

export class PlaybackPump {
  private file: string | null = null;
  private decoder: Decoder | null = null;
  private encoder: StemEncoder | null = null;
  private playing = false;
  private closed = false;
  private volume: number;
  private loop: Promise<void> | null = null;

  constructor(private options: PlaybackPumpOptions) {
    this.volume = clampVolume(options.volume ?? 1);
  }

  /**
   * Starts producing frames and does not stop until closed.
   *
   * Silence is published as diligently as audio. A source that went quiet
   * between tracks would leave the publication idle, and an idle publication is
   * what makes a recording stem fall out of step with everyone else's.
   */
  start(): void {
    if (this.loop) return;
    this.loop = this.run();
  }

  private async run(): Promise<void> {
    while (!this.closed) {
      try {
        await this.pumpOnce();
      } catch (error) {
        this.options.onFailure?.(error);
        // Stop decoding but keep the loop alive: the publication must go on
        // producing silence, or the stem loses its place in the recording.
        this.playing = false;
        await this.stopDecoder();
      }
    }
  }

  /**
   * Produces exactly one frame. Separate from the loop so tests can step it
   * deterministically rather than racing a real-time pump.
   */
  async pumpOnce(): Promise<void> {
    const frame = await this.nextFrame();
    // The encoder first, so the recording cannot be missing a frame the room
    // received. Both get the identical buffer, which is the point.
    this.encoder?.write(frame);
    await this.options.sink.capture(frame);
  }

  private async nextFrame(): Promise<Int16Array> {
    const frame = new Int16Array(SAMPLES_PER_FRAME);
    if (!this.playing || !this.decoder) return frame;

    const decoded = await this.decoder.read(SAMPLES_PER_FRAME);
    if (decoded === null) {
      // The file ran out. The session's own clock decides when the track is
      // over; the pump simply has nothing more to contribute.
      this.playing = false;
      await this.stopDecoder();
      return frame;
    }

    const scale = this.volume;
    for (let i = 0; i < frame.length && i < decoded.length; i += 1) {
      frame[i] = clampSample(decoded[i] * scale);
    }
    return frame;
  }

  /**
   * Swaps in a different file, leaving everything else standing.
   *
   * Changing the track must not disturb the publication or the encoder. Both
   * are what keep the recording stem continuous, and a stem broken in the
   * middle of a recording run would no longer line up with the speakers' — the
   * export concatenates a participant's segments assuming they are contiguous,
   * and a gap here has no way to say so.
   */
  async setFile(file: string): Promise<void> {
    this.file = file;
    await this.pause();
  }

  /**
   * Plays from `fromMs`. Resuming and seeking are the same act — both mean
   * "decode from here" — so they share one path and one decoder respawn.
   */
  async play(fromMs: number): Promise<void> {
    await this.stopDecoder();
    if (!this.file) return;
    this.decoder = this.options.openDecoder(this.file, fromMs);
    this.playing = true;
  }

  async pause(): Promise<void> {
    this.playing = false;
    await this.stopDecoder();
  }

  /**
   * Sets the level applied to every subsequent frame.
   *
   * Deliberately not a decoder option: applying it to the samples in passing
   * makes it audible on the very next frame, where re-opening the decoder to
   * change volume would drop a few frames and audibly stumble.
   */
  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
  }

  /**
   * Begins writing the recording stem, prepending `offsetMs` of silence.
   *
   * That prefix is what keeps the stem alignable by plain concatenation. A
   * track loaded partway through a recording starts its stem partway through
   * too; padding the difference here means the export can mix this stem against
   * the speakers' without knowing anything happened.
   */
  startCapture(encoder: StemEncoder, offsetMs: number): void {
    if (offsetMs > 0) encoder.write(new Int16Array(msToSamples(offsetMs)));
    this.encoder = encoder;
  }

  async stopCapture(): Promise<void> {
    const encoder = this.encoder;
    this.encoder = null;
    if (encoder) await encoder.finish();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.playing = false;
    await this.stopDecoder();
    await this.stopCapture();
    if (this.loop) await this.loop.catch(() => {});
    await this.options.sink.close();
  }

  private async stopDecoder(): Promise<void> {
    const decoder = this.decoder;
    this.decoder = null;
    if (decoder) await decoder.stop();
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

function clampSample(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

// --- ffmpeg-backed implementations ------------------------------------------

/**
 * Decodes a file to raw mono PCM from a position, using ffmpeg's own seek.
 *
 * `-ss` before `-i` so ffmpeg seeks the input rather than decoding and
 * discarding everything up to the mark, which for a long file is the difference
 * between instant and several seconds.
 */
export class FfmpegDecoder implements Decoder {
  private child: ChildProcess;
  private pending: Buffer = Buffer.alloc(0);
  private ended = false;
  private failure: Error | null = null;
  private waiting: (() => void) | null = null;

  constructor(file: string, fromMs: number, ffmpegPath: string) {
    this.child = spawn(ffmpegPath, [
      '-v', 'error',
      '-ss', (fromMs / 1000).toFixed(3),
      '-i', file,
      '-f', 's16le',
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      'pipe:1',
    ]);

    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.pending = Buffer.concat([this.pending, chunk]);
      this.wake();
    });
    let stderr = '';
    this.child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    this.child.on('error', (error) => {
      this.failure = error;
      this.ended = true;
      this.wake();
    });
    this.child.on('close', (code) => {
      // A non-zero exit with audio already delivered is not worth failing the
      // session over; one with nothing delivered means the file was unplayable.
      if (code !== 0 && this.pending.length === 0) {
        this.failure = new Error(
          `Could not decode the track${stderr ? `: ${stderr.trim().slice(0, 200)}` : '.'}`
        );
      }
      this.ended = true;
      this.wake();
    });
  }

  async read(samples: number): Promise<Int16Array | null> {
    const wanted = samples * 2;
    while (this.pending.length < wanted && !this.ended) {
      await new Promise<void>((resolve) => {
        this.waiting = resolve;
      });
    }
    if (this.failure) throw this.failure;

    if (this.pending.length === 0) return this.ended ? null : new Int16Array(samples);

    const take = Math.min(wanted, this.pending.length);
    const chunk = this.pending.subarray(0, take);
    this.pending = this.pending.subarray(take);

    // Zero-padded when the file ends mid-frame, so the final frame is still a
    // whole frame and the stem's length stays a multiple of the frame size.
    const out = new Int16Array(samples);
    for (let i = 0; i * 2 + 1 < take; i += 1) out[i] = chunk.readInt16LE(i * 2);
    return out;
  }

  async stop(): Promise<void> {
    if (!this.ended) this.child.kill('SIGKILL');
    this.pending = Buffer.alloc(0);
    this.wake();
  }

  private wake(): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.();
  }
}

/**
 * An upload that is not playable audio.
 *
 * A distinct type rather than a message the caller pattern-matches on: this is
 * the one failure here that is the user's to fix, so the route has to tell it
 * apart from a server fault reliably, and ffprobe's wording is not a contract.
 */
export class UnreadableAudioError extends Error {}

/**
 * How long an uploaded file plays for, in milliseconds.
 *
 * Asked of the file rather than taken from the client: the duration drives the
 * scrubber and the end-of-track transition, and a client that got it wrong —
 * or made it up — would leave the pair looking at a position that never
 * arrives. It doubles as the check that the upload is audio at all, since
 * ffprobe reports no duration for something it cannot decode.
 */
export async function probeDurationMs(
  file: string,
  ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'
): Promise<number> {
  const seconds = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk) => {
      out += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      err += String(chunk);
    });
    // A missing ffprobe is the server's problem; anything it ran and rejected
    // is the file's.
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(
            new UnreadableAudioError(
              err.trim().slice(0, 200) || `ffprobe exited ${code}`
            )
          )
    );
  });

  const value = Number.parseFloat(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    throw new UnreadableAudioError('That file has no audio to play.');
  }
  return Math.round(value * 1000);
}

/** Encodes the frames the pump produced into one Opus file. */
export class FfmpegStemEncoder implements StemEncoder {
  private child: ChildProcess;
  private done: Promise<void>;

  constructor(
    readonly path: string,
    ffmpegPath: string
  ) {
    this.child = spawn(ffmpegPath, [
      '-v', 'error',
      '-f', 's16le',
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-y', path,
    ]);
    let stderr = '';
    this.child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    this.done = new Promise<void>((resolve, reject) => {
      this.child.on('error', reject);
      this.child.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 200)}`)
            )
      );
    });
  }

  write(samples: Int16Array): void {
    const buffer = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i += 1) {
      buffer.writeInt16LE(samples[i], i * 2);
    }
    this.child.stdin?.write(buffer);
  }

  async finish(): Promise<void> {
    this.child.stdin?.end();
    await this.done;
  }
}

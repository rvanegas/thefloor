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
  /** Reported when decoding fails; the channel turns it into a visible failure. */
  onFailure?: (error: unknown) => void;
  /** Injectable so the pacing loop is testable without waiting in real time. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * How far behind schedule the loop may fall before it stops trying to catch up.
 *
 * Past this, the frames it owes are worth less than the delay of delivering
 * them late in a burst, so it resynchronises to now and carries on. Under it,
 * small overruns are absorbed by not sleeping the difference.
 */
const RESYNC_AFTER_MS = 200;

/**
 * How long `close` waits for the loop to finish the frame it is on.
 *
 * Closing has to be bounded because the loop's own await is not: `capture`
 * resolves when the FFI acknowledges the buffer, and an acknowledgement that
 * never arrives leaves `pumpOnce` pending for the life of the process. Waiting
 * on the loop unconditionally would then hang whoever is closing — a channel
 * ending, or the rebuild that a stall is supposed to trigger — which is how a
 * wedged pump takes the thing that would have replaced it down with it.
 *
 * A frame takes under a millisecond to publish, so this is generous by two
 * orders of magnitude and is only ever paid by a pump that is already broken.
 */
const CLOSE_GRACE_MS = 250;

export class PlaybackPump {
  private file: string | null = null;
  private decoder: Decoder | null = null;
  private encoder: StemEncoder | null = null;
  private playing = false;
  private closed = false;
  private volume: number;
  private loop: Promise<void> | null = null;
  /**
   * When the last frame reached the sink, which is the only evidence that this
   * pump is still a thing anybody can hear.
   *
   * Zero until `start`, so a pump that has never run reads as stale rather than
   * as new. Nothing here acts on it — the registry does, once a tick — because
   * the correction for a pump that has stopped is to build another one, and a
   * pump cannot build its own replacement.
   */
  private lastFrameAt = 0;

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
    this.lastFrameAt = this.clock();
    this.loop = this.run();
  }

  /** The clock the pacing and the heartbeat share, injectable for tests. */
  private clock(): number {
    return (this.options.now ?? Date.now)();
  }

  /**
   * When a frame last reached the sink.
   *
   * The heartbeat a stall is read off. Frames are 10ms apart and are produced
   * whether or not anything is playing, so this advancing is the difference
   * between a channel that is quiet and one that has stopped being audible at
   * all — which are indistinguishable from every other signal this server has,
   * including the transport, which is a clock rather than a measurement.
   */
  producedAt(): number {
    return this.lastFrameAt;
  }

  /**
   * Paces the loop against the wall clock, one frame every FRAME_MS.
   *
   * **The pacing has to be here, because nothing downstream provides it.**
   * `AudioSource.captureFrame` awaits only the FFI acknowledgement that the
   * native side took the buffer — it does not wait for the audio to play out,
   * and the promise it keeps for that is consumed by `waitForPlayout` alone.
   *
   * Relying on it as backpressure is what made the first version choppy: the
   * loop ran as fast as ffmpeg could decode, which for a local file is many
   * times real time, so a whole track was pushed into a one-second native
   * queue in a fraction of the time it takes to play. The queue cannot hold
   * that and the overflow is audible.
   *
   * Scheduling from a running deadline rather than sleeping FRAME_MS after
   * each frame means the work done per frame does not accumulate as drift.
   */
  private async run(): Promise<void> {
    const now = this.options.now ?? (() => Date.now());
    const sleep =
      this.options.sleep ??
      ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

    let due = now();
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

      due += FRAME_MS;
      const delay = due - now();
      if (delay > 0) {
        await sleep(delay);
      } else if (delay < -RESYNC_AFTER_MS) {
        // Something stalled the loop badly — a long GC, a slow disk. Deliver
        // the next frame now rather than sprinting through the backlog.
        due = now();
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
    this.lastFrameAt = this.clock();
  }

  private async nextFrame(): Promise<Int16Array> {
    const frame = new Int16Array(SAMPLES_PER_FRAME);
    if (!this.playing || !this.decoder) return frame;

    const decoder = this.decoder;
    const decoded = await decoder.read(SAMPLES_PER_FRAME);

    /**
     * The read was answered by a decoder that has since been replaced, so its
     * answer says nothing about what is playing now.
     *
     * `play` and `pause` both stop the current decoder, and stopping one wakes
     * whatever read is waiting on it — with `null`, because a killed ffmpeg
     * ends. Acting on that below would set `playing` false and stop the
     * decoder that had just been opened: a seek issued while the pump happened
     * to be waiting for samples left the channel publishing silence for the
     * rest of its life, with every screen showing the transport running.
     */
    if (this.decoder !== decoder) return frame;

    if (decoded === null) {
      // The file ran out. The channel's own clock decides when the track is
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
    // Bounded, and see CLOSE_GRACE_MS: the loop exits after the frame it is
    // on, and the frame it is on is exactly what a wedged sink never finishes.
    if (this.loop) await Promise.race([this.loop.catch(() => {}), grace()]);
    await this.options.sink.close();
  }

  private async stopDecoder(): Promise<void> {
    const decoder = this.decoder;
    this.decoder = null;
    if (decoder) await decoder.stop();
  }
}

/**
 * The bound on `close`. Unref'd so a process with nothing else to do is not
 * held open by the grace period of a pump that is already shutting down.
 */
function grace(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, CLOSE_GRACE_MS).unref?.();
  });
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
/**
 * How much decoded audio to hold before making ffmpeg wait.
 *
 * ffmpeg decodes a local file far faster than real time, and the pump consumes
 * it at exactly real time, so without a limit the entire track accumulates in
 * memory — around 17MB for three minutes at 48kHz mono, on a 2GB box, with the
 * copying that goes with it. Pausing the pipe pushes the buffering back onto
 * the operating system, where it costs nothing.
 *
 * Two seconds is comfortably more than the jitter the pump can suffer and far
 * less than any track.
 */
const DECODE_HIGH_WATER_BYTES = SAMPLE_RATE * CHANNELS * 2 * 2;
const DECODE_LOW_WATER_BYTES = DECODE_HIGH_WATER_BYTES / 2;

export class FfmpegDecoder implements Decoder {
  private child: ChildProcess;
  /**
   * Held as arriving chunks rather than one joined buffer. Concatenating on
   * every chunk copies everything received so far, which is quadratic in the
   * length of the track and produced exactly the GC pressure that stalls a
   * loop with a 10ms budget.
   */
  private chunks: Buffer[] = [];
  private pendingBytes = 0;
  private paused = false;
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
      this.chunks.push(chunk);
      this.pendingBytes += chunk.length;
      if (this.pendingBytes >= DECODE_HIGH_WATER_BYTES && !this.paused) {
        this.paused = true;
        this.child.stdout?.pause();
      }
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
      // channel over; one with nothing delivered means the file was unplayable.
      if (code !== 0 && this.pendingBytes === 0) {
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
    while (this.pendingBytes < wanted && !this.ended) {
      await new Promise<void>((resolve) => {
        this.waiting = resolve;
      });
    }
    if (this.failure) throw this.failure;

    if (this.pendingBytes === 0) {
      return this.ended ? null : new Int16Array(samples);
    }

    const take = Math.min(wanted, this.pendingBytes);
    const frame = Buffer.allocUnsafe(take);
    let filled = 0;
    while (filled < take) {
      const head = this.chunks[0];
      const n = Math.min(head.length, take - filled);
      head.copy(frame, filled, 0, n);
      filled += n;
      if (n === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(n);
    }
    this.pendingBytes -= take;

    // Let ffmpeg run again once the backlog has been worked down. The gap
    // between the marks stops this flapping pause/resume on every frame.
    if (this.paused && this.pendingBytes <= DECODE_LOW_WATER_BYTES) {
      this.paused = false;
      this.child.stdout?.resume();
    }

    // Zero-padded when the file ends mid-frame, so the final frame is still a
    // whole frame and the stem's length stays a multiple of the frame size.
    const out = new Int16Array(samples);
    for (let i = 0; i * 2 + 1 < take; i += 1) out[i] = frame.readInt16LE(i * 2);
    return out;
  }

  async stop(): Promise<void> {
    if (!this.ended) this.child.kill('SIGKILL');
    this.chunks = [];
    this.pendingBytes = 0;
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

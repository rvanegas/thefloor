import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FfmpegDecoder,
  FRAME_MS,
  PlaybackPump,
  SAMPLE_RATE,
  SAMPLES_PER_FRAME,
  msToSamples,
  type Decoder,
  type FrameSink,
  type StemEncoder,
} from '../src/playback';

/**
 * The pump against fakes rather than ffmpeg and LiveKit.
 *
 * What has to be right here is arithmetic — how many samples, at what level,
 * from what offset — and that is exactly what a real decoder and a real media
 * server would make hard to assert. The ffmpeg-backed implementations are thin
 * wrappers around processes; these are the parts with decisions in them.
 */

/** Yields a constant sample value, so scaling is visible in the output. */
class ConstantDecoder implements Decoder {
  stopped = false;
  read: (samples: number) => Promise<Int16Array | null>;

  constructor(
    readonly fromMs: number,
    value = 1000,
    framesAvailable = Infinity
  ) {
    let served = 0;
    this.read = async (samples: number) => {
      if (served >= framesAvailable) return null;
      served += 1;
      return new Int16Array(samples).fill(value);
    };
  }

  async stop() {
    this.stopped = true;
  }
}

/**
 * Serves nothing until it is told to, and models the one thing about
 * `FfmpegDecoder` that matters here: **stopping it does not answer the read**.
 *
 * Killing the process wakes the waiter, which then finds neither samples nor an
 * end and waits again; the answer — `null`, indistinguishable from the file
 * running out — arrives only when the child's `close` event does, which is
 * whenever the operating system gets round to it. So the read outlives the call
 * that abandoned it, which is the whole of the race.
 */
class BlockingDecoder implements Decoder {
  stopped = false;
  private waiting: ((frame: Int16Array | null) => void) | null = null;

  constructor(
    readonly fromMs: number,
    private samplesPerFrame = 0
  ) {}

  read(samples: number): Promise<Int16Array | null> {
    this.samplesPerFrame = samples;
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  /** Answers the read that is waiting, with a frame of this value. */
  deliver(value: number): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.(new Int16Array(this.samplesPerFrame).fill(value));
  }

  /** The dead process's `close` event, arriving after whoever killed it left. */
  end(): void {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.(null);
  }

  async stop() {
    this.stopped = true;
  }
}

class RecordingSink implements FrameSink {
  readonly frames: Int16Array[] = [];
  closed = false;

  async capture(samples: Int16Array) {
    this.frames.push(Int16Array.from(samples));
  }

  async close() {
    this.closed = true;
  }
}

class RecordingEncoder implements StemEncoder {
  readonly written: Int16Array[] = [];
  finished = false;

  write(samples: Int16Array) {
    this.written.push(Int16Array.from(samples));
  }

  async finish() {
    this.finished = true;
  }
}

function samplesOf(chunks: Int16Array[]): number {
  return chunks.reduce((total, chunk) => total + chunk.length, 0);
}

function build(options: { volume?: number; frames?: number; value?: number } = {}) {
  const sink = new RecordingSink();
  const opened: ConstantDecoder[] = [];
  const pump = new PlaybackPump({
    sink,
    volume: options.volume,
    openDecoder: (_file, fromMs) => {
      const decoder = new ConstantDecoder(
        fromMs,
        options.value ?? 1000,
        options.frames
      );
      opened.push(decoder);
      return decoder;
    },
  });
  return { pump, sink, opened };
}

async function pump(times: number, p: PlaybackPump) {
  for (let i = 0; i < times; i += 1) await p.pumpOnce();
}

/**
 * The bug that made the first version choppy: the loop was paced on
 * `AudioSource.captureFrame` resolving when the audio played out. It does not
 * — it resolves when the FFI accepts the buffer — so the pump ran as fast as
 * ffmpeg could decode and overran the native queue.
 *
 * These pin the pacing to the clock, with a fake one so they cost no real time.
 */
describe('pacing', () => {
  function paced(frames: number) {
    const sink = new RecordingSink();
    let clock = 0;
    let clockAtTarget = -1;
    const slept: number[] = [];
    let reached!: () => void;
    const target = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const p = new PlaybackPump({
      sink,
      volume: 1,
      openDecoder: (_f, from) => new ConstantDecoder(from),
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
        if (slept.length === frames) {
          clockAtTarget = clock;
          reached();
        }
      },
    });
    return { pump: p, sink, slept, target, elapsed: () => clockAtTarget };
  }

  /** Runs the real loop until it has paced `frames` frames, then stops it. */
  async function runFor(frames: number) {
    const h = paced(frames);
    await h.pump.setFile('track.mp3');
    await h.pump.play(0);
    h.pump.start();
    await h.target;
    await h.pump.close();
    return h;
  }

  it('waits a frame between frames instead of running flat out', async () => {
    const { slept } = await runFor(5);

    expect(slept.length).toBeGreaterThanOrEqual(5);
    // Every wait is one frame: the loop is not sprinting through the track.
    for (const ms of slept.slice(0, 5)) expect(ms).toBe(FRAME_MS);
  });

  it('produces a second of audio per second of clock, not per decode', async () => {
    const { sink, elapsed } = await runFor(100);

    // 100 frames of 10ms is one second of audio, and the clock had to advance
    // a second to deliver it. Real time, not decode speed — the decoder here
    // would happily have supplied all of it at once.
    expect(elapsed()).toBe(100 * FRAME_MS);
    expect(sink.frames.length).toBeGreaterThanOrEqual(100);
  });
});

/**
 * The heartbeat, which is the only thing about this pump that anybody outside
 * it can measure. Everything else about shared playback is committed state, and
 * committed state goes on describing a channel that stopped being audible.
 */
describe('the heartbeat', () => {
  it('advances with every frame that reaches the room', async () => {
    const sink = new RecordingSink();
    let clock = 1_000;
    const p = new PlaybackPump({
      sink,
      openDecoder: (_f, from) => new ConstantDecoder(from),
      now: () => clock,
    });
    p.start();
    // Nothing has been produced yet, so the stamp is the moment it started —
    // a pump that never produces a frame is stale from the off rather than
    // permanently new.
    expect(p.producedAt()).toBe(1_000);

    clock = 5_000;
    await p.pumpOnce();
    expect(p.producedAt()).toBe(5_000);

    await p.close();
  });

  it('stops advancing when the sink stops taking frames', async () => {
    const pending: { release?: () => void } = {};
    const wedged: FrameSink = {
      capture: () =>
        new Promise<void>((resolve) => {
          pending.release = resolve;
        }),
      close: async () => {},
    };
    let clock = 1_000;
    const p = new PlaybackPump({
      sink: wedged,
      openDecoder: (_f, from) => new ConstantDecoder(from),
      now: () => clock,
    });
    p.start();
    clock = 9_000;
    await new Promise((r) => setTimeout(r, 10));

    // The loop is inside a capture that will never return — which is what a
    // media library that has lost its answer looks like, and what nothing in
    // this system could see until this stamp existed.
    expect(p.producedAt()).toBe(1_000);

    // And closing it still finishes, or the rebuild that a stall triggers
    // would be blocked by the very pump it is replacing.
    await p.close();
    // Only so this test leaves nothing pending behind it; the pump has already
    // stopped caring what this frame's answer was.
    pending.release?.();
  }, 2_000);
});

describe('producing frames', () => {
  it('publishes silence when nothing is playing, rather than nothing at all', async () => {
    const { pump: p, sink } = build();
    await p.setFile('track.mp3');
    await pump(5, p);

    expect(sink.frames).toHaveLength(5);
    for (const frame of sink.frames) {
      expect(frame).toHaveLength(SAMPLES_PER_FRAME);
      expect(frame.every((s) => s === 0)).toBe(true);
    }
  });

  it('publishes decoded audio while playing', async () => {
    const { pump: p, sink } = build({ volume: 1 });
    await p.setFile('track.mp3');
    await p.play(0);
    await pump(3, p);

    expect(sink.frames).toHaveLength(3);
    expect(sink.frames.every((f) => f.every((s) => s === 1000))).toBe(true);
  });

  it('falls back to silence when the file runs out', async () => {
    const { pump: p, sink } = build({ volume: 1, frames: 2 });
    await p.setFile('track.mp3');
    await p.play(0);
    await pump(4, p);

    expect(sink.frames[0].every((s) => s === 1000)).toBe(true);
    expect(sink.frames[1].every((s) => s === 1000)).toBe(true);
    expect(sink.frames[3].every((s) => s === 0)).toBe(true);
  });
});

describe('seeking and resuming', () => {
  it('opens the decoder at the position asked for', async () => {
    const { pump: p, opened } = build();
    await p.setFile('track.mp3');
    await p.play(90_000);

    expect(opened).toHaveLength(1);
    expect(opened[0].fromMs).toBe(90_000);
  });

  it('re-opens at the new position and abandons the old decoder', async () => {
    const { pump: p, opened } = build();
    await p.setFile('track.mp3');
    await p.play(0);
    await pump(2, p);
    await p.play(120_000);

    expect(opened.map((d) => d.fromMs)).toEqual([0, 120_000]);
    expect(opened[0].stopped).toBe(true);
    expect(opened[1].stopped).toBe(false);
  });

  it('stops decoding on pause and resumes from where it is told', async () => {
    const { pump: p, opened } = build();
    await p.setFile('track.mp3');
    await p.play(0);
    await p.pause();
    expect(opened[0].stopped).toBe(true);

    await p.play(30_000);
    expect(opened).toHaveLength(2);
    expect(opened[1].fromMs).toBe(30_000);
  });

  /**
   * The seek that arrives while the pump is waiting for samples.
   *
   * Stopping a decoder wakes the read that is waiting on it, and a killed
   * ffmpeg answers `null` — which is the same word the pump uses for "the file
   * ran out". Read as the second thing, it stops the decoder that was opened a
   * moment ago and leaves `playing` false: a channel publishing silence for the
   * rest of its life, with the transport running on every screen. TASKS §
   * *Stepping Back In*.
   */
  it('ignores a read answered by a decoder that has since been replaced', async () => {
    const sink = new RecordingSink();
    const opened: BlockingDecoder[] = [];
    const p = new PlaybackPump({
      sink,
      volume: 1,
      openDecoder: (_file, fromMs) => {
        const decoder = new BlockingDecoder(fromMs);
        opened.push(decoder);
        return decoder;
      },
    });
    await p.setFile('track.mp3');
    await p.play(0);

    // A frame is in flight, waiting on the first decoder, when the seek lands.
    const inFlight = p.pumpOnce();
    await p.play(30_000);
    // And the decoder the seek abandoned ends a moment later, as a killed
    // ffmpeg does.
    opened[0].end();
    await inFlight;

    expect(opened).toHaveLength(2);
    // The frame that was in flight is silence — it has no samples to carry —
    // but the seek that overtook it is still playing.
    const next = p.pumpOnce();
    opened[1].deliver(1000);
    await next;

    expect(sink.frames).toHaveLength(2);
    expect(sink.frames[1].every((s) => s === 1000)).toBe(true);
    expect(opened[1].stopped).toBe(false);
  });

  it('changes file without disturbing anything else', async () => {
    const { pump: p, sink } = build();
    const encoder = new RecordingEncoder();
    await p.setFile('first.mp3');
    p.startCapture(encoder, 0);
    await p.play(0);
    await pump(2, p);

    await p.setFile('second.mp3');
    await pump(2, p);

    // The stem is one continuous thing across the swap, which is what keeps it
    // lined up with the speakers' stems.
    expect(encoder.finished).toBe(false);
    expect(samplesOf(encoder.written)).toBe(samplesOf(sink.frames));
  });
});

describe('volume', () => {
  it('scales the samples that are published', async () => {
    const { pump: p, sink } = build({ volume: 0.5, value: 1000 });
    await p.setFile('track.mp3');
    await p.play(0);
    await pump(1, p);

    expect(sink.frames[0][0]).toBe(500);
  });

  it('takes effect on the next frame without re-opening the decoder', async () => {
    const { pump: p, sink, opened } = build({ volume: 1, value: 1000 });
    await p.setFile('track.mp3');
    await p.play(0);
    await pump(1, p);

    p.setVolume(0.25);
    await pump(1, p);

    expect(sink.frames[0][0]).toBe(1000);
    expect(sink.frames[1][0]).toBe(250);
    // A respawn here would drop frames and stumble audibly.
    expect(opened).toHaveLength(1);
  });

  it('silences without stopping when set to zero', async () => {
    const { pump: p, sink } = build({ volume: 0, value: 1000 });
    await p.setFile('track.mp3');
    await p.play(0);
    await pump(2, p);

    expect(sink.frames).toHaveLength(2);
    expect(sink.frames.every((f) => f.every((s) => s === 0))).toBe(true);
  });
});

describe('the recorded stem', () => {
  it('receives exactly what the room received', async () => {
    const { pump: p, sink } = build({ volume: 0.5 });
    const encoder = new RecordingEncoder();
    await p.setFile('track.mp3');
    p.startCapture(encoder, 0);
    await p.play(0);
    await pump(3, p);

    expect(encoder.written).toEqual(sink.frames);
  });

  it('records a pause as silence of its real length, not as nothing', async () => {
    const { pump: p } = build({ volume: 1 });
    const encoder = new RecordingEncoder();
    await p.setFile('track.mp3');
    p.startCapture(encoder, 0);

    await p.play(0);
    await pump(2, p);
    await p.pause();
    await pump(5, p);

    // Seven frames occupy seven frames of the recording, however few of them
    // had sound in them — that is what keeps the stem in step.
    expect(samplesOf(encoder.written)).toBe(7 * SAMPLES_PER_FRAME);
    expect(encoder.written[2].every((s) => s === 0)).toBe(true);
  });

  it('prepends silence for a track loaded partway through a recording', async () => {
    const { pump: p } = build({ volume: 1 });
    const encoder = new RecordingEncoder();
    await p.setFile('track.mp3');

    p.startCapture(encoder, 4_500);
    await p.play(0);
    await pump(2, p);

    expect(encoder.written[0]).toHaveLength(msToSamples(4_500));
    expect(encoder.written[0].every((s) => s === 0)).toBe(true);
    expect(samplesOf(encoder.written)).toBe(
      msToSamples(4_500) + 2 * SAMPLES_PER_FRAME
    );
  });

  it('prepends nothing when capture and the run begin together', async () => {
    const { pump: p } = build({ volume: 1 });
    const encoder = new RecordingEncoder();
    await p.setFile('track.mp3');

    p.startCapture(encoder, 0);
    await p.play(0);
    await pump(2, p);

    expect(samplesOf(encoder.written)).toBe(2 * SAMPLES_PER_FRAME);
  });

  it('keeps publishing after capture stops', async () => {
    const { pump: p, sink } = build({ volume: 1 });
    const encoder = new RecordingEncoder();
    await p.setFile('track.mp3');
    p.startCapture(encoder, 0);
    await p.play(0);
    await pump(2, p);
    await p.stopCapture();
    await pump(3, p);

    expect(encoder.finished).toBe(true);
    expect(samplesOf(encoder.written)).toBe(2 * SAMPLES_PER_FRAME);
    expect(sink.frames).toHaveLength(5);
  });
});

/**
 * The real decoder against real ffmpeg output.
 *
 * Everything above runs on fakes, which is right for the arithmetic but means
 * the chunk splicing here — reassembling frames across the boundaries a pipe
 * happens to deliver — is otherwise never exercised. It is also the code that
 * had to be rewritten to stop the whole track accumulating in memory, so it is
 * exactly the code most worth pinning down.
 */
describe('FfmpegDecoder against a real file', () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'thefloor-decode-'));
    file = join(dir, 'tone.wav');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', [
        '-v', 'error', '-f', 'lavfi',
        '-i', `sine=frequency=440:duration=1:sample_rate=${SAMPLE_RATE}`,
        '-ac', '1', '-y', file,
      ]);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
      );
    });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('delivers whole frames, then runs out exactly once', async () => {
    const decoder = new FfmpegDecoder(file, 0, 'ffmpeg');
    let frames = 0;
    let audible = 0;

    for (;;) {
      const got = await decoder.read(SAMPLES_PER_FRAME);
      if (got === null) break;
      expect(got).toHaveLength(SAMPLES_PER_FRAME);
      frames += 1;
      if (got.some((s) => s !== 0)) audible += 1;
      if (frames > 200) break;
    }

    // One second at 10ms a frame, allowing a frame either side for the tail.
    expect(frames).toBeGreaterThanOrEqual(99);
    expect(frames).toBeLessThanOrEqual(101);
    // A sine wave, so essentially all of it should carry signal — proof the
    // samples survived reassembly rather than arriving as zeros.
    expect(audible).toBeGreaterThan(95);
    await decoder.stop();
  });

  it('seeks, so a later start yields less audio', async () => {
    const decoder = new FfmpegDecoder(file, 600, 'ffmpeg');
    let frames = 0;
    for (;;) {
      const got = await decoder.read(SAMPLES_PER_FRAME);
      if (got === null) break;
      frames += 1;
      if (frames > 200) break;
    }
    // 600ms into a 1s file leaves roughly 400ms.
    expect(frames).toBeGreaterThan(30);
    expect(frames).toBeLessThan(50);
    await decoder.stop();
  });
});

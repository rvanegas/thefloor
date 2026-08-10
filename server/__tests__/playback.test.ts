import {
  PlaybackPump,
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

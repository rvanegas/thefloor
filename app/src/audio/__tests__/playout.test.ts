import {
  initialPlayoutWatch,
  initialPlayoutWatches,
  onPlayoutReadings,
  onPlayoutSample,
  PLAYOUT_FREEZE_MS,
} from '../playout';

/**
 * The client's answer to "is any of this being rendered", which until 2026-08-24
 * nothing could ask without stopping the audio to find out.
 *
 * What is pinned here is mostly about *restraint*: it reports transitions and
 * not readings, it says nothing at all when it could not measure, and it says a
 * freeze once. The log is a shared ring of two hundred lines and this is the
 * only thing in it that runs on a timer — a version that wrote a line per poll
 * would push the connect and the subscribe that give a freeze its meaning out
 * of the log before anybody could copy it.
 */

const t0 = 1_000_000;

/** A watch that has already seen one reading, which is where the rules start. */
function watching(samples = 100, at = t0) {
  return onPlayoutSample(initialPlayoutWatch(at), samples, at).next;
}

it('says nothing about the first reading, having nothing to compare it to', () => {
  const { event, next } = onPlayoutSample(initialPlayoutWatch(t0), 100, t0);

  expect(event).toBeNull();
  expect(next.samples).toBe(100);
});

it('stays quiet while the count advances, however long for', () => {
  let watch = watching();
  for (let i = 1; i <= 20; i += 1) {
    const step = onPlayoutSample(watch, 100 + i, t0 + i * 2_000);
    expect(step.event).toBeNull();
    watch = step.next;
  }
});

it('reports a freeze once it has stood still long enough to be a fact', () => {
  const watch = watching();

  // Not yet: a poll landing either side of a stutter is not a finding.
  const early = onPlayoutSample(watch, 100, t0 + PLAYOUT_FREEZE_MS - 1);
  expect(early.event).toBeNull();

  const late = onPlayoutSample(early.next, 100, t0 + PLAYOUT_FREEZE_MS);
  expect(late.event).toContain('playout frozen');
  expect(late.event).toContain('subscribed, rendering nothing');
});

it('reports the freeze once, not once per poll', () => {
  let watch = watching();
  const events: string[] = [];
  for (let i = 1; i <= 10; i += 1) {
    const step = onPlayoutSample(watch, 100, t0 + i * PLAYOUT_FREEZE_MS);
    if (step.event) events.push(step.event);
    watch = step.next;
  }

  expect(events).toHaveLength(1);
});

it('reports the recovery, with how long the silence lasted', () => {
  const frozen = onPlayoutSample(watching(), 100, t0 + PLAYOUT_FREEZE_MS);
  expect(frozen.event).toContain('frozen');

  const back = onPlayoutSample(frozen.next, 101, t0 + 12_000);
  expect(back.event).toBe('playout resumed after 12s');
});

it('says nothing on a recovery it never reported a freeze for', () => {
  const brief = onPlayoutSample(watching(), 100, t0 + 1_000);
  const back = onPlayoutSample(brief.next, 101, t0 + 2_000);

  expect(brief.event).toBeNull();
  expect(back.event).toBeNull();
});

/**
 * The distinction the whole of `diagnostics.ts` is written around: an absence
 * of measurement must never render as a measurement of absence. A reading that
 * could not be taken — no track, statistics unavailable — has to leave the
 * clock alone, or a channel with nothing subscribed would report a freeze
 * every five seconds and the real one would be lost among them.
 */
it('lets an unreadable poll neither advance nor freeze anything', () => {
  const watch = watching();
  const missing = onPlayoutSample(watch, null, t0 + 60_000);

  expect(missing.event).toBeNull();
  expect(missing.next).toBe(watch);

  // And the clock it was holding is intact: a freeze is still dated from the
  // last time the count actually moved, not from the gap in measurement.
  const after = onPlayoutSample(missing.next, 100, t0 + PLAYOUT_FREEZE_MS);
  expect(after.event).toContain('playout frozen');
});

/**
 * Per-track clocking, which is the correction of 2026-08-25.
 *
 * The summed version could not see a frozen track beside a healthy one, and the
 * fault has only ever been reported when alone — so the instrument agreed with
 * the symptom by construction, and "it does not happen when somebody else is in
 * the channel" was in part a statement about the detector rather than about the
 * audio.
 */
describe('one clock per track', () => {
  const media = { key: 'TR_media', label: 'media:chan_x' };
  const person = { key: 'TR_person', label: 'acct_y' };

  /** Both tracks read once, which is where the rules start for each of them. */
  function started(at = t0) {
    return onPlayoutReadings(
      initialPlayoutWatches(),
      [
        { ...media, samples: 100 },
        { ...person, samples: 100 },
      ],
      at
    ).next;
  }

  it('reports a frozen track beside one that is advancing', () => {
    const { events } = onPlayoutReadings(
      started(),
      [
        { ...media, samples: 100 },
        { ...person, samples: 500 },
      ],
      t0 + PLAYOUT_FREEZE_MS
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toContain('frozen');
    expect(events[0]).toContain('media:chan_x');
  });

  it('names the track in the recovery too, so the pair can be read together', () => {
    const frozen = onPlayoutReadings(
      started(),
      [{ ...media, samples: 100 }],
      t0 + PLAYOUT_FREEZE_MS
    );
    expect(frozen.events[0]).toContain('frozen');

    const back = onPlayoutReadings(
      frozen.next,
      [{ ...media, samples: 101 }],
      t0 + 12_000
    );
    expect(back.events).toEqual(['playout resumed after 12s — media:chan_x']);
  });

  /**
   * The observation this used to delete. A person arriving or leaving restarted
   * the single watch, clearing `reported`, so a track that resumed logged
   * nothing — and the missing `playout resumed` line was then read as the
   * freeze having persisted.
   */
  it('keeps a frozen track reported across another track arriving', () => {
    const frozen = onPlayoutReadings(
      started(),
      [{ ...media, samples: 100 }],
      t0 + PLAYOUT_FREEZE_MS
    );

    const joined = onPlayoutReadings(
      frozen.next,
      [
        { ...media, samples: 100 },
        { ...person, samples: 900 },
      ],
      t0 + 10_000
    );
    expect(joined.events).toEqual([]);

    const back = onPlayoutReadings(
      joined.next,
      [
        { ...media, samples: 101 },
        { ...person, samples: 901 },
      ],
      t0 + 14_000
    );
    expect(back.events).toEqual(['playout resumed after 14s — media:chan_x']);
  });

  /**
   * Keyed by sid rather than by identity, because the count belongs to the
   * receiver: a republished track starts again at zero, and under identity
   * keying that restart reads as a count which failed to advance — a freeze
   * reported for a track that is in fact healthy and new.
   */
  it('starts a fresh clock for a republished track rather than reading a freeze', () => {
    const running = onPlayoutReadings(
      started(),
      [{ ...media, samples: 5_000 }],
      t0 + 2_000
    );

    const republished = onPlayoutReadings(
      running.next,
      [{ key: 'TR_media2', label: 'media:chan_x', samples: 0 }],
      t0 + PLAYOUT_FREEZE_MS + 2_000
    );

    expect(republished.events).toEqual([]);
    expect(republished.next.TR_media).toBeUndefined();
    expect(republished.next.TR_media2.samples).toBe(0);
  });

  it('says nothing at all when nothing is subscribed', () => {
    const { next, events } = onPlayoutReadings(started(), [], t0 + 60_000);

    expect(events).toEqual([]);
    expect(next).toEqual({});
  });

  /**
   * A track that is present but unreadable is not a track that has gone: it
   * keeps its clock, so a gap in measurement neither reports a freeze nor
   * excuses one. Dropping is keyed on absence from the readings, which is the
   * distinction the single-watch version made with `null` and this one has to
   * make twice.
   */
  it('holds the clock of a present track it could not read', () => {
    const unreadable = onPlayoutReadings(
      started(),
      [{ ...media, samples: null }],
      t0 + 60_000
    );
    expect(unreadable.events).toEqual([]);

    const after = onPlayoutReadings(
      unreadable.next,
      [{ ...media, samples: 100 }],
      t0 + PLAYOUT_FREEZE_MS
    );
    expect(after.events[0]).toContain('frozen');
  });
});

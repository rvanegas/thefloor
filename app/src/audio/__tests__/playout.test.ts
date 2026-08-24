import {
  initialPlayoutWatch,
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

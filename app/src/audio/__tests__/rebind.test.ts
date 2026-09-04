import { REBIND_GAP_MS, rebindTracks } from '../rebind';

/**
 * The recovery that leaves the room standing.
 *
 * What is pinned here is mostly about *honesty of the report*. This exists to
 * be pressed while a track is frozen and to have its effect judged by ear
 * against the log line it writes, so the failure that would waste a day is one
 * where it says it acted and did not: a drop that threw, a publication it
 * could not really reach, or a retake landing on the same tick as the drop and
 * being coalesced into no change at all. Every test below is about one of
 * those, and only two are about the happy path.
 */

/** A publication that records what was asked of it, in order. */
function publication(trackSid: string) {
  const asked: boolean[] = [];
  return {
    trackSid,
    asked,
    setSubscribed(subscribed: boolean) {
      asked.push(subscribed);
    },
  };
}

/**
 * Typed to the sid alone, which is all this needs to build the map — and
 * deliberately not to `publication`'s shape, so that the fakes below which are
 * *missing* something can be handed to it without a cast. Those are the tests
 * that matter here: a cast in the one place a narrowing is being checked would
 * be the test agreeing with the code by construction.
 */
function room(...participants: Array<[string, Array<{ trackSid: string }>]>) {
  return {
    remoteParticipants: new Map(
      participants.map(([identity, publications]) => [
        identity,
        {
          identity,
          audioTrackPublications: new Map<string, unknown>(
            publications.map((p) => [p.trackSid, p])
          ),
        },
      ])
    ),
  };
}

/** Collects the scheduled retakes so a test can decide when they run. */
function scheduler() {
  const pending: Array<{ run: () => void; ms: number }> = [];
  return {
    pending,
    schedule: (run: () => void, ms: number) => {
      pending.push({ run, ms });
    },
    flush() {
      for (const { run } of pending.splice(0)) run();
    },
  };
}

it('drops the subscription and takes it back after the gap, not before', () => {
  const media = publication('TR_media');
  const clock = scheduler();

  rebindTracks(room(['media:chan_x', [media]]), null, clock.schedule);

  // The whole point of the gap: two updates on one tick are two the SFU may
  // coalesce, and a rebind that quietly did nothing would still be logged.
  expect(media.asked).toEqual([false]);
  expect(clock.pending).toHaveLength(1);
  expect(clock.pending[0].ms).toBe(REBIND_GAP_MS);

  clock.flush();
  expect(media.asked).toEqual([false, true]);
});

it('names each track it acted on by identity and sid', () => {
  const media = publication('TR_media');
  const clock = scheduler();

  const acted = rebindTracks(room(['media:chan_x', [media]]), null, clock.schedule);

  expect(acted).toEqual(['media:chan_x (TR_media)']);
});

it('rebinds only the tracks named, leaving the rest subscribed', () => {
  const media = publication('TR_media');
  const person = publication('TR_person');
  const clock = scheduler();

  const acted = rebindTracks(
    room(['media:chan_x', [media]], ['acct_y', [person]]),
    new Set(['TR_media']),
    clock.schedule
  );
  clock.flush();

  expect(acted).toEqual(['media:chan_x (TR_media)']);
  expect(media.asked).toEqual([false, true]);
  expect(person.asked).toEqual([]);
});

it('takes every remote audio track when no sid is named', () => {
  const media = publication('TR_media');
  const person = publication('TR_person');
  const clock = scheduler();

  const acted = rebindTracks(
    room(['media:chan_x', [media]], ['acct_y', [person]]),
    null,
    clock.schedule
  );

  expect(acted).toHaveLength(2);
});

it('says nothing about a room that has gone', () => {
  expect(rebindTracks(null, null)).toEqual([]);
});

/**
 * The publication type admits a local track even though a remote participant
 * cannot hold one, so this is narrowed rather than cast. A cast would survive
 * an SDK rename by calling nothing and reporting success.
 */
it('ignores anything that is not a subscribable publication', () => {
  const clock = scheduler();
  const odd = { trackSid: 'TR_odd' };

  const acted = rebindTracks(room(['acct_y', [odd]]), null, clock.schedule);

  expect(acted).toEqual([]);
  expect(clock.pending).toHaveLength(0);
});

it('does not report a track whose drop threw, and carries on to the next', () => {
  const angry = {
    trackSid: 'TR_angry',
    asked: [] as boolean[],
    setSubscribed() {
      throw new Error('gone');
    },
  };
  const media = publication('TR_media');
  const clock = scheduler();

  const acted = rebindTracks(
    room(['acct_y', [angry]], ['media:chan_x', [media]]),
    null,
    clock.schedule
  );
  clock.flush();

  expect(acted).toEqual(['media:chan_x (TR_media)']);
  expect(media.asked).toEqual([false, true]);
});

/**
 * Called from a poll and from a button, and in both cases a room torn down
 * between the drop and the retake is ordinary. Throwing out of the scheduled
 * half would escape into a timer, where nothing is holding a catch.
 */
it('swallows a retake that arrives after the room has gone', () => {
  const vanishing = {
    trackSid: 'TR_vanishing',
    calls: 0,
    setSubscribed(subscribed: boolean) {
      this.calls += 1;
      if (subscribed) throw new Error('gone');
    },
  };
  const clock = scheduler();

  rebindTracks(room(['media:chan_x', [vanishing]]), null, clock.schedule);

  expect(() => clock.flush()).not.toThrow();
  expect(vanishing.calls).toBe(2);
});

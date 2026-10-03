import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { CHIME_TAIL_MS, HANDOVER_MS, useFilmHandover } from '../useFilmHandover';

/**
 * The microphone is held for the length of the play chime, so the chime is
 * heard.
 *
 * A chime is an `AVAudioPlayer` playing into the session this app holds, and a
 * film starting takes that session from `playAndRecord` to `playback`. This
 * hook is the ordering that keeps the sound and the session in the right
 * order: the release waits for the chime, where on the pause edge the chime
 * waits for the session. See `useWatchChime` for the other half.
 */
function mount(screening: boolean) {
  const seen: boolean[] = [];
  function Probe({ on }: { on: boolean }) {
    seen.push(useFilmHandover(on));
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe on={screening} />);
  });
  return {
    get holding() {
      return seen[seen.length - 1];
    },
    update(next: boolean) {
      act(() => {
        tree.update(<Probe on={next} />);
      });
    },
    unmount: () => act(() => tree.unmount()),
  };
}

describe('useFilmHandover', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is the length of the play chime and its tail', () => {
    // Derived rather than chosen, which is the rule `CHIME_STALE_MS` states:
    // two notes at 90ms each. Retuning the chime moves this with it. The tail
    // is `play()` not being the sound leaving the speaker, since 2026-10-02.
    expect(HANDOVER_MS).toBeCloseTo(180 + CHIME_TAIL_MS);
  });

  it('holds the microphone when a film starts, and lets it go', () => {
    const probe = mount(false);
    expect(probe.holding).toBe(false);

    probe.update(true);
    expect(probe.holding).toBe(true);

    act(() => void jest.advanceTimersByTime(HANDOVER_MS - 1));
    expect(probe.holding).toBe(true);

    act(() => void jest.advanceTimersByTime(2));
    expect(probe.holding).toBe(false);
  });

  /**
   * **Held from the render the film starts in, not the one after.** The hold
   * was set in an effect, so the render where `screening` turned true still
   * answered `false` — and `App.tsx` computes `micNeeded` from that render, so
   * every Play released the session, retook it when the effect ran, and
   * released it again 180ms later. Three category changes where there should
   * be one, and the retake's asynchronous capture finishing after the second
   * release dragged the session back to `playAndRecord` under the film. Seen
   * on every press from build 309, which is the build this hook arrived in.
   * The test above only read the value after effects had run, so it could not
   * see the render that did the damage.
   */
  it('never answers false between the edge and the end of the hold', () => {
    const seen: boolean[] = [];
    function Probe({ on }: { on: boolean }) {
      seen.push(useFilmHandover(on));
      return null;
    }
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe on={false} />);
    });
    const before = seen.length;
    act(() => {
      tree.update(<Probe on={true} />);
    });
    expect(seen.slice(before)).not.toContain(false);
    act(() => void jest.advanceTimersByTime(HANDOVER_MS + 1));
    expect(seen[seen.length - 1]).toBe(false);
    act(() => tree.unmount());
  });

  /**
   * **A film already running when this mounts is not a film that started.**
   * The chime hooks take it as read on the same reasoning — announcing it
   * would be reporting the past — so there is no sound to protect and no
   * reason to hold anything.
   */
  it('says nothing about a film that was already running when you looked', () => {
    const probe = mount(true);
    expect(probe.holding).toBe(false);
    act(() => void jest.advanceTimersByTime(HANDOVER_MS * 2));
    expect(probe.holding).toBe(false);
  });

  it('does not hold when the film stops', () => {
    const probe = mount(false);
    probe.update(true);
    act(() => void jest.advanceTimersByTime(HANDOVER_MS * 2));

    probe.update(false);
    expect(probe.holding).toBe(false);
  });

  it('holds again on the next run', () => {
    const probe = mount(false);
    probe.update(true);
    act(() => void jest.advanceTimersByTime(HANDOVER_MS * 2));
    probe.update(false);

    probe.update(true);
    expect(probe.holding).toBe(true);
  });

  /**
   * Unmounting mid-hold is leaving the channel. A microphone held open by a
   * timer nobody owns any more would be held for ever, which is the one way
   * this could cost something rather than merely fail to buy it.
   */
  it('lets the microphone go when the channel is left mid-hold', () => {
    const probe = mount(false);
    probe.update(true);
    expect(probe.holding).toBe(true);
    expect(() => {
      probe.unmount();
      act(() => void jest.advanceTimersByTime(HANDOVER_MS * 2));
    }).not.toThrow();
  });
});

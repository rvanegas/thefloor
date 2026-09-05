import {
  MAX_REASSERTS,
  NO_RECOVERY,
  onReceiver,
  onRouteObserved,
  type RecoveryState,
} from '../routeRecovery';

/** As `AudioRouteModule.describe` prints them: port type, then name. */
const RECEIVER = ['Receiver(Receiver)'];
const SPEAKER = ['Speaker(Speaker)'];
const AIRPLAY = ['AirPlay(millikan)'];
const AIRPODS = ['BluetoothA2DP(AirPods Pro)'];

describe('reading the earpiece off a route', () => {
  it('finds it by port type, not by name', () => {
    expect(onReceiver(RECEIVER)).toBe(true);
    expect(onReceiver(SPEAKER)).toBe(false);
    expect(onReceiver(AIRPLAY)).toBe(false);
    expect(onReceiver(AIRPODS)).toBe(false);
  });

  // `Speaker` is a prefix of nothing and a substring of nothing here, but a
  // careless `includes` would match a device somebody had named "Receiver",
  // which is exactly the kind of thing a person calls a speaker in a hallway.
  it('does not match a device merely named after it', () => {
    expect(onReceiver(['AirPlay(Receiver)'])).toBe(false);
  });

  it('reads no outputs as not the earpiece', () => {
    expect(onReceiver([])).toBe(false);
  });
});

describe('a route that has fallen to the earpiece', () => {
  it('re-asserts the call configuration', () => {
    const step = onRouteObserved(NO_RECOVERY, RECEIVER, true);
    expect(step.reassert).toBe(true);
    expect(step.next.attempts).toBe(1);
    expect(step.event).toMatch(/re-asserting/);
  });

  /**
   * The bound is a requirement rather than caution: re-applying the
   * configuration is itself a category change, which is a route change, so an
   * unbounded rule would re-assert against a stuck route for the life of the
   * channel.
   */
  it('stops after a fixed number of attempts', () => {
    let state: RecoveryState = NO_RECOVERY;
    for (let i = 0; i < MAX_REASSERTS; i += 1) {
      const step = onRouteObserved(state, RECEIVER, true);
      expect(step.reassert).toBe(true);
      state = step.next;
    }
    const giveUp = onRouteObserved(state, RECEIVER, true);
    expect(giveUp.reassert).toBe(false);
    expect(giveUp.event).toMatch(/stuck on receiver/);
  });

  it('says it has given up exactly once', () => {
    let state: RecoveryState = NO_RECOVERY;
    for (let i = 0; i < MAX_REASSERTS; i += 1) {
      state = onRouteObserved(state, RECEIVER, true).next;
    }
    state = onRouteObserved(state, RECEIVER, true).next;
    const after = onRouteObserved(state, RECEIVER, true);
    expect(after.reassert).toBe(false);
    expect(after.event).toBeNull();
  });

  /**
   * The reset is what makes the state per-episode rather than per-connection:
   * a phone that recovers and later falls to the earpiece again gets the same
   * two attempts, rather than having spent them an hour ago.
   */
  it('starts over once the route is somewhere sensible again', () => {
    let state: RecoveryState = NO_RECOVERY;
    state = onRouteObserved(state, RECEIVER, true).next;
    state = onRouteObserved(state, SPEAKER, true).next;
    expect(state).toEqual(NO_RECOVERY);
    expect(onRouteObserved(state, RECEIVER, true).reassert).toBe(true);
  });
});

describe('a route this rule has no business touching', () => {
  /**
   * The receiver is only ever an eligible output under `playAndRecord`, so in a
   * channel with nothing to hear — session `IDLE`, category `playback` — there
   * is nothing here to correct. Writing the session anyway
   * would make this a second owner of a configuration the hook above already
   * owns, which is the contention `useSessionAudio` is explicit about avoiding.
   */
  it('does nothing when the session is not a call', () => {
    const step = onRouteObserved(NO_RECOVERY, RECEIVER, false);
    expect(step.reassert).toBe(false);
    expect(step.event).toBeNull();
    expect(step.next).toEqual(NO_RECOVERY);
  });

  it('does nothing when the route is already the loudspeaker', () => {
    const step = onRouteObserved(NO_RECOVERY, SPEAKER, true);
    expect(step.reassert).toBe(false);
    expect(step.event).toBeNull();
  });

  // The 2026-09-03 excursion. An AirPlay device taking the route is iOS doing
  // as it was asked — `allowAirPlay` is in `CALL` — and is not a fault.
  it('leaves an AirPlay device alone', () => {
    expect(onRouteObserved(NO_RECOVERY, AIRPLAY, true).reassert).toBe(false);
  });

  // The option build 19 removed and 20 restored. Taking the route back off a
  // headset is the failure this fix must not reintroduce.
  it('leaves headphones alone', () => {
    expect(onRouteObserved(NO_RECOVERY, AIRPODS, true).reassert).toBe(false);
  });
});

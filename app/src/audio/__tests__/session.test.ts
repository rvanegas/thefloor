import { CALL, IDLE, LISTENING, policyFor, sessionFor } from '../session';

describe('sessionFor', () => {
  it('mixes while alone with nothing to hear', () => {
    expect(sessionFor(false, 0)).toBe(IDLE);
  });

  /**
   * **Build 90 gave this up deliberately, and the test says so rather than
   * disappearing.**
   *
   * `LISTENING` existed so shared playback interrupted another app instead of
   * mixing with it. Applying it meant writing the audio session at the moment a
   * track subscribed — which is the moment WebRTC's engine starts, and the two
   * interfere: with the write first nothing was ever audible, with the engine
   * first a fraction of a second was heard before it stopped. So the closed
   * case is now one configuration and the only category write left is at the
   * microphone boundary.
   *
   * Kept as an assertion of the *new* rule because a deleted test would leave
   * the trade invisible: what is given up here is a feature, not an internal.
   * See `EXCLUSIVE_WHEN_AUDIBLE`.
   */
  it('stays mixing when something is audible, which build 90 chose', () => {
    expect(sessionFor(false, 1)).toBe(IDLE);
    expect(sessionFor(false, 4)).toBe(IDLE);
  });

  it('is a call whenever the microphone is open', () => {
    // Including alone, which is the solo-recording case: the microphone is
    // open with nobody there and the session still has to be a call.
    expect(sessionFor(true, 0)).toBe(CALL);
    expect(sessionFor(true, 2)).toBe(CALL);
  });
});

describe('the configurations themselves', () => {
  // The point of the whole feature, stated where it fails loudly: an option
  // added back to either exclusive state silently un-pauses everybody's music.
  it('mixes in exactly one state', () => {
    expect(IDLE.audioCategoryOptions).toContain('mixWithOthers');
    expect(LISTENING.audioCategoryOptions).not.toContain('mixWithOthers');
    expect(CALL.audioCategoryOptions).not.toContain('mixWithOthers');
  });

  it('captures in exactly one state', () => {
    expect(IDLE.audioCategory).toBe('playback');
    expect(LISTENING.audioCategory).toBe('playback');
    expect(CALL.audioCategory).toBe('playAndRecord');
  });

  // `videoChat` is what turns on the system echo canceller, and a capturing
  // session without it is the build 17 echo. See planning/POSTMORTEM-echo.md.
  it('captures under the voice mode, and offers every route that can capture', () => {
    expect(CALL.audioMode).toBe('videoChat');
    expect(CALL.audioCategoryOptions).toEqual(
      expect.arrayContaining([
        'allowBluetooth',
        'allowAirPlay',
        'defaultToSpeaker',
      ])
    );
  });

  // The absence is the assertion. A2DP is output-only, so listing it here
  // makes a Bluetooth speaker with no microphone an eligible output while
  // capturing — iOS keeps the far end on that speaker and takes the input from
  // the built-in microphone, which is a loudspeaker playing into a live mic in
  // one room. Reported 2026-08-21. `arrayContaining` above cannot catch this,
  // which is why it is its own test rather than a fourth line in that list.
  it('offers no output that cannot also capture', () => {
    expect(CALL.audioCategoryOptions).not.toContain('allowBluetoothA2DP');
  });

  // And the scoping half: A2DP is not lost, it is confined to the states that
  // are not capturing, where the `playback` category makes a Bluetooth device
  // eligible with no option at all. So the stereo route is exactly as
  // available as it was whenever nobody is talking.
  it('keeps the non-capturing states on a category that needs no option', () => {
    expect(IDLE.audioCategory).toBe('playback');
    expect(LISTENING.audioCategory).toBe('playback');
    expect(IDLE.audioCategoryOptions).not.toContain('allowBluetoothA2DP');
    expect(LISTENING.audioCategoryOptions).not.toContain('allowBluetoothA2DP');
  });
});

describe('policyFor', () => {
  // Every combination the two arguments can take. The point of the whole fix
  // is that there is no input on which the observer is told something other
  // than what we would apply ourselves, so this is exhaustive on purpose
  // rather than a sample: a licensed exception is precisely what went wrong.
  const inputs: [boolean, number][] = [
    [false, 0],
    [false, 1],
    [false, 7],
    [true, 0],
    [true, 1],
    [true, 7],
  ];

  it.each(inputs)(
    'tells the observer what we would apply (anyMicOpen=%s, audible=%s)',
    (anyMicOpen, othersAudible) => {
      expect(policyFor(anyMicOpen, othersAudible).playout).toBe(
        sessionFor(anyMicOpen, othersAudible)
      );
    }
  );

  // Not a special case: the observer reads `recording` only while this device
  // is capturing, and our capturing implies `anyMicOpen`, for which
  // `sessionFor` returns CALL anyway.
  it.each(inputs)(
    'records as a call (anyMicOpen=%s, audible=%s)',
    (anyMicOpen, othersAudible) => {
      expect(policyFor(anyMicOpen, othersAudible).recording).toBe(CALL);
    }
  );

  // The bug, stated as the case that reported it: self-muted while the other
  // person is still talking. `anyMicOpen` stays true, so the value the
  // observer applies when the engine drops to playout-only is the call — the
  // category does not move, and neither does the Bluetooth profile.
  it('keeps the session a call across a self-mute with somebody talking', () => {
    expect(policyFor(true, 1).playout).toBe(CALL);
  });

  // And the case the old constant was chosen to protect, which now falls out
  // rather than being licensed: alone in an empty channel, an observer firing
  // on any transition writes the mixing value and nobody's music stops.
  it('mixes when nobody is capturing and there is nothing to hear', () => {
    expect(policyFor(false, 0).playout).toBe(IDLE);
  });

  // Between the two: nothing captured, something audible. Exclusive, but not a
  // call — the state that has no reason to hold a microphone open.
  it('hands the observer the same one answer for both closed cases', () => {
    // The invariant this file exists for: the observer and the app must write
    // the same thing. Collapsing the two closed states does not weaken it, it
    // removes one of the two things they could have disagreed about.
    expect(policyFor(false, 2).playout).toBe(IDLE);
    expect(policyFor(false, 0).playout).toBe(IDLE);
  });
});

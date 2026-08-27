import { CALL, IDLE, policyFor, sessionFor } from '../session';

describe('sessionFor', () => {
  /**
   * **One input since 2026-08-27, and its narrowness is what made a setting
   * possible.**
   *
   * It took two — whether anybody was capturing, and how much was audible —
   * and chose between three configurations. `LISTENING` had been unreachable
   * since build 90, so the second argument decided nothing, and what was left
   * was already a single boolean. Two rules now compute that boolean and the
   * `steadyHeadset` setting picks between them; this module is handed the
   * answer and does not know which asked the question.
   *
   * `anyMicrophoneOpen` and `channelHasAudio` in core/micNeeded.ts are the two,
   * and the argument between them lives there. This file is only about what the
   * two configurations are and that the second writer is told the same thing.
   */
  it('mixes when the rule says there is no audio', () => {
    expect(sessionFor(false)).toBe(IDLE);
  });

  it('is a call when it says there is', () => {
    expect(sessionFor(true)).toBe(CALL);
  });
});

describe('the configurations themselves', () => {
  // The point of the whole feature, stated where it fails loudly: an option
  // added to `CALL` silently un-pauses everybody's music, and one removed from
  // `IDLE` silently stops it.
  it('mixes in exactly one state', () => {
    expect(IDLE.audioCategoryOptions).toContain('mixWithOthers');
    expect(CALL.audioCategoryOptions).not.toContain('mixWithOthers');
  });

  it('captures in exactly one state', () => {
    expect(IDLE.audioCategory).toBe('playback');
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

  // And the scoping half: A2DP is not lost, it is confined to the one state
  // that is not capturing, where the `playback` category makes a Bluetooth
  // device eligible with no option at all. That state is now rarer than it
  // was, and deliberately so — it is for another app, not for us.
  it('keeps the mixing state on a category that needs no option', () => {
    expect(IDLE.audioCategory).toBe('playback');
    expect(IDLE.audioCategoryOptions).not.toContain('allowBluetoothA2DP');
  });
});

describe('policyFor', () => {
  // Both inputs the argument can take. The point of the whole fix is that
  // there is no input on which the observer is told something other than what
  // we would apply ourselves, so this is exhaustive rather than a sample: a
  // licensed exception is precisely what went wrong.
  it.each([[false], [true]])(
    'tells the observer what we would apply (hasAudio=%s)',
    (hasAudio) => {
      expect(policyFor(hasAudio).playout).toBe(sessionFor(hasAudio));
    }
  );

  /**
   * **`recording` is `CALL` unconditionally, and whether that is safe depends
   * on which rule computed the argument.**
   *
   * It rests on *the observer reads this only while this device is capturing,
   * and our capturing implies the session is a call* — which self-mute
   * falsifies under the default rule, `intentFor` holding the device open
   * while `anyMicrophoneOpen` excludes the self-muted. That is STATES.md
   * disagreement 11, still open, and the leading suspect in "The Foreground
   * Interruption". Under `steadyHeadset` it closes: the engine can only be
   * recording where `microphoneNeeded` was true, and every case that makes it
   * true — somebody else in the room, a recording running — makes
   * `channelHasAudio` true as well.
   *
   * This file cannot tell the two apart, taking a boolean rather than a
   * channel, which is why the assertion here is only that the value is
   * constant. `core/__tests__/micNeeded.test.ts` is where the difference is.
   */
  it.each([[false], [true]])('records as a call (hasAudio=%s)', (hasAudio) => {
    expect(policyFor(hasAudio).recording).toBe(CALL);
  });

  // The 2026-08-19 bug, stated as the case that reported it: self-muted while
  // the other person is still talking. They are in the room, so there is
  // audio, so the value the observer applies when the engine drops to
  // playout-only is the call — the category does not move, and neither does
  // the Bluetooth profile. It no longer needs a rule of its own to say so.
  it('keeps the session a call across a self-mute with somebody there', () => {
    expect(policyFor(true).playout).toBe(CALL);
  });

  // And the case the old constant was chosen to protect, which now falls out
  // rather than being licensed: alone in an empty channel, an observer firing
  // on any transition writes the mixing value and nobody's music stops.
  it('mixes when this app has nothing of its own to play', () => {
    expect(policyFor(false).playout).toBe(IDLE);
  });
});

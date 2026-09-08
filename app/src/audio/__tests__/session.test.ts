import {
  ANDROID_CALL,
  ANDROID_LISTENING,
  ANDROID_OUTPUTS,
  ANDROID_RELEASED,
  androidNameOf,
  androidSessionFor,
  CALL,
  LISTENING,
  policyFor,
  sessionFor,
} from '../session';

describe('sessionFor', () => {
  /**
   * **Two configurations, and a third state that is not one.**
   *
   * Since 2026-09-08 this app holds a session if and only if it is stepped in.
   * `CALL` is a member, or a guest who may speak; `LISTENING` is a guest who
   * may not; and nearby, stepped out and not in a room are one state — the
   * session deactivated — which no configuration describes and which
   * `policyFor` arranges natively.
   *
   * `microphoneNeeded` in core/micNeeded.ts computes the choice between the
   * two. This module is handed the answer and never asks how it was reached.
   */
  it('is a call for anybody who may open a microphone', () => {
    expect(sessionFor('call')).toBe(CALL);
  });

  it('listens for somebody in the room who may not publish', () => {
    expect(sessionFor('listen')).toBe(LISTENING);
  });

  it('offers exactly two configurations', () => {
    expect(new Set([sessionFor('call'), sessionFor('listen')])).toEqual(
      new Set([CALL, LISTENING])
    );
  });
});

describe('the configurations themselves', () => {
  /**
   * **Nothing mixes, and that is the change.** A phone has either claimed the
   * audio system or given it back; there is no configuration left that
   * half-holds it. `IDLE` was the last user of this option and left with the
   * redesign, so an option added to either of these silently un-pauses
   * somebody's podcast underneath a conversation.
   *
   * The point of standing in a room is to hear somebody the moment they speak,
   * and a voice mixed under another app's audio is a voice you have to attend
   * to rather than one you simply hear. **Nearby is the escape hatch** for
   * anybody who wants the other trade.
   */
  it('mixes in no state at all', () => {
    expect(CALL.audioCategoryOptions).not.toContain('mixWithOthers');
    expect(LISTENING.audioCategoryOptions).not.toContain('mixWithOthers');
  });

  it('captures in exactly one state', () => {
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
  //
  // The 2026-09-08 lab run measured the split working — A2DP stereo out, the
  // phone's own microphone in — and it is declined rather than unavailable: it
  // costs the echo canceller, and the mic-less speaker above is unsafe under
  // it. Being nearby is how somebody keeps stereo.
  it('offers no output that cannot also capture', () => {
    expect(CALL.audioCategoryOptions).not.toContain('allowBluetoothA2DP');
  });

  // A listening guest needs no option to reach a Bluetooth headset: under
  // `playback` a Bluetooth device is an eligible output already. So this one
  // is on a *better* route than a member is, which is a consequence of not
  // needing a microphone rather than a decision.
  it('listens on a category that needs no route option', () => {
    expect(LISTENING.audioCategory).toBe('playback');
    expect(LISTENING.audioCategoryOptions).not.toContain('allowBluetoothA2DP');
  });
});

describe('policyFor', () => {
  /**
   * **The observer's three engine states are this design's three audio
   * states**, which is why `policyFor` stopped being a function of anything:
   * recording enabled is a call, playout only is a listener, and neither is
   * deactivation. The observer distinguishes them on the audio worker thread
   * without being told which case it is in.
   */
  it('hands the observer the same two configurations this app applies', () => {
    expect(policyFor().recording).toBe(CALL);
    expect(policyFor().playout).toBe(LISTENING);
  });

  /**
   * **The release, which is the whole mechanism by which nearby holds
   * nothing.**
   *
   * Stated rather than left to the default because the two halves of the SDK
   * disagree about it: the wrapper defaults it to `true`, and the native setter
   * it wraps reads a missing key as `false` — which leaves the session active
   * after the last engine stop, silently, and is the one failure here nothing
   * in the app could observe.
   */
  it('deactivates when both engines stop', () => {
    expect(policyFor().deactivateOnStop).toBe(true);
  });
});

describe('the same states on Android', () => {
  /**
   * **The question must not fork, and this is what says so.** The two
   * platforms describe the audio session in vocabularies with nothing in
   * common — a category and mode against an `AudioManager` mode and a stream
   * type — so the thing worth pinning is not that the values correspond but
   * that the *answer* does: one rule in core/micNeeded.ts, asked once, and
   * both platforms answering it in the same direction. An Android-only state
   * would pass every other test in this file and is exactly what this catches.
   */
  it.each([['listen'], ['call']] as const)(
    'moves with the same answer as the Apple half (want=%s)',
    (want) => {
      const apple = sessionFor(want) === CALL;
      const android = androidSessionFor(want) === ANDROID_CALL;
      expect(android).toBe(apple);
    }
  );

  /**
   * `inCommunication` is what switches on Android's hardware echo canceller,
   * as `videoChat` is on iOS — see planning/POSTMORTEM-echo.md for what a
   * capturing session in a non-voice mode costs to find from the far end.
   */
  it('captures under the mode that turns on the echo canceller', () => {
    expect(ANDROID_CALL.audioMode).toBe('inCommunication');
    expect(ANDROID_CALL.audioStreamType).toBe('voiceCall');
  });

  // The listening half: `normal` and the music stream, which is what
  // `LISTENING`'s `playback` category means here. It still requests `gain`
  // focus, so it stops other apps exactly as the iOS side now does — which is
  // why it stopped being called idle.
  it('listens as ordinary media, and still exclusively', () => {
    expect(ANDROID_LISTENING.audioMode).toBe('normal');
    expect(ANDROID_LISTENING.audioStreamType).toBe('music');
  });

  /**
   * **The platform's whole share of the redesign.** iOS gets the release from
   * `deactivateOnStop`; nothing here gives the audio focus back on this app's
   * behalf, so a phone that is nearby has to say so. Asserted as *stops
   * managing focus* rather than as a preset, because that is the sentence.
   */
  it('gives the audio focus back when nothing is claimed', () => {
    expect(ANDROID_RELEASED.manageAudioFocus).toBe(false);
    expect(ANDROID_RELEASED.audioMode).toBe('normal');
  });

  // Identity, not equality: `androidNameOf` tells the states apart by
  // reference, exactly as `nameOf` does, so two presets that happened to be
  // the same object would make the log line unable to say which state it is
  // in. The jest mock supplies distinct literals for this reason.
  it('has three distinct configurations', () => {
    expect(ANDROID_LISTENING).not.toBe(ANDROID_CALL);
    expect(ANDROID_RELEASED).not.toBe(ANDROID_LISTENING);
    expect(androidNameOf(androidSessionFor('call'))).toBe('CALL');
    expect(androidNameOf(androidSessionFor('listen'))).toBe('LISTENING');
    expect(androidNameOf(ANDROID_RELEASED)).toBe('released');
  });

  /**
   * Speaker before earpiece, which is the same decision `defaultToSpeaker`
   * makes in `CALL`: a channel should be audible to somebody who has put the
   * phone down rather than held to the ear like a telephone call. Stated as an
   * ordering rather than a list so that adding a route does not silently
   * reverse it.
   */
  it('prefers the loudspeaker over the earpiece', () => {
    const outputs: readonly string[] = ANDROID_OUTPUTS;
    expect(outputs.indexOf('speaker')).toBeLessThan(
      outputs.indexOf('earpiece')
    );
    expect(outputs.indexOf('bluetooth')).toBeLessThan(
      outputs.indexOf('speaker')
    );
  });
});

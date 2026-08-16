import { CALL, IDLE, LISTENING, sessionFor } from '../session';

describe('sessionFor', () => {
  it('mixes while alone with nothing to hear', () => {
    expect(sessionFor(false, 0)).toBe(IDLE);
  });

  it('takes the audio exclusively once something is audible', () => {
    expect(sessionFor(false, 1)).toBe(LISTENING);
    expect(sessionFor(false, 4)).toBe(LISTENING);
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
  it('captures under the voice mode, and offers every route', () => {
    expect(CALL.audioMode).toBe('videoChat');
    expect(CALL.audioCategoryOptions).toEqual(
      expect.arrayContaining([
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
        'defaultToSpeaker',
      ])
    );
  });
});

import { AudioEngineMuteMode } from '@livekit/react-native';
import type { RouteSnapshot } from '../../../modules/audio-route';
import {
  diagnosticEvents,
  diagnosticSections,
  muteModeName,
  profileHint,
  recordEvent,
  resetDiagnostics,
  shortName,
  subscribeDiagnostics,
  type AudioDiagnostic,
} from '../diagnostics';
import type { EngineSnapshot } from '../engineState';
import { WANTED_MUTE_MODE } from '../muteMode';
import { CALL, IDLE } from '../session';
import type { AudioIntent } from '../useSessionAudio';

/**
 * The panel's whole value is that it flags a disagreement between what this
 * app asked of the audio session and what the session actually is. So what is
 * pinned here is exactly that: which readings raise an alarm and which do not.
 *
 * A panel that quietly failed to notice a divergence would be worse than no
 * panel, because it would be read as evidence that there was none — which is
 * the failure mode DECISIONS.md records five instruments falling into on
 * 2026-08-20.
 */

const ASKED_CALL: AudioIntent = {
  selfMuted: false,
  micNeeded: true,
  anyMicOpen: true,
  othersAudible: 1,
  intent: 'capturing',
  session: CALL,
  playout: CALL,
};

/** What `AVAudioSession` reports when it agrees with `CALL`. */
const ROUTE_CALL: RouteSnapshot = {
  outputs: ['BluetoothHFP(AirPods Pro)'],
  inputs: ['BluetoothHFP(AirPods Pro)'],
  sampleRate: 24000,
  category: 'AVAudioSessionCategoryPlayAndRecord',
  mode: 'AVAudioSessionModeVideoChat',
  categoryOptions: ['allowBluetooth', 'allowAirPlay', 'defaultToSpeaker'],
  otherAudioPlaying: false,
  secondaryAudioHint: false,
};

const ENGINE: EngineSnapshot = {
  engineRunning: true,
  playing: true,
  recording: true,
  microphoneMuted: false,
  muteMode: WANTED_MUTE_MODE,
  voiceProcessingEnabled: true,
  voiceProcessingBypassed: false,
  recordingAlwaysPrepared: false,
  inputAvailable: true,
  outputAvailable: true,
};

function reading(patch: Partial<AudioDiagnostic> = {}): AudioDiagnostic {
  return {
    asked: ASKED_CALL,
    engine: ENGINE,
    route: ROUTE_CALL,
    at: 1_700_000_000_000,
    ...patch,
  };
}

/** Every row in the panel, flattened, since the alarms are what matter. */
function rows(d: AudioDiagnostic) {
  return diagnosticSections(d).flatMap((section) => section.rows);
}

function row(d: AudioDiagnostic, label: string) {
  const found = rows(d).find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled ${label}`);
  return found;
}

function alarmingLabels(d: AudioDiagnostic): string[] {
  return rows(d)
    .filter((r) => r.alarm)
    .map((r) => r.label);
}

describe('when every writer agrees, which is the uninteresting case', () => {
  it('raises nothing at all', () => {
    expect(alarmingLabels(reading())).toEqual([]);
  });

  it('still shows both halves, so agreement is visible rather than assumed', () => {
    expect(row(reading(), 'asked').value).toBe('CALL playAndRecord/videoChat');
    expect(row(reading(), 'actual').value).toBe('playAndRecord/videoChat');
  });
});

describe('a session that is not what was asked for', () => {
  // The exact shape of the bug the whole `session.ts` module exists to
  // prevent: we asked for a call and something else left it on playback, so
  // the echo canceller is off while the microphone is open.
  it('is flagged when the category differs', () => {
    const d = reading({
      route: { ...ROUTE_CALL, category: 'AVAudioSessionCategoryPlayback' },
    });
    expect(row(d, 'actual').alarm).toBe(true);
    expect(row(d, 'actual').value).toBe('playback/videoChat');
  });

  it('is flagged when only the mode differs', () => {
    const d = reading({
      route: { ...ROUTE_CALL, mode: 'AVAudioSessionModeDefault' },
    });
    expect(row(d, 'actual').alarm).toBe(true);
  });

  // The build-65 fix, watched from the other side. `allowBluetoothA2DP` under
  // `playAndRecord` makes a microphone-less speaker an eligible output, which
  // is an echo path — so its reappearance in the *actual* options is exactly
  // what this row is for, whoever put it there.
  it('is flagged when the options differ, even though the category matches', () => {
    const d = reading({
      route: {
        ...ROUTE_CALL,
        categoryOptions: [
          'allowBluetooth',
          'allowAirPlay',
          'defaultToSpeaker',
          'allowBluetoothA2DP',
        ],
      },
    });
    expect(row(d, 'actual').alarm).toBeFalsy();
    expect(row(d, 'actual opts').alarm).toBe(true);
  });

  it('accepts the same options in a different order, that being iOS’s business', () => {
    const d = reading({
      route: {
        ...ROUTE_CALL,
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'allowAirPlay'],
      },
    });
    expect(alarmingLabels(d)).toEqual([]);
  });
});

describe('a reading that could not be taken', () => {
  // The rule this whole file is written under: an instrument that goes quiet
  // must not look like an instrument reporting nothing wrong.
  it('never renders as blank or false', () => {
    const d = reading({ route: null, engine: null });
    expect(row(d, 'actual').value).toBe('unreadable');
    expect(row(d, 'engine').value).toBe('unreadable');
    expect(row(d, 'other audio').value).toBe('unreadable');
  });

  it('is itself an alarm, since it is the comparison that failed', () => {
    const d = reading({ route: null, engine: null });
    expect(row(d, 'actual').alarm).toBe(true);
    expect(row(d, 'engine').alarm).toBe(true);
  });

  it('distinguishes a missing module from a missing route', () => {
    // Build 61 shipped the reader without its Swift half and read exactly
    // this; the line has to say which of the two happened.
    expect(row(reading({ route: null }), 'route').value).toMatch(/module/);
  });

  // A binary older than the field it is being asked for. Absent is not
  // "no options set", and rendering it as an empty list would say so.
  it('treats options it cannot read as unreadable rather than empty', () => {
    const d = reading({
      route: { ...ROUTE_CALL, categoryOptions: undefined },
    });
    expect(row(d, 'actual opts').value).toBe('unreadable');
    expect(row(d, 'actual opts').alarm).toBe(true);
  });

  it('says "(none)" when a list really is empty', () => {
    const d = reading({
      asked: { ...ASKED_CALL, session: IDLE, playout: IDLE },
      route: {
        ...ROUTE_CALL,
        category: 'AVAudioSessionCategoryPlayback',
        mode: 'AVAudioSessionModeSpokenAudio',
        categoryOptions: ['mixWithOthers'],
      },
    });
    expect(row(d, 'actual opts').value).toBe('mixWithOthers');
    expect(row(d, 'asked opts').value).toBe('mixWithOthers');
    expect(alarmingLabels(d)).toEqual([]);
  });
});

describe('before anything has been asked of the session', () => {
  it('says so rather than inventing a comparison', () => {
    const d = reading({ asked: null });
    expect(row(d, 'asked').value).toMatch(/nothing yet/);
    expect(row(d, 'intent').value).toMatch(/not connected/);
  });

  // The reading that would settle the once-seen foreground interruption: alone
  // in a channel means we asked for nothing, so a session that is nonetheless
  // a call is somebody else holding it that way.
  it('flags a call this app never asked for', () => {
    const d = reading({ asked: null });
    expect(row(d, 'actual').alarm).toBe(true);
  });

  it('does not flag a playback session, which is the ordinary idle state', () => {
    const d = reading({
      asked: null,
      route: { ...ROUTE_CALL, category: 'AVAudioSessionCategoryPlayback' },
    });
    expect(row(d, 'actual').alarm).toBeFalsy();
  });
});

describe('the engine', () => {
  // The check build 58 lacked: it set a mute mode and never confirmed the
  // request took, so a silent failure looked exactly like a success.
  it('flags a mute mode that is not the one asked for', () => {
    const d = reading({
      engine: { ...ENGINE, muteMode: AudioEngineMuteMode.RestartEngine },
    });
    expect(row(d, 'mute mode').alarm).toBe(true);
    expect(row(d, 'mute mode').value).toBe('RestartEngine');
  });

  // Keyed on the enum rather than on the literals, so a value the SDK moves
  // moves the assertion with it. Reading the names back off the enum's own
  // reverse mapping is what this replaced: it worked on a device and returned
  // `raw(n)` under jest, the mock being a plain object. See `muteModeName`.
  it('names the modes, which are three undocumented numbers', () => {
    expect(muteModeName(AudioEngineMuteMode.VoiceProcessing)).toBe(
      'VoiceProcessing'
    );
    expect(muteModeName(AudioEngineMuteMode.RestartEngine)).toBe(
      'RestartEngine'
    );
    expect(muteModeName(AudioEngineMuteMode.InputMixer)).toBe('InputMixer');
    expect(muteModeName(AudioEngineMuteMode.Unknown)).toBe('Unknown');
    // A value the SDK has grown since. Shown as itself rather than guessed at.
    expect(muteModeName(7)).toBe('raw(7)');
  });

  // Echo cancellation off while capturing is the build 17 echo, arrived at
  // from a different direction. See planning/POSTMORTEM-echo.md.
  it('flags voice processing being off or bypassed', () => {
    expect(
      row(reading({ engine: { ...ENGINE, voiceProcessingEnabled: false } }), 'voice proc')
        .alarm
    ).toBe(true);
    expect(
      row(reading({ engine: { ...ENGINE, voiceProcessingBypassed: true } }), 'voice proc')
        .alarm
    ).toBe(true);
  });
});

describe('shortName', () => {
  it('trims iOS’s spelling to the SDK’s', () => {
    expect(shortName('AVAudioSessionCategoryPlayAndRecord')).toBe('playAndRecord');
    expect(shortName('AVAudioSessionModeVideoChat')).toBe('videoChat');
  });

  // A value it does not recognise is a finding, not a formatting problem.
  it('leaves anything else exactly as it came', () => {
    expect(shortName('something-else')).toBe('something-else');
    expect(shortName('')).toBe('');
  });
});

describe('profileHint', () => {
  // Hedged deliberately: the measured hands-free rate on AirPods Pro was
  // 24 kHz, not the 16 the documentation implies, so a threshold at 16 would
  // have called that A2DP.
  it('puts the measured hands-free rate on the right side of the line', () => {
    expect(profileHint(24000)).toBe('suggests hands-free');
    expect(profileHint(16000)).toBe('suggests hands-free');
    expect(profileHint(48000)).toBe('suggests A2DP');
    expect(profileHint(44100)).toBe('suggests A2DP');
  });

  it('says nothing at all rather than guessing from no rate', () => {
    expect(profileHint(0)).toBe('');
  });
});

describe('the event log', () => {
  beforeEach(() => resetDiagnostics());

  it('keeps what it is told, newest last', () => {
    recordEvent('first');
    recordEvent('second');
    expect(diagnosticEvents().map((e) => e.text)).toEqual(['first', 'second']);
  });

  it('is bounded, so a long session cannot grow it without limit', () => {
    for (let i = 0; i < 60; i += 1) recordEvent(`line ${i}`);
    const texts = diagnosticEvents().map((e) => e.text);
    expect(texts).toHaveLength(40);
    // The oldest go, not the newest: a transient is interesting when it is
    // fresh, and the panel is opened after the thing was heard.
    expect(texts[texts.length - 1]).toBe('line 59');
    expect(texts[0]).toBe('line 20');
  });

  it('tells a mounted panel when a line lands', () => {
    const listener = jest.fn();
    const stop = subscribeDiagnostics(listener);
    recordEvent('something');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    recordEvent('after');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

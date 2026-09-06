import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import { drainEvents, resetDiagnostics } from '../diagnostics';
import { startSilence, stopSilence } from '../../../modules/keep-alive';
import { WAITING_WINDOW_MS } from '../../../../core/constants';

/**
 * Two rules with one cause: **iOS will not give a backgrounded app a
 * microphone it did not already have.**
 *
 * Measured 2026-09-05: somebody arrived while the phone was locked, the app
 * asked for `CALL`, iOS refused without saying so, the engine never started,
 * and a track subscribed two seconds earlier rendered into nothing for four
 * minutes. The refusal is about the microphone; the cost fell on the speaker,
 * because `sessionFor` answers one question for both jobs.
 *
 * From that, both halves of what is tested here:
 *
 * - **A promotion is deferred** and an existing call is left alone, because
 *   the transition is what is forbidden rather than the state.
 * - **A quiet channel opens the microphone up front**, while the app is on
 *   screen and iOS will grant it, so that an arrival can be *answered* without
 *   touching the phone. That is the silent wait, and it is decided from
 *   `otherAudioPlaying` — a flag that only tells the truth while this app is
 *   active, which is also the only moment the decision can be acted on.
 *
 * They assert on the audio log rather than on a mocked category, because the
 * log line is what a person reads in the field and is exactly what was missing
 * when this was diagnosed.
 */

/**
 * Drives the one input the silent wait turns on. `null` from the real module
 * means "no module", so a mock is needed to say *playing* at all.
 */
const mockRoute = { otherAudioPlaying: false };

jest.mock('../../../modules/audio-route', () => ({
  routeSnapshot: jest.fn(() => ({
    otherAudioPlaying: mockRoute.otherAudioPlaying,
  })),
  routeFault: jest.fn(() => null),
  onRouteChange: jest.fn(() => () => {}),
  onOtherAudio: jest.fn(() => () => {}),
  setAllowHapticsDuringRecording: jest.fn(async () => true),
  routeLine: jest.fn(() => ''),
}));

/**
 * `AppState` is spied on rather than the module being mocked. Spreading
 * `jest.requireActual('react-native')` evaluates every export it has, and one
 * of them reaches `TurboModuleRegistry.getEnforcing('DevMenu')`, which throws
 * under jest — so the whole suite fails to load for a reason that has nothing
 * to do with what is being tested.
 */
let listeners: ((next: string) => void)[] = [];

function captureAppState() {
  listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    fn: (next: string) => void
  ) => {
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  }) as unknown as typeof AppState.addEventListener);
  (AppState as unknown as { currentState: string }).currentState = 'active';
}

jest.mock('../../../modules/keep-alive', () => ({
  startSilence: jest.fn(async () => true),
  stopSilence: jest.fn(async () => true),
}));

interface FakeRoom {
  localParticipant: { setMicrophoneEnabled: jest.Mock };
  handlers: Record<string, ((...args: unknown[]) => void)[]>;
  fire(event: string, ...args: unknown[]): void;
}

const mockRooms: FakeRoom[] = [];

jest.mock('livekit-client', () => {
  const EVENTS = {
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
  };

  class Room {
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    localParticipant = {
      identity: 'acct_me',
      setMicrophoneEnabled: jest.fn(async () => {}),
      getTrackPublication: () => undefined,
    };
    remoteParticipants = new Map();
    connect = jest.fn(async () => {});
    disconnect = jest.fn(async () => {});

    constructor() {
      mockRooms.push(this as unknown as FakeRoom);
    }

    on(event: string, fn: (...args: unknown[]) => void) {
      (this.handlers[event] ||= []).push(fn);
      return this;
    }

    removeAllListeners() {
      this.handlers = {};
    }

    fire(event: string, ...args: unknown[]) {
      for (const fn of this.handlers[event] ?? []) fn(...args);
    }
  }

  return {
    Room,
    RoomEvent: EVENTS,
    Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
    DisconnectReason: { DUPLICATE_IDENTITY: 2 },
  };
});

jest.mock('../../api/http', () => ({
  api: {
    mediaToken: jest.fn(async () => ({
      url: 'wss://media.example',
      token: 'join-credential',
    })),
  },
}));

function Probe({ audio }: { audio: boolean }) {
  useSessionAudio('room-1', 'chan-1', 'auth-token', false, audio, audio);
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

/** Drive the app between foreground and background, as iOS would. */
const appState = async (next: string) => {
  (AppState as unknown as { currentState: string }).currentState = next;
  await act(async () => {
    for (const fn of [...listeners]) fn(next);
  });
  await settle();
};

/** Everything logged since the last call, as plain strings. */
const logged = () => drainEvents().map((e) => e.text);

const reset = () => {
  mockRooms.length = 0;
  mockRoute.otherAudioPlaying = false;
  captureAppState();
  (startSilence as jest.Mock).mockClear();
  (stopSilence as jest.Mock).mockClear();
  resetDiagnostics();
  jest.useFakeTimers();
};

const micOf = (i = 0) => mockRooms[i].localParticipant.setMicrophoneEnabled;

describe('the silent wait', () => {
  beforeEach(reset);
  afterEach(() => jest.useRealTimers());

  /**
   * The whole of capability (c): the microphone is open before the phone is
   * locked, because afterwards iOS will not grant one.
   */
  it('opens the microphone in a quiet channel', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();

    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(micOf()).toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The other branch. A call-shaped session stops another app's audio, so a
   * wait with something already playing hands the audio system back instead —
   * and gives up (c) for that visit.
   */
  it('does not open one while another app is playing', async () => {
    mockRoute.otherAudioPlaying = true;
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();

    expect(logged().some((l) => l.includes('IDLE'))).toBe(true);
    expect(micOf()).not.toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **Never asked is not the same as nothing playing.** `otherAudioPlaying`
   * only tells the truth while this app is active, so an app that has had no
   * such moment — launched straight into the background — must not take a
   * microphone on an assumption and stop audio it never looked for.
   */
  it('does not open one before it has had an honest moment to ask', async () => {
    (AppState as unknown as { currentState: string }).currentState = 'background';
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();

    expect(micOf()).not.toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('capture against the foreground', () => {
  beforeEach(reset);
  afterEach(() => jest.useRealTimers());

  /**
   * The deferral, reached through the accompanied wait — the only wait that is
   * not already a call, and therefore the only one with a promotion left to
   * defer.
   */
  it('defers the call session when audio arrives in the background', async () => {
    mockRoute.otherAudioPlaying = true;
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();
    await appState('background');
    logged();

    await act(async () => {
      tree.update(<Probe audio={true} />);
    });
    await settle();

    expect(logged()).toContain('capture deferred (backgrounded)');
    expect(micOf()).not.toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  it('takes the call session at the foreground, which is when iOS grants it', async () => {
    mockRoute.otherAudioPlaying = true;
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();
    await appState('background');
    await act(async () => {
      tree.update(<Probe audio={true} />);
    });
    await settle();
    logged();

    // Foregrounding both re-asks the other-audio question and makes the
    // microphone grantable, so the promotion happens here and only here.
    mockRoute.otherAudioPlaying = false;
    await appState('active');

    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(micOf()).toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The half that must not regress: switching apps mid-conversation. iOS lets
   * a session that is already capturing carry on, and dropping to `playback`
   * here would cut somebody's microphone every time they checked a message.
   */
  it('leaves a call alone when the app goes to the background', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={true} />);
    });
    await settle();
    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);

    await appState('background');

    expect(logged()).not.toContain('capture deferred (backgrounded)');

    await act(async () => {
      tree.unmount();
    });
  });
});

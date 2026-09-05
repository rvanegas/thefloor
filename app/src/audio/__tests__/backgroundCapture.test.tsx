import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import { drainEvents, resetDiagnostics } from '../diagnostics';
import { startSilence, stopSilence } from '../../../modules/keep-alive';
import { WAITING_WINDOW_MS } from '../../../../core/constants';

/**
 * A backgrounded app may keep a call session and may not start one.
 *
 * Measured 2026-09-05 on the first build that stayed alive in the background
 * long enough to try it: somebody arrived while the phone was locked, the app
 * asked for `CALL`, iOS refused without saying so, the engine never started,
 * and a track that had been subscribed two seconds earlier rendered into
 * nothing for four minutes. The refusal is about the microphone; the cost fell
 * on the speaker, because `sessionFor` answers one question for both jobs.
 *
 * So these pin the two halves of the rule — a promotion is deferred, an
 * existing call is not disturbed — and they assert on the audio log rather
 * than on a mocked category, because the log line is what a person reads in
 * the field and is the thing that was missing when this was diagnosed.
 */

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

describe('capture against the foreground', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    captureAppState();
    (startSilence as jest.Mock).mockClear();
    (stopSilence as jest.Mock).mockClear();
    resetDiagnostics();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers the call session when audio arrives in the background', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();
    await appState('background');
    logged();

    // Somebody steps in while the phone is locked.
    await act(async () => {
      tree.update(<Probe audio={true} />);
    });
    await settle();

    expect(logged()).toContain('capture deferred (backgrounded)');
    expect(
      mockRooms[0].localParticipant.setMicrophoneEnabled
    ).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('takes the call session at the foreground, which is when iOS grants it', async () => {
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

    await appState('active');

    expect(logged()).toContain('capturing CALL');
    expect(
      mockRooms[0].localParticipant.setMicrophoneEnabled
    ).toHaveBeenCalledWith(true);

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
    // The connect path applies it, so the line reads `connect capturing CALL`.
    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);

    await appState('background');

    expect(logged()).not.toContain('capture deferred (backgrounded)');

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('the silent keep-alive across a foreground', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    captureAppState();
    (startSilence as jest.Mock).mockClear();
    (stopSilence as jest.Mock).mockClear();
    resetDiagnostics();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * **Silence must never play before the category is written.**
   *
   * `AVAudioPlayer.play()` activates the session, and on a fresh launch the
   * category is still `soloAmbient`, which does not mix — so silence started
   * first stops whatever else the phone is playing, which is the one thing
   * this feature exists not to do. Build 146 shipped exactly that: the field
   * log read `silence started` on the line above `connect released IDLE`, and
   * stepping into an empty channel killed a podcast.
   *
   * Asserted as an ordering over the log because that is how it presented and
   * how anybody would recognise it again.
   */
  it('does not play until the session has been configured', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();

    const lines = logged();
    const configured = lines.findIndex((l) => l.startsWith('connect '));
    const silence = lines.findIndex((l) => l.startsWith('silence started'));
    expect(configured).toBeGreaterThanOrEqual(0);
    expect(silence).toBeGreaterThan(configured);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The first version armed the timer once, keyed on the channel, so a phone
   * that stayed in one quiet channel was suspendable for good after fifteen
   * minutes and a foreground did not bring it back.
   */
  it('restarts after expiry when the app is next opened', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();
    expect(startSilence).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS);
    });
    expect(stopSilence).toHaveBeenCalledTimes(1);
    logged();

    await appState('background');
    await appState('active');

    expect(startSilence).toHaveBeenCalledTimes(2);
    expect(logged()).toContain('silence restarted');

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not restart one that is still running, and renews its clock', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio={false} />);
    });
    await settle();

    await act(async () => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS - 1000);
    });
    await appState('active');

    // Still the one start, and the window is fifteen minutes from now rather
    // than a second away.
    expect(startSilence).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(stopSilence).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS);
    });
    expect(stopSilence).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.unmount();
    });
  });
});

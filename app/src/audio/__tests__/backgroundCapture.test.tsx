import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import { drainEvents, resetDiagnostics } from '../diagnostics';

/**
 * One rule, with one cause: **iOS will not give a backgrounded app a
 * microphone it did not already have.**
 *
 * Measured 2026-09-05: somebody arrived while the phone was locked, the app
 * asked for `CALL`, iOS refused without saying so, the engine never started,
 * and a track subscribed two seconds earlier rendered into nothing for four
 * minutes. The refusal is about the microphone; the cost fell on the speaker,
 * because `sessionFor` answers one question for both jobs.
 *
 * From that, what is tested here: **a promotion is deferred** and an existing
 * call is left alone, because the transition is what is forbidden rather than
 * the state.
 *
 * **The silent wait left this file on 2026-09-08, by being generalised out of
 * existence.** It was a quiet channel with nothing else playing opening the
 * microphone up front so that an arrival could be answered from a pocket, and
 * it was chosen against the other case from `otherAudioPlaying`. Stepping in
 * is now that claim unconditionally, so there is no wait to pick and no flag
 * to pick it with; what is left of the argument is the first case below.
 * Somebody who wants their music to survive steps in **nearby** instead.
 *
 * They assert on the audio log rather than on a mocked category, because the
 * log line is what a person reads in the field and is exactly what was missing
 * when this was diagnosed.
 */

const mockEngine = { inputAvailable: true };

jest.mock('../engineState', () => ({
  engineSnapshot: jest.fn(() => ({ inputAvailable: mockEngine.inputAvailable })),
}));

jest.mock('../../../modules/audio-route', () => ({
  routeSnapshot: jest.fn(() => null),
  routeFault: jest.fn(() => null),
  onRouteChange: jest.fn(() => () => {}),
  releaseSession: jest.fn(async () => null),
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
  mockEngine.inputAvailable = true;
  captureAppState();
  resetDiagnostics();
  jest.useFakeTimers();
};

const micOf = (i = 0) => mockRooms[i].localParticipant.setMicrophoneEnabled;

describe('stepping in, which is the claim', () => {
  beforeEach(reset);
  afterEach(() => jest.useRealTimers());

  /**
   * **The whole of the 2026-09-08 rule, in one assertion.** The microphone is
   * open from the moment somebody steps in — before anybody has arrived,
   * whether or not anybody ever does — so that an arriving voice is heard
   * rather than attended to, and so that it can be *answered* from a pocket:
   * iOS will not grant a backgrounded app a new microphone, so the one an
   * arrival is answered with has to be open before the phone is locked.
   */
  it('opens the microphone in a quiet channel', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio />);
    });
    await settle();

    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(micOf()).toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **And it does not consult anything else, which is the part that changed.**
   * A quiet channel used to hand the audio system back when another app was
   * playing, chosen from `otherAudioPlaying` — a reading that answers false
   * with music plainly playing once our own session is active, and that flipped
   * configuration five times in thirty seconds on build 150. Nothing branches
   * on it now: the claim is unconditional, and somebody who wants the other
   * trade is nearby instead.
   */
  it('claims whatever else the phone is doing', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio />);
    });
    await settle();

    const lines = logged();
    expect(lines.some((l) => l.includes('other audio'))).toBe(false);
    expect(lines.some((l) => l.includes('capturing CALL'))).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **Leaving the room is leaving the audio system.** Every exit from
   * stepped-in takes `mediaRoom` away and lands in the connection's teardown,
   * which deactivates rather than applying a quieter configuration —
   * `notifyOthersOnDeactivation`, which is what gives the interrupted app its
   * audio back at full rate.
   */
  it('releases the session when the room goes', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio />);
    });
    await settle();
    logged();

    await act(async () => {
      tree.unmount();
    });
    await settle();

    expect(logged().some((l) => l.startsWith('released'))).toBe(true);
  });
});

describe('a device with no microphone', () => {
  beforeEach(reset);
  afterEach(() => jest.useRealTimers());

  /**
   * A Mac mini has none. Asking WebRTC's audio device module to capture from a
   * device that does not exist dereferences null inside `AVFAudio` and takes
   * the process with it — five identical crashes on 2026-09-06, App Store
   * build 127. Nothing is published, so the branch that calls
   * `setMicrophoneEnabled(true)` is never reached.
   */
  it('publishes nothing, alone in a channel', async () => {
    mockEngine.inputAvailable = false;
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio />);
    });
    await settle();

    expect(micOf()).not.toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **And it still hears.** Only the microphone is withheld: the session it
   * takes is the listening one, which is exactly what having no input means —
   * a machine with no microphone can listen, it simply cannot speak. That is
   * the difference between this and refusing to connect, and since 2026-09-08
   * it is the same configuration a guest without a speech grant is given
   * rather than a special case.
   */
  it('still listens when it cannot speak', async () => {
    mockEngine.inputAvailable = false;
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe audio />);
    });
    await settle();

    expect(logged().some((l) => l.includes('LISTENING'))).toBe(true);
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
   * **The deferral, reached the one way that is left**: somebody in the room
   * who could not publish and now may — a guest granted the microphone. That
   * is the only transition from *no microphone* to *microphone* that does not
   * also start a connection, and starting a connection is what a promotion
   * from nearby does, which is why that one is a foreground rule outright.
   */
  it('defers the call session when the microphone is granted in the background', async () => {
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

    // Foregrounding is what makes the microphone grantable, so the promotion
    // happens here and only here.
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

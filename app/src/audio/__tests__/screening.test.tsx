import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import { drainEvents, resetDiagnostics } from '../diagnostics';

/**
 * **Pausing the film gives the room its voice back, and the session has to
 * hear about it.**
 *
 * `screening` is an input to the one effect that decides what the microphone
 * is doing — `SCREENING` rather than `CALL`, and `muted` rather than
 * `capturing`, for the length of a run. Every route out of a run therefore has
 * to wake that effect, and a pause is the ordinary one: `watchPause` clears
 * `enforced`, `isScreening` goes false, and the two people who have just
 * paused to talk about what they are watching expect to be heard.
 *
 * Reported 2026-09-26 as *one pauses and then neither can hear each other*,
 * with stepping out and back in as the cure — which is what a fresh connection
 * buys and what nothing short of one was buying.
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

  /** A published microphone, so a `muted` intent has a device to hold. */
  const track = { stopOnMute: true, sid: 'TR_local' };

  class Room {
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    localParticipant = {
      identity: 'acct_me',
      setMicrophoneEnabled: jest.fn(async () => {}),
      getTrackPublication: () => ({ audioTrack: track }),
      unpublishTrack: jest.fn(async () => {}),
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

function Probe({ screening }: { screening: boolean }) {
  useSessionAudio(
    'room-1',
    'chan-1',
    'auth-token',
    false,
    true,
    true,
    false,
    true,
    true,
    screening
  );
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

const logged = () => drainEvents().map((e) => e.text);

describe('a screening device, when the film stops', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    mockEngine.inputAvailable = true;
    captureAppState();
    resetDiagnostics();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('takes the microphone back when the party pauses', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe screening />);
    });
    await settle();

    // The run: the device is held open and nothing is published from it.
    expect(logged().some((l) => l.includes('muted SCREENING'))).toBe(true);

    // The pause, with nothing else about the channel moving — which is the
    // whole point. No arrival, no departure, no self-mute, no foreground
    // transition: `screening` alone, exactly as `WATCH_PAUSE` delivers it.
    await act(async () => {
      tree.update(<Probe screening={false} />);
    });
    await settle();

    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(
      mockRooms[0].localParticipant.setMicrophoneEnabled
    ).toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The same edge in the other direction, which worked and worked by
   * accident: a run begins by withholding the room, so every remote
   * subscription goes and `othersAudible` wakes the effect a beat later. It is
   * asserted here so the two directions stand on the same dependency rather
   * than one of them standing on the media plane's timing.
   */
  it('gives the film the session when the party starts', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe screening={false} />);
    });
    await settle();
    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);

    await act(async () => {
      tree.update(<Probe screening />);
    });
    await settle();

    expect(logged().some((l) => l.includes('muted SCREENING'))).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });
});

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import {
  endReportedCall,
  reportedCallHoldsSession,
  startReportedCall,
} from '../../../modules/reported-call';
import { releaseSession } from '../../../modules/audio-route';

/**
 * The *reported call* is made for a *channel*, not for a room — the foreground
 * service's rule (`callService.test.tsx`), for a reason that shows somewhere
 * else: every call is a line in Recents, so a call cycled by a reconnect fills
 * Recents on a bad network, and nothing about the audio would show it.
 *
 * And the release that ends a room is CallKit's while CallKit holds the
 * session: the app's own fails under a call (`-12988`), and on a reconnect it
 * would be letting go of a session the call means to keep.
 *
 * `modules/reported-call` is a no-op off iOS and under jest; mocked so the
 * calls can be counted.
 */

jest.mock('../../../modules/reported-call', () => ({
  startReportedCall: jest.fn(async () => true),
  endReportedCall: jest.fn(),
  reportedCallHoldsSession: jest.fn(() => false),
  addReportedCallLogListener: jest.fn(() => () => {}),
}));

jest.mock('../../../modules/audio-route', () => ({
  routeSnapshot: jest.fn(() => null),
  routeFault: jest.fn(() => null),
  onRouteChange: jest.fn(() => () => {}),
  releaseSession: jest.fn(async () => null),
  setAllowHapticsDuringRecording: jest.fn(async () => true),
  routeLine: jest.fn(() => ''),
}));

jest.mock('../micPermission', () => ({
  ensureMicPermission: jest.fn(async () => true),
}));

interface FakeRoom {
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
    };
    remoteParticipants = new Map<string, { audioTrackPublications: Map<string, unknown> }>();
    connect = jest.fn(async () => {});
    disconnect = jest.fn(async () => {});

    constructor() {
      mockRooms.push(this);
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
    Track: { Kind: { Audio: 'audio' } },
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

function Probe({ room }: { room: string | null }) {
  useSessionAudio(room, 'chan-1', 'auth-token', false, true, true);
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

const started = startReportedCall as jest.Mock;
const ended = endReportedCall as jest.Mock;
const holds = reportedCallHoldsSession as jest.Mock;
const released = releaseSession as jest.Mock;

describe('the reported call', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    started.mockClear();
    ended.mockClear();
    released.mockClear();
    holds.mockReturnValue(false);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with the channel, under its id, and ends when it is left', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();

    expect(started).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledWith('chan-1');
    expect(ended).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });

    expect(ended).toHaveBeenCalledTimes(1);
  });

  /** The assertion this file exists for: a reconnect is not a second call. */
  it('is not cycled by a room being rebuilt', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();
    expect(mockRooms).toHaveLength(1);

    await act(async () => {
      mockRooms[0].fire('disconnected');
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await settle();

    expect(mockRooms).toHaveLength(2);
    expect(started).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('is not made for a channel with no audio to be in', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room={null} />);
    });
    await settle();

    expect(started).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('leaves the release to CallKit while CallKit holds the session', async () => {
    holds.mockReturnValue(true);
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();

    await act(async () => {
      tree.unmount();
    });

    expect(released).not.toHaveBeenCalled();
  });

  /**
   * The other half, and the one that matters if the call never started — a
   * refused transaction, or no CallKit at all: the app still gives the session
   * back itself, as it did before any of this.
   */
  it('releases the session itself when no call holds it', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();

    await act(async () => {
      tree.unmount();
    });

    expect(released).toHaveBeenCalledTimes(1);
  });
});

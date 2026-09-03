import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import {
  startCallService,
  stopCallService,
} from '../../../modules/call-service';

/**
 * Android's foreground service is started for a *channel*, not for a room.
 *
 * The distinction is the whole of what these guard, and it is invisible from
 * the outside: a service tied to the connection would look identical while
 * everything is working and would fail exactly when it is needed, because a
 * reconnect is the moment the app may be in the background — and Android
 * refuses a foreground-service start from there. So the regression is the
 * service being *cycled*, which no assertion about the resulting audio state
 * can catch. These count the calls instead.
 *
 * `modules/call-service` is a local native module and answers `false` off
 * Android, so under jest the real thing does nothing at all. It is mocked
 * rather than left alone so that the calls can be counted.
 */

jest.mock('../../../modules/call-service', () => ({
  startCallService: jest.fn(async () => true),
  stopCallService: jest.fn(async () => true),
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

const started = startCallService as jest.Mock;
const stopped = stopCallService as jest.Mock;

describe('the foreground service', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    started.mockClear();
    stopped.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with the channel and stops when it is left', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();

    expect(started).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });

    expect(stopped).toHaveBeenCalledTimes(1);
  });

  /** The assertion this file exists for. */
  it('is not cycled by a room being rebuilt', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();
    expect(mockRooms).toHaveLength(1);
    expect(started).toHaveBeenCalledTimes(1);

    // The SDK giving up, and the backoff bringing a second room up in its
    // place — the path that would restart a connection-scoped service.
    await act(async () => {
      mockRooms[0].fire('disconnected');
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await settle();

    expect(mockRooms).toHaveLength(2);
    expect(started).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not start for a channel with no audio to be in', async () => {
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
});

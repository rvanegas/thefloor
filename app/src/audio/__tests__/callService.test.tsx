import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import {
  startCallService,
  stopCallService,
} from '../../../modules/call-service';
import { ensureMicPermission } from '../micPermission';

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

/**
 * Answers `true` off Android in reality, which is what these tests run as
 * unless one of them says otherwise. Mocked so that the Android refusal — the
 * case that crashed the app — can be reached without a device.
 */
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

const started = startCallService as jest.Mock;
const stopped = stopCallService as jest.Mock;
const permitted = ensureMicPermission as jest.Mock;

describe('the foreground service', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    started.mockClear();
    stopped.mockClear();
    permitted.mockClear();
    permitted.mockResolvedValue(true);
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

  /**
   * The crash this file did not catch, from the other end.
   *
   * Android 14 refuses a `microphone` foreground service to a process that
   * does not already hold `RECORD_AUDIO`, and refuses it by throwing inside the
   * service — where the module's `try` cannot reach. So the app died on every
   * entry to a channel, for every Android 14 user who had not yet been asked
   * for the microphone, which on a fresh install is all of them: nothing asks
   * until WebRTC opens the microphone, and that happens after this.
   *
   * The Kotlin now catches it where it is thrown. This is the half that means
   * it is not thrown: the permission is asked for first, and a refusal declines
   * to start rather than starting something that cannot work.
   */
  it('asks for the microphone before starting, and does not start without it', async () => {
    permitted.mockResolvedValue(false);

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();

    expect(permitted).toHaveBeenCalledTimes(1);
    expect(started).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The ordering assertion, which is the one that matters and is invisible in
   * the result: asking *after* the start would leave every call above passing
   * and the crash exactly where it was.
   */
  it('asks before it starts, rather than merely asking', async () => {
    const order: string[] = [];
    permitted.mockImplementation(async () => {
      order.push('asked');
      return true;
    });
    started.mockImplementation(async () => {
      order.push('started');
      return true;
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();

    expect(order).toEqual(['asked', 'started']);

    await act(async () => {
      tree.unmount();
    });
    started.mockImplementation(async () => true);
  });

  /**
   * A channel left while the dialog is still up. The permission resolves after
   * the effect has been torn down, and starting a service for a room that has
   * gone would leave a notification for a call with no UI behind it — the state
   * `stopWithTask` exists to prevent, arrived at by a different route.
   */
  it('does not start a service for a channel already left', async () => {
    let answer!: (granted: boolean) => void;
    permitted.mockImplementation(
      () => new Promise<boolean>((resolve) => (answer = resolve))
    );

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" />);
    });
    await settle();
    expect(started).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      answer(true);
    });
    await settle();

    expect(started).not.toHaveBeenCalled();
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

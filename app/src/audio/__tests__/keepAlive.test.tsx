import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import { startSilence, stopSilence } from '../../../modules/keep-alive';
import { WAITING_WINDOW_MS } from '../../../../core/constants';

/**
 * Silence is played for exactly as long as the session is `IDLE`, which is the
 * condition under which iOS suspends this process.
 *
 * These count calls rather than assert about audio, for the same reason
 * `callService.test.tsx` does: the failure being guarded against is invisible
 * from the outside and appears only on a locked phone minutes later, as
 * somebody's presence quietly expiring. The measurement that produced this
 * file was `drops 2 (recovered 0, expired 2)` from `bin/health` after five
 * minutes locked in an empty channel.
 *
 * `modules/keep-alive` answers `false` off iOS, so under jest the real thing
 * does nothing. It is mocked so the calls can be counted.
 */

jest.mock('../../../modules/keep-alive', () => ({
  startSilence: jest.fn(async () => true),
  stopSilence: jest.fn(async () => true),
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
    remoteParticipants = new Map<
      string,
      { audioTrackPublications: Map<string, unknown> }
    >();
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

function Probe({
  room,
  hasAudio,
}: {
  room: string | null;
  hasAudio: boolean;
}) {
  useSessionAudio(room, 'chan-1', 'auth-token', false, false, hasAudio);
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

const started = startSilence as jest.Mock;
const stopped = stopSilence as jest.Mock;

describe('the silent keep-alive', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    started.mockClear();
    stopped.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays while standing in a channel with nothing to hear', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();

    expect(started).toHaveBeenCalledTimes(1);
    expect(stopped).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('does not play where there is real audio to keep the process alive', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={true} />);
    });
    await settle();

    expect(started).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not play outside a channel, where there is nothing to stay for', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room={null} hasAudio={false} />);
    });
    await settle();

    expect(started).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The two edges of a conversation. Somebody arriving makes the silence
   * pointless — there is audio now — and the room going quiet again is a fresh
   * wait rather than a continuation of the first.
   */
  it('stops when somebody arrives and starts again when they go', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();
    expect(started).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(<Probe room="room-1" hasAudio={true} />);
    });
    await settle();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();
    expect(started).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The bound. Past `WAITING_WINDOW_MS` the app has itself stopped calling this
   * person Nearby, so holding their phone awake would be spending battery on an
   * intention the roster has already retired.
   */
  it('gives up after the window the roster stops calling somebody nearby', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();
    expect(started).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS - 1);
    });
    expect(stopped).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(stopped).toHaveBeenCalledTimes(1);

    // And it does not stop twice on the way out, having already given up.
    await act(async () => {
      tree.unmount();
    });
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  /**
   * Keyed on the channel rather than the connection, exactly as the Android
   * service is: a reconnect is the moment the phone is likeliest to be in a
   * pocket, and cycling the keep-alive there would stop the audio that is
   * keeping the process alive at the one moment it is doing its job.
   */
  it('is not cycled by a room being rebuilt', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();
    expect(mockRooms).toHaveLength(1);
    expect(started).toHaveBeenCalledTimes(1);

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
});

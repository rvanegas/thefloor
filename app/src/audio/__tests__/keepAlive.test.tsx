import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio } from '../useSessionAudio';
import { startSilence, stopSilence } from '../../../modules/keep-alive';
import { routeSnapshot } from '../../../modules/audio-route';
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

jest.mock('../../../modules/audio-route', () => ({
  routeSnapshot: jest.fn(() => null),
  routeFault: jest.fn(() => null),
  onRouteChange: jest.fn(() => () => {}),
  onOtherAudio: jest.fn(() => () => {}),
  setAllowHapticsDuringRecording: jest.fn(async () => true),
  routeLine: jest.fn(() => ''),
}));

jest.mock('../../../modules/keep-alive', () => ({
  startSilence: jest.fn(async () => true),
  stopSilence: jest.fn(async () => true),
}));

/**
 * **These waits are the ones that do not hold a microphone.** From 2026-09-06 a
 * quiet channel opens one and is kept alive by capturing, so the silence never
 * starts there. It starts in the other two cases: another app is playing, or —
 * as here, where `AppState.currentState` is not `active` under jest — this app
 * has never had an honest moment to ask, and will not take a microphone on an
 * assumption. Both are `IDLE` with nothing flowing, which earns no background
 * assertion at all and is suspended in about a second.
 */

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
    (AppState as unknown as { currentState: string }).currentState =
      'background';
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

  /**
   * **The accompanied wait gives up presence — 2026-09-06.** Staying alive
   * there bought a state worse than absence: the arrival was heard, ducked
   * over the music, and could not be answered, because iOS grants a
   * backgrounded app no microphone. So the phone suspends, lapses to *Nearby*,
   * and the arrival notification does the work it was always for.
   */
  it('does not play while another app is playing', async () => {
    // Active, because the flag is only read while this app is on screen.
    (AppState as unknown as { currentState: string }).currentState = 'active';
    (routeSnapshot as jest.Mock).mockReturnValue({ otherAudioPlaying: true });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();

    // Settled state rather than call count: the flag is read in an effect, so
    // the very first render has not asked yet and silence starts for one tick
    // before being stopped. Inaudible, under `playback`, and gone before
    // anything could hear it — what matters is that it is not running.
    expect(stopped.mock.calls.length).toBeGreaterThanOrEqual(
      started.mock.calls.length
    );

    (routeSnapshot as jest.Mock).mockReturnValue(null);
    await act(async () => {
      tree.unmount();
    });
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
   * **The window is no longer here, and that is the point of this test.** This
   * effect used to stop itself after `WAITING_WINDOW_MS` and re-arm on each
   * foreground. `useAttention` now ends the visit at that same window by
   * stepping out, which stops this by taking `mediaRoom` away — one clock
   * rather than two that have to be kept equal, and the clock that decides
   * lives with the rule about presence rather than with the keep-alive.
   */
  it('runs for as long as the visit does, with no window of its own', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe room="room-1" hasAudio={false} />);
    });
    await settle();
    expect(started).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(WAITING_WINDOW_MS * 2);
    });
    expect(stopped).not.toHaveBeenCalled();

    // Stepping out is what ends it.
    await act(async () => {
      tree.update(<Probe room={null} hasAudio={false} />);
    });
    await settle();
    expect(stopped).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.unmount();
    });
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

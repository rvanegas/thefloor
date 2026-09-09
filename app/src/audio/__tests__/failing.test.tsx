import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio, type SessionAudio } from '../useSessionAudio';
import { resetDiagnostics } from '../diagnostics';

/**
 * **The warning that would not go out.**
 *
 * `failing` is the red line on a roster card — *Present · not receiving you* —
 * and it is a set the room fills. On 2026-09-08 it stuck: a force quit put an
 * account in it, the phone rejoined ten seconds later under the same identity,
 * and the line was still there minutes afterwards, going only when the person
 * stepped out and back in. The box's journal for that evening carries three
 * `connection lost` for the account against one `connection restored`.
 *
 * The cause is that the set could only be emptied by events a replaced
 * participant never sends: LiveKit swapped the participant for the identity,
 * so no further `ConnectionQualityChanged` arrived for the old one and no
 * `ParticipantDisconnected` either. What the room *did* say — a fresh
 * subscription to their track, four tenths of a second later — was ignored.
 *
 * So both halves are tested here: **positive evidence clears the name**, and
 * **the set is intersected with the room**, which is what makes it derived
 * rather than accumulated and closes the paths nobody has hit yet.
 */

const THEM = 'acct_them';
const OTHER = 'acct_other';

jest.mock('../engineState', () => ({
  engineSnapshot: jest.fn(() => ({ inputAvailable: true })),
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
    return { remove: () => {} };
  }) as unknown as typeof AppState.addEventListener);
  (AppState as unknown as { currentState: string }).currentState = 'active';
}

interface FakeRoom {
  remoteParticipants: Map<string, unknown>;
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
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    ConnectionQualityChanged: 'connectionQualityChanged',
    Reconnecting: 'reconnecting',
    SignalReconnecting: 'signalReconnecting',
    Reconnected: 'reconnected',
    TrackSubscriptionFailed: 'trackSubscriptionFailed',
    TrackUnpublished: 'trackUnpublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    TrackPublished: 'trackPublished',
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

    off() {
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
    ConnectionQuality: {
      Excellent: 'excellent',
      Good: 'good',
      Poor: 'poor',
      Lost: 'lost',
    },
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

let seen: SessionAudio | null = null;

function Probe() {
  seen = useSessionAudio('room-1', 'chan-1', 'auth-token', false, true, true);
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

const failing = () => seen?.failing ?? [];

/** Somebody in the room, as the events hand them over. */
const participant = (identity: string) => ({ identity });

/** A room with one other person in it, and the warning already lit for them. */
async function roomWithWarning(): Promise<{
  tree: ReactTestRenderer;
  room: FakeRoom;
}> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe />);
  });
  await settle();
  const room = mockRooms[0];
  room.remoteParticipants.set(THEM, participant(THEM));
  await act(async () => {
    room.fire('connectionQualityChanged', 'lost', participant(THEM));
  });
  expect(failing()).toEqual([THEM]);
  return { tree, room };
}

describe('the connection warning', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    seen = null;
    captureAppState();
    resetDiagnostics();
  });

  it('goes out when their track is subscribed again', async () => {
    // **The case that was observed.** The replacement joins under the same
    // identity, so nothing reports quality for the participant that went and
    // nothing reports it gone. A subscription is the evidence that arrived
    // instead, and it settles the question by itself: you cannot be subscribed
    // to somebody who is not reaching you.
    const { tree, room } = await roomWithWarning();

    await act(async () => {
      room.fire('trackSubscribed', { kind: 'audio' }, {}, participant(THEM));
    });

    expect(failing()).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('goes out when somebody rejoins under the same identity', async () => {
    const { tree, room } = await roomWithWarning();

    await act(async () => {
      room.fire('participantConnected', participant(THEM));
    });

    expect(failing()).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('cannot stay lit for somebody the room no longer holds', async () => {
    // **The half that closes the class.** No event about them at all — they
    // are simply not in the room any more, which is the state every missing
    // event leaves behind. Anything else happening is enough to notice.
    const { tree, room } = await roomWithWarning();
    room.remoteParticipants.delete(THEM);

    await act(async () => {
      room.fire('participantConnected', participant(OTHER));
    });

    expect(failing()).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('leaves a genuine warning alone', async () => {
    // The other direction, and the one that matters for not gutting the
    // feature: somebody still in the room, still reported lost, with somebody
    // else's arrival going past. The line is supposed to stay.
    const { tree, room } = await roomWithWarning();

    await act(async () => {
      room.fire('participantConnected', participant(OTHER));
    });

    expect(failing()).toEqual([THEM]);
    await act(async () => tree.unmount());
  });
});

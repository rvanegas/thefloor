/**
 * **What the indicator does when the subscription goes.**
 *
 * Withholding somebody — a floor claim, a watch party's mute — is done by
 * unsubscribing every listener from them, never by muting them. LiveKit scopes
 * its speaker updates to what a listener is subscribed to, so the reports stop
 * arriving at the moment the subscription does, and whoever was in the active
 * set stays there with nothing left that can ever remove them. That is not a
 * corner case: it is what every claim does to everybody it silences.
 *
 * So an unsubscription is audio going away, exactly as a mute and an
 * unpublish are — `speaking.ts` § `onAudioGone` carries the argument. What
 * replaces the missing reports is the snapshot's `speakingWhileWithheld`,
 * which is the withheld speaker's own device saying what no other device can
 * see; that half is tested in `ui/__tests__/channelMembers.test.tsx`.
 */

import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio, type SessionAudio } from '../useSessionAudio';
import { resetDiagnostics } from '../diagnostics';

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

const speaking = () => seen?.speaking ?? [];
const participant = (identity: string) => ({ identity });

/** A room hearing one other person, whose card is lit. */
async function roomHearingThem(): Promise<{
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
    room.fire('trackSubscribed', { kind: 'audio' }, {}, participant(THEM));
    room.fire('activeSpeakersChanged', [participant(THEM)]);
  });
  expect(speaking()).toEqual([THEM]);
  return { tree, room };
}

describe('the speaking indicator and the subscription under it', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    seen = null;
    captureAppState();
    resetDiagnostics();
  });

  it('goes out when we stop being subscribed to them', async () => {
    // No further speaker event will ever mention them — that is the whole
    // point of the case — so the unsubscription has to be the thing that puts
    // it out. Dropped outright rather than held: the hold smooths live speech,
    // and somebody we are no longer subscribed to is not between two words.
    const { tree, room } = await roomHearingThem();

    await act(async () => {
      room.fire('trackUnsubscribed', { kind: 'audio' }, {}, participant(THEM));
    });

    expect(speaking()).toEqual([]);
    await act(async () => tree.unmount());
  });

  it('ignores a video subscription going, if one ever exists', async () => {
    // The Floor carries no video, so this is a guard rather than a case: the
    // kind check is what stops a non-audio track's departure being read as
    // silence, and it is one word away from not being there.
    const { tree, room } = await roomHearingThem();

    await act(async () => {
      room.fire('trackUnsubscribed', { kind: 'video' }, {}, participant(THEM));
    });

    expect(speaking()).toEqual([THEM]);
    await act(async () => tree.unmount());
  });

  it('leaves everybody else lit', async () => {
    const { tree, room } = await roomHearingThem();
    room.remoteParticipants.set(OTHER, participant(OTHER));
    await act(async () => {
      room.fire('activeSpeakersChanged', [
        participant(THEM),
        participant(OTHER),
      ]);
      room.fire('trackUnsubscribed', { kind: 'audio' }, {}, participant(THEM));
    });

    expect(speaking()).toEqual([OTHER]);
    await act(async () => tree.unmount());
  });
});

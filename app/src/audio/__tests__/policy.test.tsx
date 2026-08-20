import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { setupIOSAudioManagement } from '@livekit/react-native';
import { useSessionAudio } from '../useSessionAudio';
import { CALL, IDLE } from '../session';

/**
 * The native observer is told what to write *before* the thing that makes it
 * write, which is the half of the self-mute fix that ordering can get wrong
 * while every value is still correct.
 *
 * `session.test.ts` pins what the policy says. This pins when it is said, and
 * the distinction is the whole bug: the observer runs on the audio worker
 * thread at the engine transition itself, so a policy pushed after
 * `setMicrophoneEnabled` describes a transition that has already happened and
 * the route has already moved. Both orders leave identical state behind, so
 * nothing about the resulting session can catch this — only the call order.
 */

const mics: jest.Mock[] = [];

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
    connect = jest.fn(async () => {});
    disconnect = jest.fn(async () => {});

    constructor() {
      mics.push(this.localParticipant.setMicrophoneEnabled);
    }

    on(event: string, fn: (...args: unknown[]) => void) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }

    removeAllListeners() {
      this.handlers = {};
      return this;
    }
  }

  return { Room, RoomEvent: EVENTS, Track: { Kind: { Audio: 'audio' } } };
});

jest.mock('../../api/http', () => ({
  api: {
    mediaToken: jest.fn(async () => ({
      url: 'wss://media.example',
      token: 'join-credential',
    })),
  },
}));

const setup = setupIOSAudioManagement as jest.Mock;

/** The policy handed to the observer by the most recent push. */
const lastPolicy = () => setup.mock.calls[setup.mock.calls.length - 1][1];

/**
 * Whether the last policy push landed before the last microphone call. Jest
 * stamps every mock invocation with a global sequence number, which is the
 * only way to order calls made on two unrelated mocks.
 */
function policyPushedBeforeMic(mic: jest.Mock): boolean {
  const pushes = setup.mock.invocationCallOrder;
  const calls = mic.mock.invocationCallOrder;
  return pushes[pushes.length - 1] < calls[calls.length - 1];
}

function Probe({ selfMuted }: { selfMuted: boolean }) {
  // `micNeeded` and `anyMicOpen` both true: somebody else is present and
  // capturing, which is the only situation in which the two part company.
  useSessionAudio('room-1', 'chan-1', 'auth-token', selfMuted, true, true);
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

describe('the policy handed to the native observer', () => {
  beforeEach(() => {
    mics.length = 0;
    setup.mockClear();
  });

  it('is a call across a self-mute, and is pushed before the mute', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe selfMuted={false} />);
    });
    await settle();

    // Connected and capturing: nothing interesting yet.
    expect(lastPolicy().playout).toBe(CALL);

    setup.mockClear();
    await act(async () => {
      tree.update(<Probe selfMuted />);
    });
    await settle();

    // The reported bug. Our microphone closes, so the engine drops to
    // playout-only and the observer applies its *playout* value — which has to
    // be the call, because somebody else is still talking. `IDLE` here is a
    // Bluetooth profile handover and an audible tone.
    expect(setup).toHaveBeenCalled();
    expect(lastPolicy().playout).toBe(CALL);
    expect(lastPolicy().playout).not.toBe(IDLE);

    // And in time to be read. The assertion this file exists for.
    expect(policyPushedBeforeMic(mics[0])).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });

  it('is handed back on teardown, rather than left armed as a call', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe selfMuted={false} />);
    });
    await settle();

    await act(async () => {
      tree.unmount();
    });

    // Leaving while somebody was still talking must not leave the observer
    // holding `CALL`: the next engine transition, in no channel at all, would
    // take `playAndRecord` — exclusive, and mono on a Bluetooth route — for
    // nothing.
    expect(lastPolicy().playout).toBe(IDLE);
  });
});

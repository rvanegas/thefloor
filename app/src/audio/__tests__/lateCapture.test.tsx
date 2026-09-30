import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AudioSession } from '@livekit/react-native';
import { useSessionAudio } from '../useSessionAudio';
import { CALL, LISTENING } from '../session';
import { drainEvents, resetDiagnostics } from '../diagnostics';

/**
 * **A release made while a capture is still starting must still release.**
 *
 * A Pause on the device showing the film retakes the microphone, and
 * `setMicrophoneEnabled(true)` takes about 700ms to come back. A Play pressed
 * inside that window releases it again. Until 2026-09-29 the release ran beside
 * the unfinished capture, found no published track, and returned. The capture
 * then landed, and the microphone stayed open under the film with the session
 * back on `PlayAndRecord`. See
 * planning/backlog/a-play-inside-the-pause-can-wedge-the-player.md.
 *
 * `screening.test.tsx` cannot see this: its fake room reports a published
 * track whatever has happened. This one publishes only once the capture's
 * promise resolves, and the test decides when that is.
 */

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

/** Whether the next capture waits for `finishCapture`, and how to finish it. */
const mockMic = {
  hold: false,
  published: false,
  finish: null as null | (() => void),
};

function finishCapture() {
  const finish = mockMic.finish;
  mockMic.finish = null;
  finish?.();
}

interface FakeRoom {
  localParticipant: { setMicrophoneEnabled: jest.Mock; unpublishTrack: jest.Mock };
  fire: (event: string, ...args: unknown[]) => void;
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

  const track = { stopOnMute: true, sid: 'TR_local' };

  class Room {
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    localParticipant = {
      identity: 'acct_me',
      setMicrophoneEnabled: jest.fn(async (on: boolean) => {
        if (!on) return;
        if (!mockMic.hold) {
          mockMic.published = true;
          return;
        }
        await new Promise<void>((resolve) => {
          mockMic.finish = resolve;
        });
        mockMic.published = true;
      }),
      getTrackPublication: () =>
        mockMic.published ? { audioTrack: track } : undefined,
      unpublishTrack: jest.fn(async () => {
        mockMic.published = false;
      }),
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
    !screening,
    true,
    false,
    true,
    true
  );
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
};

const logged = () => drainEvents().map((e) => e.text);
const applied = AudioSession.setAppleAudioConfiguration as jest.Mock;
const lastApplied = () => applied.mock.calls[applied.mock.calls.length - 1][0];

async function mounts(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe screening={false} />);
  });
  await settle();
  return tree;
}

async function screening(tree: ReactTestRenderer, on: boolean): Promise<void> {
  await act(async () => {
    tree.update(<Probe screening={on} />);
  });
  await settle();
}

describe('a release during a capture', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    mockMic.hold = false;
    mockMic.published = false;
    mockMic.finish = null;
    (AppState as unknown as { currentState: string }).currentState = 'active';
    resetDiagnostics();
    applied.mockClear();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  /** A Play pressed inside the pause's retake, which is the backlog entry. */
  it('waits for the capture and then lets the microphone go', async () => {
    const tree = await mounts();
    await screening(tree, true);
    expect(mockMic.published).toBe(false);

    // Pause: the capture starts and does not finish yet.
    mockMic.hold = true;
    await screening(tree, false);
    expect(mockMic.finish).not.toBeNull();
    expect(lastApplied()).toBe(CALL);

    // Play, inside the window.
    const unpublish = mockRooms[0].localParticipant.unpublishTrack;
    unpublish.mockClear();
    await screening(tree, true);
    expect(logged()).toContain('released waits for the transition before it');
    // Not yet: the release must not act on a track that does not exist yet.
    expect(unpublish).not.toHaveBeenCalled();
    expect(lastApplied()).toBe(CALL);

    // The capture lands, and the release follows it.
    await act(async () => {
      finishCapture();
    });
    await settle();

    expect(unpublish).toHaveBeenCalledTimes(1);
    expect(mockMic.published).toBe(false);
    expect(lastApplied()).toBe(LISTENING);

    await act(async () => {
      tree.unmount();
    });
  });

  /** A capture that never finishes holds the release for two seconds only. */
  it('goes ahead after the wait when the capture never finishes', async () => {
    const tree = await mounts();
    await screening(tree, true);
    mockMic.hold = true;
    await screening(tree, false);
    await screening(tree, true);
    expect(lastApplied()).toBe(CALL);

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    await settle();

    expect(
      logged().some((l) => l.includes('released gave up waiting after 2000ms'))
    ).toBe(true);
    expect(lastApplied()).toBe(LISTENING);

    await act(async () => {
      tree.unmount();
    });
  });

  /** An ordinary transition, with nothing before it, does not wait. */
  it('does not wait when the transition before it has settled', async () => {
    const tree = await mounts();
    await screening(tree, true);
    await screening(tree, false);
    await screening(tree, true);

    expect(logged().some((l) => l.includes('waits for the transition'))).toBe(
      false
    );
    expect(lastApplied()).toBe(LISTENING);

    await act(async () => {
      tree.unmount();
    });
  });
});

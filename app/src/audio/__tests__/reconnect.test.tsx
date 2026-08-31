import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSessionAudio, type SessionAudio } from '../useSessionAudio';

/**
 * A room that dropped has to be rebuilt, and nothing used to rebuild it.
 *
 * This is the bug a tester hit by taking a Telegram call mid-conversation:
 * CallKit seizes the audio session, `livekit-client` exhausts its own retries
 * and fires `Disconnected`, and the connect effect — keyed on the room *name*,
 * which has not changed — never runs again. The channel stayed live and its
 * audio stayed dead until the app was force-quit.
 *
 * The regression these guard against is **nothing happening**, which no
 * assertion about the resulting state can catch: a hook that has given up and
 * one that is about to try again look identical from outside for as long as the
 * backoff lasts. So they watch for the attempt itself, by counting the rooms
 * that get constructed.
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
    /**
     * Empty, but present — the real `Room` always has it, and a fake missing it
     * is how the connect path's "how much was already published" count first
     * threw and failed a connection under test. The count now survives a room
     * of any shape; this keeps the ordinary shape honest, so the guard is a
     * belt rather than the only thing holding it up.
     */
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

    /** What the SDK would do to us. */
    fire(event: string, ...args: unknown[]) {
      for (const fn of this.handlers[event] ?? []) fn(...args);
    }
  }

  return {
    Room,
    RoomEvent: EVENTS,
    Track: { Kind: { Audio: 'audio' } },
    // The real enum's value for it. Named here rather than imported because
    // this factory may not reach outside itself, and the number is wire
    // protocol — it is what the SFU puts in the leave message.
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

let latest: SessionAudio;

function Probe() {
  latest = useSessionAudio('room-1', 'chan-1', 'auth-token', false, true, true);
  return null;
}

/** Lets the connect chain's awaits settle without advancing the clock. */
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

describe('a room that drops', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is rebuilt, rather than left for a force-quit to fix', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    await settle();

    expect(mockRooms).toHaveLength(1);
    expect(latest.status).toBe('connected');

    // The SDK giving up, which is the only thing that fires this event.
    await act(async () => {
      mockRooms[0].fire('disconnected');
    });

    // Said out loud, rather than reported as `idle` — which is also what a
    // channel nobody has joined reads as.
    expect(latest.status).toBe('reconnecting');
    expect(mockRooms).toHaveLength(1);

    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await settle();

    // The assertion this whole file exists for.
    expect(mockRooms).toHaveLength(2);
    expect(latest.status).toBe('connected');

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **The one drop that must not be rebuilt**, which is the opposite of
   * everything else in this file and is why it lives next to it.
   *
   * The room admits one participant per identity and the identity is the
   * account, so another of this account's devices entering evicts this one. To
   * the code above that eviction is indistinguishable from a dead network: it
   * rebuilds, which evicts the device that just took the room, which rebuilds
   * in turn. Two screens then trade the conversation on a 500ms-doubling
   * backoff for as long as both are open — which is what "the two devices
   * competed for the audio" sounded like. See planning/TASKS.md, Two Devices
   * In One Channel.
   *
   * Counting rooms for the same reason the rest of the file does, and for the
   * mirror-image regression: here the failure is *something* happening.
   */
  it('is not rebuilt when another device took the room', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    await settle();
    expect(mockRooms).toHaveLength(1);

    await act(async () => {
      mockRooms[0].fire('disconnected', 2);
    });

    // Neither `reconnecting`, which would promise an attempt nothing will
    // make, nor `idle`, which the foreground listener rebuilds from.
    expect(latest.status).toBe('displaced');

    // Well past the backoff the ordinary path would have used, and past
    // several of its doublings.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await settle();

    expect(mockRooms).toHaveLength(1);
    expect(latest.status).toBe('displaced');

    await act(async () => {
      tree.unmount();
    });
  });

  it('is not rebuilt when we are the ones tearing it down', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    await settle();
    expect(mockRooms).toHaveLength(1);

    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    // Leaving a channel must not start a reconnect loop against a room nobody
    // is in: the retry timer is cleared by the same cleanup that disconnects.
    expect(mockRooms).toHaveLength(1);
  });
});

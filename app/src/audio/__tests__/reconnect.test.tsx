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
    // The real enum's values, which are what the SDK emits. These three are
    // the difference between "the SDK has given up" and "the SDK is trying",
    // and the app used to be able to see only the first.
    Reconnecting: 'reconnecting',
    SignalReconnecting: 'signalReconnecting',
    Reconnected: 'reconnected',
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
   * competed for the audio" sounded like. See planning/TWO-DEVICES-WALK.md,
   * which is where that entry went on 2026-09-02.
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

/**
 * **The half-minute this app used to spend certain of a dead connection.**
 *
 * Reported by a user as a screenshot of `OfflineView` — airplane mode on,
 * "Fake" written across *You can still hear the room*. `Disconnected` was the
 * only event that had ever cleared `connected`, and livekit-client fires it
 * only once its own retries are spent, which its default policy spreads over
 * some forty-five seconds; the socket calls itself offline after ten. Between
 * the two the app told people the conversation was still reaching them.
 *
 * So these assert on the moment rather than the eventual state: the status has
 * to change on the event, with no clock advanced at all.
 */
describe('a room whose transport is still trying', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('says so at once, rather than when the SDK gives up', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    await settle();
    expect(latest.status).toBe('connected');

    await act(async () => {
      mockRooms[0].fire('reconnecting');
    });

    // No timer advanced between the event and this line, which is the whole
    // assertion: `OfflineView` reads this on the render straight after.
    expect(latest.status).toBe('reconnecting');

    // And it is still the SDK's attempt, not ours — nothing was rebuilt.
    expect(mockRooms).toHaveLength(1);

    await act(async () => {
      mockRooms[0].fire('reconnected');
    });
    expect(latest.status).toBe('connected');
    expect(mockRooms).toHaveLength(1);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The mirror-image lie, which is the reason this is two events and not one.
   * livekit-client documents `SignalReconnecting` as the signal channel alone
   * dropping, media still flowing, "not noticeable to users most of the time".
   * Acting on it would tell somebody the room was gone while they could hear
   * it — and would then have to be undone by a `Reconnected` that may be a
   * good few seconds away.
   */
  it('stays connected when only the signal channel dropped', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe />);
    });
    await settle();
    expect(latest.status).toBe('connected');

    await act(async () => {
      mockRooms[0].fire('signalReconnecting');
    });

    expect(latest.status).toBe('connected');

    await act(async () => {
      tree.unmount();
    });
  });
});

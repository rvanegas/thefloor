import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AudioSession } from '@livekit/react-native';
import { useSessionAudio } from '../useSessionAudio';
import { CALL, SCREENING } from '../session';
import { drainEvents, resetDiagnostics } from '../diagnostics';

/**
 * **Pausing the film gives the room its voice back, and the session has to
 * hear about it.**
 *
 * `screening` is an input to the one effect that decides what the microphone
 * is doing — `SCREENING` rather than `CALL`, and `muted` rather than
 * `capturing`, for the length of a run. Every route into and out of a run
 * therefore has to reach both halves: the device, and the session.
 *
 * Reported 2026-09-26 as *one pauses and then neither can hear each other*,
 * with stepping out and back in as the cure.
 *
 * **Every case here enters a run rather than starting inside one**, and that is
 * the point rather than tidiness. The first version of this file mounted with
 * `screening` already true, so the *connect* path applied `SCREENING` — and the
 * gap it was written to cover is entirely in the transition, where the
 * `muted` branch was the only writer and wrote nothing. A fixture that begins
 * mid-film cannot see it. `enters()` is that rule, and no case below mounts
 * any other way.
 *
 * **The pause is modelled with the resubscribe beside it, for the same
 * reason.** A party mute is a server-side *unsubscription* — `setSilenced` in
 * `server/src/media.ts` acts on the receiving end — so a run beginning drops
 * every remote track and a pause brings them back. Toggling `screening` alone
 * is not a state this app ever reaches, and a fixture that did so reported a
 * dependency as the whole fault when the resubscribe was already waking that
 * effect by itself.
 */

const mockEngine = { inputAvailable: true };

jest.mock('../engineState', () => ({
  engineSnapshot: jest.fn(() => ({ inputAvailable: mockEngine.inputAvailable })),
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
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  }) as unknown as typeof AppState.addEventListener);
  (AppState as unknown as { currentState: string }).currentState = 'active';
}

interface FakeRoom {
  localParticipant: { setMicrophoneEnabled: jest.Mock };
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

  /** A published microphone, so a `muted` intent has a device to hold. */
  const track = { stopOnMute: true, sid: 'TR_local' };

  class Room {
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    localParticipant = {
      identity: 'acct_me',
      setMicrophoneEnabled: jest.fn(async () => {}),
      getTrackPublication: () => ({ audioTrack: track }),
      unpublishTrack: jest.fn(async () => {}),
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
    true,
    true,
    false,
    true,
    true,
    screening
  );
  return null;
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

const logged = () => drainEvents().map((e) => e.text);

/** What this app wrote to the session itself, as opposed to told the observer. */
const applied = AudioSession.setAppleAudioConfiguration as jest.Mock;
const lastApplied = () => applied.mock.calls[applied.mock.calls.length - 1][0];

const other = { identity: 'acct_them' };
const remote = { kind: 'audio', sid: 'TR_them' };

/**
 * Mounts in a room with somebody else in it and subscribed, which is where a
 * watch party is started from and the only state these cases may begin in.
 * See the header: a fixture that mounts mid-film applies `SCREENING` on the
 * connect path and cannot see what the transition does or fails to do.
 */
async function enters(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe screening={false} />);
  });
  await settle();
  await act(async () => {
    mockRooms[0].fire('trackSubscribed', remote, {}, other);
  });
  await settle();
  return tree;
}

/** The film starts: `screening`, and the server withholds the room. */
async function plays(tree: ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.update(<Probe screening />);
    mockRooms[0].fire('trackUnsubscribed', remote, {}, other);
  });
  await settle();
}

/** The film pauses: the mute lifts, so the subscription comes back. */
async function pauses(tree: ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.update(<Probe screening={false} />);
    mockRooms[0].fire('trackSubscribed', remote, {}, other);
  });
  await settle();
}

describe('a screening device', () => {
  beforeEach(() => {
    mockRooms.length = 0;
    mockEngine.inputAvailable = true;
    captureAppState();
    resetDiagnostics();
    applied.mockClear();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  /**
   * **The one that was missing, and the whole of the 2026-09-26 fault.**
   *
   * A run is entered through the `muted` branch, which wrote nothing to the
   * session for as long as `muted` meant only a self-mute. So `SCREENING` was
   * decided, recorded in `appliedRef`, handed to the native observer — and
   * never applied. Build 295's log has the consequence: the observer's
   * `categoryChange` a second later, `engine stop play=T rec=T`, and no
   * `engine start` for the rest of the session.
   */
  it('writes the session it decided on when the film starts', async () => {
    const tree = await enters();
    expect(lastApplied()).toBe(CALL);

    await plays(tree);

    expect(logged().some((l) => l.includes('muted SCREENING'))).toBe(true);
    // Not merely *decided*. The observer is told through `pushPolicy` either
    // way; this is the other writer, and it is the one whose absence left the
    // pause below with nothing to change back.
    expect(lastApplied()).toBe(SCREENING);

    await act(async () => {
      tree.unmount();
    });
  });

  it('takes the microphone and the call session back when the film pauses', async () => {
    const tree = await enters();
    await plays(tree);
    mockRooms[0].localParticipant.setMicrophoneEnabled.mockClear();

    await pauses(tree);

    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(
      mockRooms[0].localParticipant.setMicrophoneEnabled
    ).toHaveBeenCalledWith(true);
    // The half that was reaching the device and not the session. A microphone
    // unmuted under `SCREENING` is a microphone on a stopped engine.
    expect(lastApplied()).toBe(CALL);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * Twice through, because the first run is the only one the old code got a
   * category change out of — the observer's, which stopped the engine — and
   * every run after it moved nothing at all. A fixture that plays once cannot
   * tell a session that recovers from one that is merely quiet.
   */
  it('survives a second run', async () => {
    const tree = await enters();
    await plays(tree);
    await pauses(tree);
    drainEvents();
    applied.mockClear();

    await plays(tree);
    expect(lastApplied()).toBe(SCREENING);
    await pauses(tree);
    expect(lastApplied()).toBe(CALL);
    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });
});

import React from 'react';
import { AppState } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AudioSession } from '@livekit/react-native';
import { useSessionAudio } from '../useSessionAudio';
import { CALL, LISTENING } from '../session';
import { drainEvents, resetDiagnostics } from '../diagnostics';

/**
 * **A screening device gives its microphone up, and has to get it back when the
 * film stops.**
 *
 * `microphoneNeeded` in core/micNeeded.ts subtracts `isScreening`, so a device
 * showing the film releases the device and the session falls to `LISTENING` —
 * `playback`, which is what lets the film be stereo instead of mono, ducked and
 * voice processed. A pause takes both back. This file is the app-side half of
 * that; `core/__tests__/watchingHere.test.ts` is the predicate.
 *
 * **Reported 2026-09-26 as *one pauses and then neither can hear each other*,
 * and it took three fixes because the first two were argued from the code.**
 * The arrangement that produced it held the microphone through a run and
 * changed the *configuration* instead, to keep the film's stereo without paying
 * the second that releasing a device costs. Changing the configuration stops
 * the audio engine, and nothing restarts it, so a pause put every microphone
 * back onto a dead engine. Releasing and retaking the device is what brings the
 * engine up — which is why the expensive version is the one that works. See
 * decisions/2026-09-26-the-film-keeps-its-stereo.md.
 *
 * **Every case enters a run rather than starting inside one.** Mounting
 * mid-film does the work on the *connect* path, and every fault in this story
 * has been in the transition. `enters()` is that rule and no case below mounts
 * any other way — the first version of this file did, and passed while the bug
 * was live.
 *
 * **The pause carries the resubscribe beside it, for the same reason.** A party
 * mute is a server-side *unsubscription* — `setSilenced` in
 * `server/src/media.ts` acts on the receiving end — so a run beginning drops
 * every remote track and a pause brings them back. A fixture that moved the
 * film alone reported a missing dependency as the whole cause, when the
 * resubscribe was already waking that effect by itself.
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

/**
 * `micNeeded` is `!screening`, which is what `microphoneNeeded` computes and is
 * the whole of how the film reaches this hook — it takes no `screening`
 * parameter, having had one for a few hours on 2026-09-26. `hasAudio` stays
 * true throughout: the device is in the room for the length of the run, which
 * is what makes the session `LISTENING` rather than deactivated.
 */
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
 * See the header: a fixture that mounts mid-film does its work on the connect
 * path and cannot see what the transition does or fails to do.
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

  it('gives the device up and falls to playback when the film starts', async () => {
    const tree = await enters();
    expect(lastApplied()).toBe(CALL);

    await plays(tree);

    // Genuinely released, not held-and-muted: unpublished, which is what lets
    // the session leave `playAndRecord` and is therefore what buys the stereo.
    expect(logged().some((l) => l.includes('released LISTENING'))).toBe(true);
    expect(mockRooms[0].localParticipant.unpublishTrack).toHaveBeenCalled();
    expect(lastApplied()).toBe(LISTENING);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **The reported bug, and the one assertion this whole file exists for.**
   *
   * Under the arrangement that failed, the device was still held here and the
   * session was still `SCREENING`; the pause asked for `CALL`, got no category
   * change because the engine had already stopped, and the room stayed silent.
   * What makes this work is that the category genuinely moves — `playback` back
   * to `playAndRecord` — which restarts the engine on its way.
   */
  it('takes the device and the call session back when the film pauses', async () => {
    const tree = await enters();
    await plays(tree);
    mockRooms[0].localParticipant.setMicrophoneEnabled.mockClear();

    await pauses(tree);

    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(
      mockRooms[0].localParticipant.setMicrophoneEnabled
    ).toHaveBeenCalledWith(true);
    expect(lastApplied()).toBe(CALL);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * Twice through. The engine stop that broke this was permanent — it happened
   * on the first run and every run after it moved no category at all, there
   * being no engine left to move one. So a fixture that plays once cannot tell
   * a session that recovers from one that is merely quiet, and the second run
   * is where the old arrangement was already unrecoverable.
   */
  it('survives a second run', async () => {
    const tree = await enters();
    await plays(tree);
    await pauses(tree);
    drainEvents();
    applied.mockClear();

    await plays(tree);
    expect(lastApplied()).toBe(LISTENING);

    await pauses(tree);
    expect(lastApplied()).toBe(CALL);
    expect(logged().some((l) => l.includes('capturing CALL'))).toBe(true);
    expect(
      mockRooms[0].localParticipant.setMicrophoneEnabled
    ).toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **The session must not be left on `playback` when the run ends by the
   * channel emptying rather than by a pause**, which is the edge the `released`
   * branch's own comment names: letting the device go hands the session back
   * only if this app has nothing left to play. Cheap to state and it is the
   * one route out of a run that is not somebody pressing Pause.
   */
  it('is still on playback while the film runs with nobody else there', async () => {
    const tree = await enters();
    await plays(tree);
    await act(async () => {
      mockRooms[0].fire('participantDisconnected', other);
    });
    await settle();

    expect(lastApplied()).toBe(LISTENING);

    await act(async () => {
      tree.unmount();
    });
  });
});

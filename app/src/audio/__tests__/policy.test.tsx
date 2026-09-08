import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AudioSession, setupIOSAudioManagement } from '@livekit/react-native';
import { useSessionAudio } from '../useSessionAudio';
import { CALL, LISTENING } from '../session';

/**
 * `modules/audio-route` is a local native module and answers nothing under
 * jest. It is mocked rather than left absent because the teardown now calls
 * `releaseSession` through it — the deactivation that tells an interrupted app
 * it may resume — and a hook that reached the real module would throw on the
 * one path every exit from a channel takes.
 */
jest.mock('../../../modules/audio-route', () => ({
  routeSnapshot: jest.fn(() => null),
  routeFault: jest.fn(() => null),
  onRouteChange: jest.fn(() => () => {}),
  releaseSession: jest.fn(async () => null),
  setAllowHapticsDuringRecording: jest.fn(async () => true),
  routeLine: jest.fn(() => ''),
}));

/**
 * The microphone has three states and only one of them transmits, and the
 * difference between the other two is a Bluetooth profile handover.
 *
 * `session.test.ts` pins what the audio policy says. This pins what happens to
 * the *device*: that self-muting does not let go of it, that letting go
 * happens when nobody needs it — including from a self-mute, which is the
 * transition the obvious implementation silently skips — and that the policy
 * is pushed before the call that makes the engine move.
 *
 * The fake below models the one thing that matters and would otherwise be
 * assumed: `mute()` in livekit-client returns early on an already-muted track,
 * so muting a second time cannot release a device however `stopOnMute` is set.
 */

interface FakeTrack {
  stopOnMute: boolean;
  muted: boolean;
  stopped: boolean;
}

interface FakeLocal {
  published: FakeTrack | null;
  setMicrophoneEnabled: jest.Mock;
  unpublishTrack: jest.Mock;
  getTrackPublication: jest.Mock;
}

const locals: FakeLocal[] = [];

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
    localParticipant: FakeLocal & { identity: string };

    constructor() {
      const local: FakeLocal & { identity: string } = {
        identity: 'acct_me',
        published: null,

        // Faithful in the one respect the code depends on: muting an
        // already-muted track does nothing at all, so it can never be the way
        // a device gets released.
        setMicrophoneEnabled: jest.fn(async (enabled: boolean) => {
          if (enabled) {
            if (!local.published) {
              local.published = {
                stopOnMute: false,
                muted: false,
                stopped: false,
              };
            } else {
              local.published.muted = false;
              local.published.stopped = false;
            }
            return;
          }
          const t = local.published;
          if (!t || t.muted) return; // early return — the point of the fake
          t.muted = true;
          if (t.stopOnMute) t.stopped = true;
        }),

        unpublishTrack: jest.fn(async (_track: unknown, stop?: boolean) => {
          if (local.published && stop) local.published.stopped = true;
          local.published = null;
        }),

        getTrackPublication: jest.fn(() =>
          local.published ? { audioTrack: local.published } : undefined
        ),
      };
      this.localParticipant = local;
      locals.push(local);
    }

    connect = jest.fn(async () => {});
    disconnect = jest.fn(async () => {});

    on(event: string, fn: (...args: unknown[]) => void) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }

    removeAllListeners() {
      this.handlers = {};
      return this;
    }
  }

  return {
    Room,
    RoomEvent: EVENTS,
    Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
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

const setup = setupIOSAudioManagement as jest.Mock;
const lastPolicy = () => setup.mock.calls[setup.mock.calls.length - 1][1];

function Probe({
  selfMuted,
  micNeeded = true,
  hasAudio = true,
}: {
  selfMuted: boolean;
  micNeeded?: boolean;
  hasAudio?: boolean;
}) {
  useSessionAudio(
    'room-1',
    'chan-1',
    'auth-token',
    selfMuted,
    micNeeded,
    hasAudio,
    false,
    false,
    false
  );
  return null;
}

/** What this app last wrote to the session itself, as opposed to told the
 * observer. Since the policy became a constant, this is the only thing that
 * moves when the app changes its mind. */
const applied = AudioSession.setAppleAudioConfiguration as jest.Mock;
const lastApplied = () => applied.mock.calls[applied.mock.calls.length - 1][0];

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

/** Mounts connected and capturing, which is where every case below starts. */
async function connected(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe selfMuted={false} />);
  });
  await settle();
  return tree;
}

describe('a self-mute', () => {
  beforeEach(() => {
    locals.length = 0;
    setup.mockClear();
  });

  it('stops transmitting without letting go of the device', async () => {
    const tree = await connected();
    const local = locals[0];
    expect(local.published).not.toBeNull();

    await act(async () => {
      tree.update(<Probe selfMuted />);
    });
    await settle();

    // Muted, and still holding the microphone. The device staying open is the
    // whole point: releasing it is what hands a Bluetooth headset back from
    // the hands-free profile to A2DP, which is audible in both directions.
    expect(local.published).not.toBeNull();
    expect(local.published!.muted).toBe(true);
    expect(local.published!.stopped).toBe(false);
    expect(local.unpublishTrack).not.toHaveBeenCalled();

    await act(async () => {
      tree.unmount();
    });
  });

  it('leaves the session a call, so nothing hands the route over', async () => {
    const tree = await connected();
    applied.mockClear();

    await act(async () => {
      tree.update(<Probe selfMuted />);
    });
    await settle();

    // **Read off what the app applied rather than off the policy**, which is
    // the difference the 2026-09-08 redesign made here: the policy is a
    // constant now, so it says the same thing before and after a mute and
    // cannot be evidence of anything. What matters is unchanged — muting is
    // about what you send, being stepped in is about what you hold, and the
    // category must not move between them.
    if (applied.mock.calls.length > 0) expect(lastApplied()).toBe(CALL);

    await act(async () => {
      tree.unmount();
    });
  });

  it('does not open a microphone that was shut', async () => {
    // Alone and self-muted, then somebody arrives. Publishing a track and
    // muting it a moment later would put a live microphone on the wire for the
    // width of an await, which is the one thing a mute must never do — so this
    // stays shut until the user unmutes and chooses to speak.
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Probe selfMuted micNeeded={false} hasAudio={false} />
      );
    });
    await settle();
    const local = locals[0];
    expect(local.published).toBeNull();

    await act(async () => {
      tree.update(<Probe selfMuted micNeeded hasAudio />);
    });
    await settle();

    expect(local.published).toBeNull();
    expect(local.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);

    await act(async () => {
      tree.unmount();
    });
  });
});

/**
 * **The case that reaches the release is a guest losing their speech grant**,
 * which since 2026-09-08 is the only way a phone with a connection stops
 * needing a microphone. A member stepped in always needs one; a member who
 * stops needing one has stopped being stepped in, and that takes the whole
 * connection with it — the teardown, not this effect.
 *
 * The property under test is unchanged: releasing unpublishes rather than
 * merely stopping, and it happens from a self-mute as well as from capturing.
 */
describe('releasing the microphone', () => {
  beforeEach(() => {
    locals.length = 0;
    setup.mockClear();
  });

  it('happens when this app should have no audio, from capturing', async () => {
    const tree = await connected();
    const local = locals[0];

    await act(async () => {
      tree.update(
        <Probe selfMuted={false} micNeeded={false} hasAudio={true} />
      );
    });
    await settle();

    // Unpublished rather than merely stopped, and the difference is visible
    // from the server: `MediaPlane.audioTracks` filters on track *type*, so a
    // stopped-but-published track still counts, and the usage meter would go
    // on charging a microphone span to somebody who let go of theirs.
    expect(local.published).toBeNull();
    expect(local.unpublishTrack).toHaveBeenCalledWith(expect.anything(), true);

    await act(async () => {
      tree.unmount();
    });
  });

  it('happens from a self-mute too, which muting again cannot do', async () => {
    // The transition the obvious implementation misses: self-muted, then this
    // app loses any business with the audio system. The track is already
    // muted, so flipping `stopOnMute` back on and muting a second time returns
    // early and the device is never let go — the session would hand back to
    // `playback` with the input still running.
    const tree = await connected();
    const local = locals[0];

    await act(async () => {
      tree.update(<Probe selfMuted />);
    });
    await settle();
    expect(local.published!.muted).toBe(true);

    await act(async () => {
      tree.update(
        <Probe selfMuted micNeeded={false} hasAudio={true} />
      );
    });
    await settle();

    expect(local.published).toBeNull();
    expect(local.unpublishTrack).toHaveBeenCalledWith(expect.anything(), true);

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * The remaining crossing between the two configurations, and the only one:
   * somebody in the room who may not publish takes `playback`. It is
   * **exclusive** — a guest's session should resemble a member's in every
   * respect except permission to speak, and letting somebody's podcast play
   * over the voices a guest is listening to would single out the one person
   * who cannot do anything about it.
   */
  it('crosses to the listening configuration, which still mixes with nothing', async () => {
    const tree = await connected();
    applied.mockClear();

    await act(async () => {
      tree.update(
        <Probe selfMuted={false} micNeeded={false} hasAudio={true} />
      );
    });
    await settle();

    expect(lastApplied()).toBe(LISTENING);
    expect(LISTENING.audioCategoryOptions).not.toContain('mixWithOthers');

    await act(async () => {
      tree.unmount();
    });
  });

  /**
   * **The policy is a constant and says the same thing throughout**, which is
   * what makes the release cheap: the observer needs no instruction at the
   * moment somebody goes nearby, because deactivating when both engines stop
   * is already what it was told to do.
   */
  it('arms the observer to deactivate, whatever else is happening', async () => {
    const tree = await connected();

    expect(lastPolicy().recording).toBe(CALL);
    expect(lastPolicy().playout).toBe(LISTENING);
    expect(lastPolicy().deactivateOnStop).toBe(true);

    await act(async () => {
      tree.unmount();
    });
  });
});

import {
  canAnswerKnock,
  canClaimFloor,
  canInviteGuest,
  canManageGuest,
  canPasteClip,
  canStartRecording,
  createChannel,
  reduce,
} from '../channel';
import { FLOOR_CLAIM_DELAY_STEP_MS } from '../constants';
import { inRoom, isGuest, roomOccupants } from '../guests';
import {
  anyMicrophoneOpen,
  channelHasAudio,
  microphoneNeeded,
} from '../micNeeded';
import type { ChannelAction, ChannelState, Guest } from '../types';

/**
 * A guest in the room, and everything they cannot do while they are in it.
 *
 * The design this tests is one sentence — a guest is not a participant — and
 * the value of it is that the prohibitions are enforced by code nobody had to
 * remember to write. So the tests that matter most here are the negative ones,
 * and the way to read them is that none of the refusals below is implemented
 * anywhere: they fall out of the reducer's membership check.
 *
 * The positive half is the exception list, `GUEST_ACTIONS`, and it is short on
 * purpose.
 */

const ALICE = 'user-alice';
const BOB = 'user-bob';
const DANA = 'guest_dana';
const T0 = 1_700_000_000_000;

const guest = (overrides: Partial<Guest> = {}): Guest => ({
  id: DANA,
  name: 'Dana',
  admittedAt: T0,
  maySpeak: false,
  request: 'none',
  ...overrides,
});

/** Alice alone in a channel Bob belongs to. */
const alone = () =>
  createChannel({ id: 'c1', initiator: ALICE, invitees: [BOB], now: T0 });

/** Alice present, Dana admitted. */
function withGuest(overrides: Partial<Guest> = {}): ChannelState {
  return reduce(
    alone(),
    { type: 'GUEST_ENTERED', guest: guest(overrides) },
    T0 + 1_000
  );
}

const act = (state: ChannelState, action: ChannelAction, now = T0 + 2_000) =>
  reduce(state, action, now);

describe('admission', () => {
  it('takes a knock and holds it until somebody answers', () => {
    const knocked = act(alone(), {
      type: 'KNOCKED',
      knock: { id: 'knock_1', name: 'Dana', at: T0 },
    });
    expect(knocked.knocks).toHaveLength(1);
    expect(canAnswerKnock(knocked, ALICE)).toBe(true);

    const answered = act(knocked, {
      type: 'ANSWER_KNOCK',
      userId: ALICE,
      knockId: 'knock_1',
      accept: true,
    });
    expect(answered.knocks).toEqual([]);
    // Accepting does not by itself put anybody in the room: the id and the
    // secret are the server's to mint, and GUEST_ENTERED is what follows.
    expect(answered.guests).toEqual({});
  });

  it('refuses a knock at a room with nobody in it', () => {
    // Nobody to answer means nobody enters, and the page is told rather than
    // left waiting at a door that will never open.
    const empty = act(alone(), { type: 'STEP_OUT', userId: ALICE });
    expect(empty.present).toEqual([]);
    expect(
      act(empty, { type: 'KNOCKED', knock: { id: 'k', name: 'Dana', at: T0 } })
        .knocks
    ).toEqual([]);
  });

  it('lets no guest answer the door for another guest', () => {
    // What keeps a link from being self-propagating.
    const knocked = act(withGuest(), {
      type: 'KNOCKED',
      knock: { id: 'knock_1', name: 'Eve', at: T0 },
    });
    expect(canAnswerKnock(knocked, DANA)).toBe(false);
    expect(
      act(knocked, {
        type: 'ANSWER_KNOCK',
        userId: DANA,
        knockId: 'knock_1',
        accept: true,
      }).knocks
    ).toHaveLength(1);
  });
});

describe('a guest is not a participant', () => {
  it('is in the room without being on the roster', () => {
    const state = withGuest();
    expect(state.participants).toEqual([ALICE, BOB]);
    expect(state.present).toEqual([ALICE]);
    expect(isGuest(state, DANA)).toBe(true);
    expect(inRoom(state, DANA)).toBe(true);
    expect(roomOccupants(state)).toEqual([ALICE, DANA]);
  });

  it('is refused everything nobody granted them, by the membership check', () => {
    // None of these refusals is written anywhere. They are what being absent
    // from `participants` means, which is the entire reason the design is
    // shaped this way — including for the actions added after it.
    const state = withGuest({ maySpeak: true });
    const refusals: ChannelAction[] = [
      { type: 'START_RECORDING', userId: DANA, runId: 'run_1' },
      { type: 'INVITE', userId: DANA, inviteeId: BOB },
      { type: 'SET_NAME', userId: DANA, name: 'Mine now' },
      { type: 'SET_DESCRIPTION', userId: DANA, description: 'Mine now' },
      { type: 'DELETE_CHANNEL', userId: DANA },
      { type: 'LEAVE_CHANNEL', userId: DANA },
      { type: 'PLAY', userId: DANA },
      { type: 'SET_VOLUME', userId: DANA, volume: 0.1 },
      { type: 'CLEAR_TRACK', userId: DANA },
    ];
    for (const action of refusals) {
      expect(act(state, action)).toBe(state);
    }
    expect(canStartRecording(state, DANA)).toBe(false);
    expect(canInviteGuest(state, DANA)).toBe(false);
  });

  it('may do the handful of things the capability list grants', () => {
    const state = withGuest({ maySpeak: true });

    const muted = act(state, {
      type: 'SET_SELF_MUTE',
      userId: DANA,
      muted: true,
    });
    expect(muted.selfMuted[DANA]).toBe(true);

    expect(canPasteClip(state, DANA)).toBe(true);
    const pasted = act(state, {
      type: 'PASTE_CLIP',
      userId: DANA,
      clip: {
        id: 'clip_1',
        authorId: DANA,
        pastedAt: T0,
        kind: 'text',
        text: 'https://example.com',
      },
    });
    expect(pasted.clip?.authorId).toBe(DANA);

    const gone = act(state, { type: 'STEP_OUT', userId: DANA });
    expect(gone.guests).toEqual({});
    // Their membership was never a thing to lose, so the roster is untouched.
    expect(gone.participants).toEqual([ALICE, BOB]);
  });
});

describe('the floor, with a guest at it', () => {
  it('is claimable by a guest, and silences the member who is not holding it', () => {
    const state = withGuest({ maySpeak: true });
    expect(canClaimFloor(state, DANA, T0 + 2_000)).toBe(true);

    const claimed = act(state, { type: 'CLAIM_FLOOR', userId: DANA });
    expect(claimed.floor.holder).toBe(DANA);
    expect(canClaimFloor(claimed, ALICE, T0 + 2_000)).toBe(false);
  });

  it('ranks a guest in the claim ladder like anybody else', () => {
    // Whoever spoke longest ago waits nothing. A guest who has never claimed
    // is in that group, and a member who just spoke waits a step.
    let state = withGuest({ maySpeak: true });
    state = act(state, { type: 'CLAIM_FLOOR', userId: ALICE });
    state = act(state, { type: 'RELEASE_FLOOR', userId: ALICE }, T0 + 3_000);

    expect(canClaimFloor(state, DANA, T0 + 3_000)).toBe(true);
    expect(canClaimFloor(state, ALICE, T0 + 3_000)).toBe(false);
    expect(
      canClaimFloor(state, ALICE, T0 + 3_000 + FLOOR_CLAIM_DELAY_STEP_MS)
    ).toBe(true);
  });

  it('releases a claim held by a guest who leaves', () => {
    // The same rule a departing member gets, and for the same reason: whoever
    // is left must not be silenced by somebody who is no longer in the room.
    const claimed = act(withGuest({ maySpeak: true }), {
      type: 'CLAIM_FLOOR',
      userId: DANA,
    });
    const gone = act(claimed, { type: 'STEP_OUT', userId: DANA });
    expect(gone.floor.holder).toBeNull();
  });

  it('will not let a guest claim a room they are alone in', () => {
    // Which cannot happen, since the last member leaving takes the guests with
    // them — stated anyway, because the claim rule is about who can hear you.
    const state = withGuest({ maySpeak: true });
    const empty = act(state, { type: 'STEP_OUT', userId: ALICE });
    expect(empty.guests).toEqual({});
  });
});

describe('the microphone', () => {
  it('opens for a member alone with a guest', () => {
    // The failure this prevents is silent: a member talking to somebody who is
    // demonstrably there, into a microphone that was never opened.
    expect(microphoneNeeded(alone(), ALICE)).toBe(false);
    expect(microphoneNeeded(withGuest(), ALICE)).toBe(true);
  });

  it('stays shut for a guest nobody has granted it to', () => {
    const state = withGuest();
    expect(microphoneNeeded(state, DANA)).toBe(false);
    // Both rules agree here, by different routes: Alice's microphone is open,
    // and Dana is in the room whether hers is or not.
    expect(anyMicrophoneOpen(state)).toBe(true);
    expect(channelHasAudio(state, ALICE)).toBe(true);

    const granted = act(state, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: true,
    });
    expect(microphoneNeeded(granted, DANA)).toBe(true);
  });

  it('counts a speaking guest when the audio session is decided', () => {
    // The default rule. Everybody muted but the guest: the session is still a
    // call, because somebody in this room is capturing. Muting the guest too
    // hands the route back.
    let state = withGuest({ maySpeak: true });
    state = act(state, { type: 'SET_SELF_MUTE', userId: ALICE, muted: true });
    expect(anyMicrophoneOpen(state)).toBe(true);

    state = act(state, { type: 'SET_SELF_MUTE', userId: DANA, muted: true });
    expect(anyMicrophoneOpen(state)).toBe(false);
  });

  it('counts a guest as audio however muted the room gets', () => {
    // And the same sequence under `steadyHeadset`, where a guest in the room
    // is somebody who can be heard and mutes are not consulted at all. The
    // second mute is where the two rules part: this is the row the setting is
    // about, seen through a guest rather than a member.
    let state = withGuest({ maySpeak: true });
    state = act(state, { type: 'SET_SELF_MUTE', userId: ALICE, muted: true });
    expect(channelHasAudio(state, ALICE)).toBe(true);

    state = act(state, { type: 'SET_SELF_MUTE', userId: DANA, muted: true });
    expect(channelHasAudio(state, ALICE)).toBe(true);
  });
});

describe('managing a guest', () => {
  it('grants and withdraws the microphone without ejecting anybody', () => {
    const state = withGuest();
    expect(canManageGuest(state, ALICE, DANA)).toBe(true);

    const granted = act(state, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: true,
    });
    expect(granted.guests[DANA].maySpeak).toBe(true);

    const withdrawn = act(granted, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: false,
    });
    expect(withdrawn.guests[DANA].maySpeak).toBe(false);
    expect(inRoom(withdrawn, DANA)).toBe(true);
  });

  it('lets no guest grant themselves anything', () => {
    const state = withGuest();
    expect(canManageGuest(state, DANA, DANA)).toBe(false);
    expect(
      act(state, {
        type: 'SET_GUEST_SPEECH',
        userId: DANA,
        guestId: DANA,
        maySpeak: true,
      })
    ).toBe(state);
  });

  it('ejects', () => {
    const state = withGuest({ maySpeak: true });
    const ejected = act(state, {
      type: 'EJECT_GUEST',
      userId: ALICE,
      guestId: DANA,
    });
    expect(ejected.guests).toEqual({});
    expect(inRoom(ejected, DANA)).toBe(false);
  });
});

describe('asking for the microphone', () => {
  it('is asked, answered, and remembered as answered', () => {
    let state = withGuest();
    state = act(state, { type: 'REQUEST_SPEECH', userId: DANA });
    expect(state.guests[DANA].request).toBe('asking');

    // A refusal is kept as one. Somebody waiting for an answer and somebody
    // who has had one are not in the same position, and a page that showed
    // them the same thing would leave the first waiting for ever.
    const refused = act(state, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: false,
    });
    expect(refused.guests[DANA].request).toBe('refused');

    const granted = act(state, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: true,
    });
    expect(granted.guests[DANA].maySpeak).toBe(true);
    expect(granted.guests[DANA].request).toBe('none');

    // And withdrawing later leaves them able to ask again rather than reading
    // as somebody who was told no.
    const withdrawn = act(granted, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: false,
    });
    expect(withdrawn.guests[DANA].request).toBe('none');
  });

  it('is not something a member can do', () => {
    const state = withGuest();
    expect(act(state, { type: 'REQUEST_SPEECH', userId: ALICE })).toBe(state);
  });
});

describe('a guest and a connection', () => {
  it('survives a flap, and goes when the grace runs out', () => {
    let state = withGuest({ maySpeak: true });
    state = act(state, { type: 'DISCONNECTED', userId: DANA }, T0 + 2_000);
    expect(state.disconnectedAt[DANA]).toBe(T0 + 2_000);
    expect(inRoom(state, DANA)).toBe(true);

    const back = act(state, { type: 'CONNECTED', userId: DANA }, T0 + 3_000);
    expect(back.disconnectedAt[DANA]).toBeUndefined();
    expect(inRoom(back, DANA)).toBe(true);

    const expired = reduce(state, { type: 'TICK' }, T0 + 120_000);
    expect(inRoom(expired, DANA)).toBe(false);
    // And the clock goes with them, or the tick would fire on it for ever.
    expect(expired.disconnectedAt[DANA]).toBeUndefined();
  });
});

describe('the last member out', () => {
  it('takes the guests and the knocks with them', () => {
    // The rule the whole admission design rests on: nobody is admitted without
    // a member present, so nobody remains in a room with no member in it. A
    // stranger left alone in a channel would hear whoever walked in next,
    // admitted by somebody who has gone.
    let state = withGuest({ maySpeak: true });
    state = act(state, {
      type: 'KNOCKED',
      knock: { id: 'knock_1', name: 'Eve', at: T0 },
    });
    state = act(state, { type: 'CLAIM_FLOOR', userId: DANA });

    const empty = act(state, { type: 'STEP_OUT', userId: ALICE });
    expect(empty.present).toEqual([]);
    expect(empty.guests).toEqual({});
    expect(empty.knocks).toEqual([]);
    expect(empty.floor.holder).toBeNull();
  });
});

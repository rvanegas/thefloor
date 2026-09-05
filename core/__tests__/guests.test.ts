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
import { MAX_DISPLAY_NAME_LENGTH } from '../constants';
import { inRoom, isGuest, roomOccupants } from '../guests';
import {
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

describe('the floor, with a guest in the room', () => {
  it('is not a guest’s to take, however audible they are', () => {
    // Reversed on 2026-08-30. A claim is not permission to speak — this guest
    // can already talk — it is a demand that everybody else be silent, and a
    // stranger does not get to mute the people who let them in.
    const state = withGuest({ maySpeak: true });
    expect(canClaimFloor(state, DANA, T0 + 2_000)).toBe(false);

    const refused = act(state, { type: 'CLAIM_FLOOR', userId: DANA });
    expect(refused).toBe(state);
    expect(refused.floor.holder).toBeNull();
  });

  it('is claimable by a member alone with a guest', () => {
    // The count that survives being about the room: there is somebody here to
    // be quiet, and they are exactly who the claim is for.
    expect(canClaimFloor(withGuest({ maySpeak: true }), ALICE, T0 + 2_000)).toBe(
      true
    );
    // Nobody else in the room at all, and the control goes away.
    expect(canClaimFloor(alone(), ALICE, T0 + 2_000)).toBe(false);
  });

  it('keeps a guest out of the claim ladder', () => {
    // The queue is members only. A guest has never claimed, so ranking them
    // would read as having spoken longest ago and put a step in front of every
    // member who has — a wait behind somebody who can never take the turn.
    let state = withGuest({ maySpeak: true });
    state = act(state, { type: 'CLAIM_FLOOR', userId: ALICE });
    state = act(state, { type: 'RELEASE_FLOOR', userId: ALICE }, T0 + 3_000);

    expect(canClaimFloor(state, DANA, T0 + 3_000)).toBe(false);
    // Alice is the only one in the queue, so she is at the front of it.
    expect(canClaimFloor(state, ALICE, T0 + 3_000)).toBe(true);
  });

  it('releases a claim held by a guest who leaves', () => {
    // Unreachable now that a guest cannot claim, and kept deliberately: a
    // state blob written before that change can still name a guest as the
    // holder, and whoever is left must not be silenced by somebody who is no
    // longer in the room. Constructed rather than claimed, since claiming is
    // the very thing that is refused.
    const state = withGuest({ maySpeak: true });
    const claimed: ChannelState = {
      ...state,
      floor: { ...state.floor, holder: DANA, claimedAt: T0 + 2_000 },
    };
    const gone = act(claimed, { type: 'STEP_OUT', userId: DANA });
    expect(gone.floor.holder).toBeNull();
  });

  it('takes the guests out with the last member', () => {
    // Which is what makes “a guest alone in a room” unreachable rather than
    // merely refused — the claim rule above is about who can hear you.
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
    // Dana is in the room whether her microphone is open or not, which is what
    // makes this a call.
    expect(channelHasAudio(state, ALICE)).toBe(true);

    const granted = act(state, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: DANA,
      maySpeak: true,
    });
    expect(microphoneNeeded(granted, DANA)).toBe(true);
  });

  it('counts a guest as audio however muted the room gets', () => {
    // A guest in the room is somebody who can be heard, and mutes are not
    // consulted at all. There was a second rule until 2026-09-05 that parted
    // company from this one on the second mute — it handed the route back once
    // everybody was muted — and this is the case that used to be the pair to
    // it, seen through a guest rather than a member.
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

describe('asking a guest to be a contact', () => {
  it('records the ask against the member who made it', () => {
    // Being in a channel together is permission to ask — the rule members
    // already have between themselves, reaching the one person in the room it
    // could not name.
    const asked = act(withGuest(), {
      type: 'ASK_GUEST_CONTACT',
      userId: ALICE,
      guestId: DANA,
    });
    expect(asked.guests[DANA]?.asks).toEqual({ [ALICE]: 'asking' });
  });

  it('reads a guest who has never been asked as nobody having asked', () => {
    // The field is optional on the wire, so every reader takes the absent case.
    expect(withGuest().guests[DANA]?.asks).toBeUndefined();
  });

  it('will not ask twice, or ask again after being told no', () => {
    let state = act(withGuest(), {
      type: 'ASK_GUEST_CONTACT',
      userId: ALICE,
      guestId: DANA,
    });
    expect(act(state, { type: 'ASK_GUEST_CONTACT', userId: ALICE, guestId: DANA }))
      .toBe(state);

    state = act(state, { type: 'REFUSE_CONTACT', userId: DANA, askerId: ALICE });
    expect(state.guests[DANA]?.asks).toEqual({ [ALICE]: 'refused' });
    // Asking again is not a way to have a refusal re-answered.
    expect(act(state, { type: 'ASK_GUEST_CONTACT', userId: ALICE, guestId: DANA }))
      .toBe(state);
  });

  it('refuses a member who is not in the room, and a guest asking at all', () => {
    // `canManageGuest`, which is the same entitlement rather than a new one:
    // Bob belongs to the channel but is not in the conversation.
    const state = withGuest();
    expect(act(state, { type: 'ASK_GUEST_CONTACT', userId: BOB, guestId: DANA }))
      .toBe(state);
    // And a guest is refused by the wall every prohibition rests on: the
    // action is not in GUEST_ACTIONS.
    expect(act(state, { type: 'ASK_GUEST_CONTACT', userId: DANA, guestId: DANA }))
      .toBe(state);
  });

  it('answers one member’s ask without answering another’s', () => {
    // Two people may each ask, and each is owed their own answer.
    let state = withGuest();
    state = act(state, { type: 'ASK_GUEST_CONTACT', userId: ALICE, guestId: DANA });
    state = act(state, { type: 'ENTER', userId: BOB });
    state = act(state, { type: 'ASK_GUEST_CONTACT', userId: BOB, guestId: DANA });
    state = act(state, { type: 'REFUSE_CONTACT', userId: DANA, askerId: ALICE });

    expect(state.guests[DANA]?.asks).toEqual({
      [ALICE]: 'refused',
      [BOB]: 'asking',
    });
  });

  it('lets nobody refuse an ask that was never made, or refuse for a guest', () => {
    const state = act(withGuest(), {
      type: 'ASK_GUEST_CONTACT',
      userId: ALICE,
      guestId: DANA,
    });
    expect(act(state, { type: 'REFUSE_CONTACT', userId: DANA, askerId: BOB }))
      .toBe(state);
    // A member has no seat to refuse from.
    expect(act(state, { type: 'REFUSE_CONTACT', userId: ALICE, askerId: ALICE }))
      .toBe(state);
  });
});

describe('a guest’s name', () => {
  it('is theirs to change, at any time', () => {
    const renamed = act(withGuest(), {
      type: 'SET_GUEST_NAME',
      userId: DANA,
      name: '  Robert  ',
    });
    expect(renamed.guests[DANA]?.name).toBe('Robert');
  });

  it('is not clearable, and not a member’s to change', () => {
    const state = withGuest();
    expect(act(state, { type: 'SET_GUEST_NAME', userId: DANA, name: '   ' }))
      .toBe(state);
    // Nothing routes a member here — the actor comes from the connection — and
    // there is no seat of theirs to rename either way.
    expect(act(state, { type: 'SET_GUEST_NAME', userId: ALICE, name: 'Mine' }))
      .toBe(state);
  });

  it('takes the same cap the door does', () => {
    const renamed = act(withGuest(), {
      type: 'SET_GUEST_NAME',
      userId: DANA,
      name: 'R'.repeat(MAX_DISPLAY_NAME_LENGTH + 10),
    });
    expect(renamed.guests[DANA]?.name).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it('may be one somebody else in the room already has', () => {
    // There is no namespace here: nothing is unique, nothing is looked up by a
    // name, and a recording is keyed on the identity rather than the label. So
    // there is no clash to detect and none is reported.
    const state = act(withGuest(), {
      type: 'SET_GUEST_NAME',
      userId: DANA,
      name: 'Alice',
    });
    expect(state.guests[DANA]?.name).toBe('Alice');
  });
});

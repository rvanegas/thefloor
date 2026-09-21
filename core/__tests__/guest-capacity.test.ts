import {
  canAnswerKnock,
  canManageGuest,
  canRequestSpeech,
  createChannel,
  reduce,
} from '../channel';
import { MAX_CHANNEL_GUESTS, MAX_SPEAKING_GUESTS } from '../constants';
import { guestCount, speakingGuests } from '../guests';
import type { ChannelAction, ChannelState, Guest } from '../types';

/**
 * What a full room refuses, and what it must go on allowing.
 *
 * Two ceilings, and they are checked in different places for reasons the
 * reducer explains at each one: the room's forty at `GUEST_ENTERED`, because
 * that is the only action every arrival passes through, and the two
 * microphones at the guest's *ask*, so that a full room has no ask in it
 * rather than a member having to refuse one.
 *
 * The tests worth reading here are the ones asserting what still works at the
 * ceiling. A capacity check put one guard too high — in `canManageGuest`,
 * which `SET_GUEST_SPEECH`, `EJECT_GUEST` and `ASK_GUEST_CONTACT` all share —
 * would leave a full room unable to eject anybody, which is exactly the room
 * that most needs to.
 */

const ALICE = 'user-alice';
const BOB = 'user-bob';
const T0 = 1_700_000_000_000;

const guest = (id: string, overrides: Partial<Guest> = {}): Guest => ({
  id,
  name: id,
  admittedAt: T0,
  maySpeak: false,
  request: 'none',
  ...overrides,
});

/** Alice present, Bob a member who has not come. */
const alone = () =>
  createChannel({ id: 'c1', initiator: ALICE, invitees: [BOB], now: T0 });

const act = (state: ChannelState, action: ChannelAction, now = T0 + 2_000) =>
  reduce(state, action, now);

/** A room holding `n` guests, none of whom has the microphone. */
function withGuests(n: number): ChannelState {
  let state = alone();
  for (let i = 0; i < n; i += 1) {
    state = act(state, { type: 'GUEST_ENTERED', guest: guest(`guest_${i}`) });
  }
  return state;
}

/** A room whose two microphones are both spoken for. */
function withSpeakers(): ChannelState {
  let state = withGuests(3);
  for (const id of ['guest_0', 'guest_1']) {
    state = act(state, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: id,
      maySpeak: true,
    });
  }
  return state;
}

describe('the room holds forty guests', () => {
  it('admits the fortieth and refuses the forty-first', () => {
    const full = withGuests(MAX_CHANNEL_GUESTS);
    expect(guestCount(full)).toBe(MAX_CHANNEL_GUESTS);

    const overflowing = act(full, {
      type: 'GUEST_ENTERED',
      guest: guest('guest_late'),
    });
    expect(overflowing.guests['guest_late']).toBeUndefined();
    expect(guestCount(overflowing)).toBe(MAX_CHANNEL_GUESTS);
  });

  it('lets a guest already in the room reconnect into a full one', () => {
    // The case the cap is most likely to break. `GUEST_ENTERED` is the
    // re-entry path as well as the arrival path, so a guest whose page blips
    // — which happens on every deploy — must not be refused a room they are
    // standing in and counted in.
    const full = withGuests(MAX_CHANNEL_GUESTS);
    const again = act(full, {
      type: 'GUEST_ENTERED',
      guest: guest('guest_0', { name: 'Dana' }),
    });
    expect(again.guests['guest_0'].name).toBe('Dana');
    expect(guestCount(again)).toBe(MAX_CHANNEL_GUESTS);
  });

  it('takes the control off a member rather than refusing the tap', () => {
    // The refusal lives in `GUEST_ENTERED`; this is the half that means a
    // member never taps *answer* and is told no afterwards.
    expect(canAnswerKnock(withGuests(MAX_CHANNEL_GUESTS - 1), ALICE)).toBe(true);
    expect(canAnswerKnock(withGuests(MAX_CHANNEL_GUESTS), ALICE)).toBe(false);
  });

  it('frees a place when somebody leaves', () => {
    const full = withGuests(MAX_CHANNEL_GUESTS);
    const left = act(full, { type: 'GUEST_GONE', guestId: 'guest_0' });
    const arrived = act(left, {
      type: 'GUEST_ENTERED',
      guest: guest('guest_late'),
    });
    expect(arrived.guests['guest_late']).toBeDefined();
    expect(guestCount(arrived)).toBe(MAX_CHANNEL_GUESTS);
  });
});

describe('two guests hold microphones', () => {
  it('refuses the third ask, and says so before it is made', () => {
    const full = withSpeakers();
    expect(speakingGuests(full)).toBe(MAX_SPEAKING_GUESTS);
    expect(canRequestSpeech(full, 'guest_2')).toBe(false);

    const asked = act(full, { type: 'REQUEST_SPEECH', userId: 'guest_2' });
    expect(asked.guests['guest_2'].request).toBe('none');
  });

  it('allows the ask while a slot is free', () => {
    const one = act(withGuests(3), {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: 'guest_0',
      maySpeak: true,
    });
    expect(canRequestSpeech(one, 'guest_2')).toBe(true);

    const asked = act(one, { type: 'REQUEST_SPEECH', userId: 'guest_2' });
    expect(asked.guests['guest_2'].request).toBe('asking');
  });

  it('refuses a third grant out of the blue', () => {
    // The second lock. A member is not meant to reach it — the ask is gone by
    // then — but a grant needs no ask behind it, so this is the way in.
    const full = withSpeakers();
    const granted = act(full, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: 'guest_2',
      maySpeak: true,
    });
    expect(granted.guests['guest_2'].maySpeak).toBe(false);
    expect(speakingGuests(granted)).toBe(MAX_SPEAKING_GUESTS);
  });

  it('still withdraws and still ejects when full', () => {
    // The refusals a capacity term in `canManageGuest` would have broken.
    const full = withSpeakers();
    expect(canManageGuest(full, ALICE, 'guest_0')).toBe(true);

    const withdrawn = act(full, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: 'guest_0',
      maySpeak: false,
    });
    expect(speakingGuests(withdrawn)).toBe(1);
    expect(canRequestSpeech(withdrawn, 'guest_2')).toBe(true);

    const ejected = act(full, {
      type: 'EJECT_GUEST',
      userId: ALICE,
      guestId: 'guest_0',
    });
    expect(ejected.guests['guest_0']).toBeUndefined();
    expect(speakingGuests(ejected)).toBe(1);
  });

  it('does not let a reconnection restore a third microphone', () => {
    // `maySpeak` comes in from the seat's database row, which remembers a
    // grant across a disconnection. A guest who drops holding it and comes
    // back to a room that filled both slots meanwhile comes back listening.
    const full = withSpeakers();
    const dropped = act(full, { type: 'GUEST_GONE', guestId: 'guest_0' });
    const refilled = act(dropped, {
      type: 'SET_GUEST_SPEECH',
      userId: ALICE,
      guestId: 'guest_2',
      maySpeak: true,
    });
    expect(speakingGuests(refilled)).toBe(MAX_SPEAKING_GUESTS);

    const back = act(refilled, {
      type: 'GUEST_ENTERED',
      guest: guest('guest_0', { maySpeak: true }),
    });
    expect(back.guests['guest_0'].maySpeak).toBe(false);
    expect(speakingGuests(back)).toBe(MAX_SPEAKING_GUESTS);
  });

  it('keeps the microphone of a guest who never lost their place', () => {
    // The other side of it: a blip that does not cost the room a slot must not
    // cost the guest their grant either, or every deploy would silence
    // whoever was speaking.
    const full = withSpeakers();
    const back = act(full, {
      type: 'GUEST_ENTERED',
      guest: guest('guest_0', { maySpeak: true }),
    });
    expect(back.guests['guest_0'].maySpeak).toBe(true);
    expect(speakingGuests(back)).toBe(MAX_SPEAKING_GUESTS);
  });
});

import {
  canAnswerKnock,
  canManageGuest,
  canRequestSpeech,
  canWithdrawGuestInvite,
  createChannel,
  reduce,
} from '../channel';
import { MAX_CHANNEL_GUESTS, MAX_SPEAKING_GUESTS } from '../constants';
import { guestCount, guestsPromised, pendingGuests, speakingGuests } from '../guests';
import type { ChannelAction, ChannelState, Guest, InvitedGuest } from '../types';

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

const invited = (
  id: string,
  overrides: Partial<InvitedGuest> = {}
): InvitedGuest => ({
  id,
  name: id,
  accountId: `acct_${id}`,
  invitedBy: ALICE,
  invitedAt: T0,
  expiresAt: T0 + 6 * 60 * 60 * 1000,
  ...overrides,
});

/** A room with `n` invitations out and nobody in it but Alice. */
function withInvites(n: number): ChannelState {
  let state = alone();
  for (let i = 0; i < n; i += 1) {
    state = act(state, {
      type: 'GUEST_INVITED',
      invited: invited(`guest_${i}`),
    } as ChannelAction);
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
    expect(canAnswerKnock(withGuests(MAX_CHANNEL_GUESTS - 1), ALICE, T0)).toBe(true);
    expect(canAnswerKnock(withGuests(MAX_CHANNEL_GUESTS), ALICE, T0)).toBe(false);
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

describe('an invitation occupies what it promises', () => {
  /*
    **The hole this closes.** The ceiling used to be counted in two places
    that counted different things: the server added the pending rows when an
    invitation was made, and the reducer counted only the room. So forty
    invitations and forty knocks admitted eighty claims on a forty-seat room,
    and thirty-nine people were turned away one at a time on arrival — each
    having been told they were invited.
  */
  it('counts against the forty before anybody walks in', () => {
    const full = withInvites(MAX_CHANNEL_GUESTS);
    expect(guestCount(full)).toBe(0);
    expect(guestsPromised(full, T0)).toBe(MAX_CHANNEL_GUESTS);
    // So the door is shut, though the room is empty of guests.
    expect(canAnswerKnock(full, ALICE, T0)).toBe(false);
  });

  it('is not counted twice by the person it belongs to', () => {
    // The offer and the seat are one `guest_sessions` row. Walking in on your
    // own invitation must convert rather than add, or the last invitee of
    // forty would be refused by their own invitation.
    const full = withInvites(MAX_CHANNEL_GUESTS);
    const walked = act(full, {
      type: 'GUEST_ENTERED',
      guest: guest('guest_0'),
    });
    expect(guestCount(walked)).toBe(1);
    expect(guestsPromised(walked, T0)).toBe(MAX_CHANNEL_GUESTS);
    expect(walked.guestInvites?.guest_0).toBeUndefined();
  });

  it('refuses a stranger at the door of a room that is promised out', () => {
    const full = withInvites(MAX_CHANNEL_GUESTS);
    const walked = act(full, {
      type: 'GUEST_ENTERED',
      guest: guest('somebody-else'),
    });
    expect(guestCount(walked)).toBe(0);
  });

  it('gives the seat back when the offer expires, with nothing having run', () => {
    // Read rather than swept: `core` has no clock, and a timer that has to
    // fire to free a seat is a ceiling held by ghosts on the day it does not.
    const full = withInvites(MAX_CHANNEL_GUESTS);
    const later = T0 + 7 * 60 * 60 * 1000;
    expect(guestsPromised(full, later)).toBe(0);
    expect(canAnswerKnock(full, ALICE, later)).toBe(true);
    expect(pendingGuests(full, later)).toHaveLength(0);
  });

  it('is taken back by any member with the room, full or not', () => {
    // `canManageGuest`'s trap, from the other end: the guard that governs
    // this must never carry a capacity term, because taking an invitation
    // back is how a full room makes space.
    const full = withInvites(MAX_CHANNEL_GUESTS);
    expect(canWithdrawGuestInvite(full, ALICE, 'guest_0', T0)).toBe(true);
    const taken = act(full, {
      type: 'GUEST_INVITE_WITHDRAWN',
      guestId: 'guest_0',
    } as ChannelAction);
    expect(guestsPromised(taken, T0)).toBe(MAX_CHANNEL_GUESTS - 1);
    expect(canAnswerKnock(taken, ALICE, T0)).toBe(true);
  });

  it('is nobody in the room, which every other reader has to agree about', () => {
    // The reason this is a second field rather than an entry in `guests`:
    // everything that asks who is here reads that one, and an invitation
    // announced to the media plane would be a person who never connected.
    const one = withInvites(1);
    expect(guestCount(one)).toBe(0);
    expect(one.guests.guest_0).toBeUndefined();
    expect(one.selfMuted.guest_0).toBeUndefined();
  });
});

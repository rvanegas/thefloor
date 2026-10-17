/**
 * Locking a channel: for good, by whoever may invite, and taking back every
 * offer still standing — so nobody new may come in, as a member or a guest.
 */
import {
  canAnswerKnock,
  canInvite,
  canInviteGuest,
  canJoin,
  canLockChannel,
  canMintMemberLink,
  createChannel,
  isLocked,
  pendingInvitees,
  reduce,
} from '../channel';
import type { ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';
const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const lock = (s: ChannelState, userId = A) => reduce(s, { type: 'LOCK', userId }, T0);

/** A channel A has stepped into, having asked B in, who has not come. */
function asked(): ChannelState {
  const s = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
  return reduce(s, { type: 'ENTER', userId: A } as never, T0);
}

function withOffers(s: ChannelState): ChannelState {
  let next = reduce(
    s,
    {
      type: 'MEMBER_LINK_MADE',
      userId: '',
      link: { id: 'ml_1', invitedBy: A, invitedAt: T0, expiresAt: T0 + 30 * DAY },
    } as never,
    T0
  );
  next = reduce(
    next,
    {
      type: 'GUEST_INVITED',
      userId: '',
      invited: {
        id: 'g_1',
        name: 'Guest',
        accountId: C,
        invitedBy: A,
        invitedAt: T0,
        expiresAt: T0 + DAY,
      },
    } as never,
    T0
  );
  return reduce(
    next,
    { type: 'KNOCKED', userId: '', knock: { id: 'k_1', name: 'Someone', at: T0 } } as never,
    T0
  );
}

describe('locking a channel', () => {
  it('is offered to whoever may invite', () => {
    const s = asked();
    expect(canLockChannel(s, A)).toBe(true);
    expect(isLocked(s)).toBe(false);
  });

  it('takes back every offer still standing, and leaves the members who came', () => {
    const before = withOffers(asked());
    expect(pendingInvitees(before)).toEqual([B]);
    expect(Object.keys(before.memberLinks ?? {})).toHaveLength(1);
    expect(Object.keys(before.guestInvites ?? {})).toHaveLength(1);
    expect(before.knocks).toHaveLength(1);

    const s = lock(before);
    expect(isLocked(s)).toBe(true);
    expect(s.participants).toEqual([A]);
    expect(s.memberLinks).toEqual({});
    expect(s.guestInvites).toEqual({});
    expect(s.knocks).toEqual([]);
  });

  it('refuses every way in afterwards', () => {
    const s = lock(asked());
    expect(canInvite(s, A, C, T0)).toBe(false);
    expect(canMintMemberLink(s, A, T0)).toBe(false);
    expect(canInviteGuest(s, A)).toBe(false);
    expect(canAnswerKnock(s, A, T0)).toBe(false);
    expect(reduce(s, { type: 'INVITE', userId: A, inviteeId: C }, T0)).toBe(s);
    expect(
      reduce(
        s,
        { type: 'KNOCKED', userId: '', knock: { id: 'k_2', name: 'X', at: T0 } } as never,
        T0
      )
    ).toBe(s);
    expect(withOffers(s)).toEqual(s);
  });

  it('cannot be undone, or done twice', () => {
    const s = lock(asked());
    expect(canLockChannel(s, A)).toBe(false);
    expect(lock(s)).toBe(s);
  });

  it('closes a community to its own link', () => {
    let s = createChannel({ id: 's2', initiator: A, invitees: [], now: T0 });
    s = reduce(s, { type: 'MAKE_COMMUNITY', userId: A, name: 'Club' }, T0);
    expect(canJoin(s, C, T0)).toBe(true);
    s = lock(s);
    expect(canJoin(s, C, T0)).toBe(false);
    expect(reduce(s, { type: 'JOIN', userId: C }, T0)).toBe(s);
  });

  it('drops nobody from a pair’s standing channel nobody has entered', () => {
    const s = createChannel({ id: 's3', initiator: A, invitees: [B], now: T0, present: [] });
    expect(pendingInvitees(s)).toEqual([]);
    expect(lock(s).participants).toEqual([A, B]);
  });

  it('is refused to a member of a community who is not its owner', () => {
    let s = createChannel({ id: 's4', initiator: A, invitees: [], now: T0 });
    s = reduce(s, { type: 'MAKE_COMMUNITY', userId: A, name: 'Club' }, T0);
    s = reduce(s, { type: 'JOIN', userId: C }, T0);
    expect(canLockChannel(s, C)).toBe(false);
    expect(lock(s, C)).toBe(s);
  });
});

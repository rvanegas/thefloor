/**
 * Member links: `/m/<username>/<pin>`, which makes whoever follows it first a
 * member of the channel and nothing else. What core owns is that an
 * outstanding link **holds a place** among the members until it is followed,
 * taken back, or expires — so a channel cannot promise more places than it has.
 */
import { MAX_CHANNEL_PARTICIPANTS } from '../constants';
import {
  canInvite,
  canMintMemberLink,
  canWithdrawMemberLink,
  createChannel,
  membersPromised,
  pendingMemberLinks,
  reduce,
} from '../channel';
import type { ChannelState, MemberLink } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const link = (id: string, at = T0): MemberLink => ({
  id,
  invitedBy: A,
  invitedAt: at,
  expiresAt: at + 30 * DAY,
});

function channel(): ChannelState {
  return createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
}

const made = (state: ChannelState, l: MemberLink) =>
  reduce(state, { type: 'MEMBER_LINK_MADE', userId: '', link: l } as never, T0);

/** A channel of `members`, everybody but A having joined by invitation. */
function withMembers(members: number): ChannelState {
  let s = createChannel({ id: 's1', initiator: A, invitees: [], now: T0 });
  for (let i = 1; i < members; i++) {
    s = reduce(s, { type: 'INVITE', userId: A, inviteeId: `user-${i}` }, T0);
  }
  return s;
}

describe('a member link', () => {
  it('holds a place from the moment it is made', () => {
    const s = made(channel(), link('ml_1'));
    expect(membersPromised(s, T0)).toBe(3);
    expect(pendingMemberLinks(s, T0).map((l) => l.id)).toEqual(['ml_1']);
  });

  it('fills a channel that has one place left, for invitations and links alike', () => {
    const s = made(withMembers(MAX_CHANNEL_PARTICIPANTS - 1), link('ml_1'));
    expect(canInvite(s, A, 'user-new', T0)).toBe(false);
    expect(canMintMemberLink(s, A, T0)).toBe(false);
    expect(reduce(s, { type: 'INVITE', userId: A, inviteeId: 'user-new' }, T0)).toBe(s);
  });

  it('gives its place back once it has expired, without anything having run', () => {
    const s = made(withMembers(MAX_CHANNEL_PARTICIPANTS - 1), link('ml_1'));
    const later = T0 + 31 * DAY;
    expect(membersPromised(s, later)).toBe(MAX_CHANNEL_PARTICIPANTS - 1);
    expect(canInvite(s, A, 'user-new', later)).toBe(true);
  });

  it('makes whoever follows it a member, in the place it held', () => {
    const s = reduce(
      made(withMembers(MAX_CHANNEL_PARTICIPANTS - 1), link('ml_1')),
      { type: 'JOIN_BY_LINK', userId: 'user-new', linkId: 'ml_1' },
      T0 + 1_000
    );
    expect(s.participants).toContain('user-new');
    expect(s.participants).toHaveLength(MAX_CHANNEL_PARTICIPANTS);
    expect(s.memberLinks).toBeUndefined();
    expect(s.invitedBy['user-new']).toBe(A);
  });

  it('admits nobody once it has been taken back or has expired', () => {
    const s = made(channel(), link('ml_1'));
    const back = reduce(s, { type: 'MEMBER_LINK_WITHDRAWN', userId: '', linkId: 'ml_1' } as never, T0);
    expect(back.memberLinks).toBeUndefined();
    expect(
      reduce(back, { type: 'JOIN_BY_LINK', userId: 'user-new', linkId: 'ml_1' }, T0)
    ).toBe(back);
    expect(
      reduce(s, { type: 'JOIN_BY_LINK', userId: 'user-new', linkId: 'ml_1' }, T0 + 31 * DAY)
    ).toBe(s);
  });

  it('is not spent by somebody who is a member already', () => {
    const s = made(channel(), link('ml_1'));
    expect(reduce(s, { type: 'JOIN_BY_LINK', userId: B, linkId: 'ml_1' }, T0)).toBe(s);
  });

  it('is not made for a community, which has its own link', () => {
    const solo = createChannel({ id: 's2', initiator: A, invitees: [], now: T0 });
    const community = reduce(solo, { type: 'MAKE_COMMUNITY', userId: A, name: 'Book club' }, T0);
    expect(community.owner).toBe(A);
    expect(canMintMemberLink(community, A, T0)).toBe(false);
  });

  it('may be taken back by any member who may invite, while it stands', () => {
    const s = reduce(made(channel(), link('ml_1')), { type: 'ENTER', userId: B }, T0);
    expect(canWithdrawMemberLink(s, B, 'ml_1', T0)).toBe(true);
    expect(canWithdrawMemberLink(s, 'user-c', 'ml_1', T0)).toBe(false);
    expect(canWithdrawMemberLink(s, A, 'ml_1', T0 + 31 * DAY)).toBe(false);
  });
});

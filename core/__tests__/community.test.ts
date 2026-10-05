import { MAX_CHANNEL_PARTICIPANTS, MAX_COMMUNITY_MEMBERS } from '../constants';
import {
  COMMUNITY_OWNER_ACTIONS,
  autoRecordStarter,
  canClaimFloor,
  canControlWatch,
  canDeleteChannel,
  canEditChannel,
  canInviteGuest,
  canMuteOther,
  canPasteClip,
  canSetSelfMute,
  canStartRecording,
  canStartWatch,
  canInvite,
  canJoin,
  canLeaveChannel,
  canMakeCommunity,
  canMoveToRemove,
  capacityOf,
  createChannel,
  isOwner,
  isParticipant,
  reduce,
  removalMotion,
  removalMovesWanted,
} from '../channel';
import type { ChannelState } from '../types';

const OWNER = 'usr_owner';
const T0 = 1_000_000;
const member = (n: number) => `usr_${n}`;

const make = (s: ChannelState, userId: string, name: string) =>
  reduce(s, { type: 'MAKE_COMMUNITY', userId, name }, T0);

function community(): ChannelState {
  return make(createChannel({ id: 'c1', initiator: OWNER, invitees: [], now: T0 }), OWNER, 'Cafe Products');
}

const join = (s: ChannelState, userId: string) => reduce(s, { type: 'JOIN', userId }, T0);

function communityOf(n: number): ChannelState {
  let s = community();
  for (let i = 1; i < n; i++) s = join(s, member(i));
  return s;
}

describe('a community is a channel made into one by its only member', () => {
  it('is owned by whoever made it, under the name they gave', () => {
    const s = community();
    expect(s.owner).toBe(OWNER);
    expect(s.name).toBe('Cafe Products');
    expect(isOwner(s, OWNER)).toBe(true);
  });

  it('keeps the name the channel has when none is given', () => {
    const base = reduce(
      createChannel({ id: 'c1', initiator: OWNER, invitees: [], now: T0 }),
      { type: 'SET_NAME', userId: OWNER, name: 'Already named' },
      T0
    );
    const s = make(base, OWNER, '  ');
    expect(s.owner).toBe(OWNER);
    expect(s.name).toBe('Already named');
  });

  it('keeps the name the channel has even when another is given', () => {
    const base = reduce(
      createChannel({ id: 'c1', initiator: OWNER, invitees: [], now: T0 }),
      { type: 'SET_NAME', userId: OWNER, name: 'Already named' },
      T0
    );
    const s = make(base, OWNER, 'Something else');
    expect(s.owner).toBe(OWNER);
    expect(s.name).toBe('Already named');
  });

  it('is refused without any name, its page and link being read from one', () => {
    const s = createChannel({ id: 'c1', initiator: OWNER, invitees: [], now: T0 });
    expect(canMakeCommunity(s, OWNER)).toBe(true);
    expect(make(s, OWNER, '')).toBe(s);
  });

  it('cannot be made of a channel with anybody else in it', () => {
    const s = createChannel({ id: 'c1', initiator: OWNER, invitees: ['usr_x'], now: T0 });
    expect(canMakeCommunity(s, OWNER)).toBe(false);
    expect(make(s, OWNER, 'Mine')).toBe(s);
  });

  it('can be made once everybody else has left', () => {
    const two = createChannel({ id: 'c1', initiator: OWNER, invitees: ['usr_x'], now: T0 });
    const alone = reduce(two, { type: 'LEAVE_CHANNEL', userId: 'usr_x' }, T0);
    expect(make(alone, OWNER, 'Mine').owner).toBe(OWNER);
  });

  it('cannot be made twice, nor by somebody outside it', () => {
    const s = community();
    expect(canMakeCommunity(s, OWNER)).toBe(false);
    expect(make(s, OWNER, 'Again')).toBe(s);
    const plain = createChannel({ id: 'c2', initiator: OWNER, invitees: [], now: T0 });
    expect(make(plain, 'usr_x', 'Theirs')).toBe(plain);
  });

  it('is absent from every other channel', () => {
    const s = createChannel({ id: 'c2', initiator: OWNER, invitees: [], now: T0 });
    expect(s.owner).toBeUndefined();
    expect(capacityOf(s)).toBe(MAX_CHANNEL_PARTICIPANTS);
    expect(canJoin(s, 'usr_x')).toBe(false);
    expect(join(s, 'usr_x')).toBe(s);
  });
});

describe('joining by the link', () => {
  it('makes a member with nobody named as having asked', () => {
    const s = join(community(), member(1));
    expect(isParticipant(s, member(1))).toBe(true);
    expect(s.invitedBy[member(1)]).toBeUndefined();
    expect(s.selfMuted[member(1)]).toBe(false);
  });

  it('is refused to somebody already in it', () => {
    const s = join(community(), member(1));
    expect(join(s, member(1))).toBe(s);
  });

  it('runs to twenty, not six, and stops there', () => {
    expect(capacityOf(community())).toBe(MAX_COMMUNITY_MEMBERS);
    const full = communityOf(MAX_COMMUNITY_MEMBERS);
    expect(full.participants).toHaveLength(MAX_COMMUNITY_MEMBERS);
    expect(canJoin(full, 'usr_late')).toBe(false);
    expect(join(full, 'usr_late')).toBe(full);
  });

  it('lifts the cap for invitations too', () => {
    const s = communityOf(MAX_CHANNEL_PARTICIPANTS);
    expect(canInvite(s, OWNER, 'usr_x')).toBe(true);
    expect(canInvite(communityOf(MAX_COMMUNITY_MEMBERS), OWNER, 'usr_x')).toBe(false);
  });
});

describe('what the owner may do that nobody else may', () => {
  it('removes in one move, even in a community of two', () => {
    const s = communityOf(2);
    expect(canMoveToRemove(s, OWNER, member(1), T0)).toBe(true);
    const after = reduce(s, { type: 'MOVE_TO_REMOVE', userId: OWNER, targetId: member(1) }, T0);
    expect(isParticipant(after, member(1))).toBe(false);
    expect(removalMotion(after, member(1), T0)).toBeNull();
  });

  it('is the only one who may move to remove anybody', () => {
    const s = communityOf(4);
    expect(canMoveToRemove(s, member(1), member(2), T0)).toBe(false);
    expect(
      reduce(s, { type: 'MOVE_TO_REMOVE', userId: member(1), targetId: member(2) }, T0)
    ).toBe(s);
  });

  it('cannot be moved against', () => {
    const s = communityOf(4);
    expect(canMoveToRemove(s, member(1), OWNER, T0)).toBe(false);
    expect(removalMovesWanted(s, OWNER, T0)).toBeNull();
    expect(reduce(s, { type: 'MOVE_TO_REMOVE', userId: member(1), targetId: OWNER }, T0)).toBe(s);
  });

  it('deletes at any size, which nobody else may', () => {
    const s = communityOf(5);
    expect(canDeleteChannel(s, member(1))).toBe(false);
    expect(canDeleteChannel(s, OWNER)).toBe(true);
    const after = reduce(s, { type: 'DELETE_CHANNEL', userId: OWNER }, T0);
    expect(after.status).toBe('ended');
  });

  it('cannot leave, which everybody else may', () => {
    const s = communityOf(3);
    expect(canLeaveChannel(s, OWNER)).toBe(false);
    expect(canLeaveChannel(s, member(1))).toBe(true);
    expect(reduce(s, { type: 'LEAVE_CHANNEL', userId: OWNER }, T0)).toBe(s);
  });
});

describe('a community keeps a name', () => {
  it('may be renamed but not cleared', () => {
    let s = reduce(community(), { type: 'SET_NAME', userId: OWNER, name: 'Cafe Products' }, T0);
    s = reduce(s, { type: 'SET_NAME', userId: OWNER, name: 'Cafe' }, T0);
    expect(s.name).toBe('Cafe');
    expect(reduce(s, { type: 'SET_NAME', userId: OWNER, name: '  ' }, T0)).toBe(s);
  });
});

describe('a member of a community, who is not its owner', () => {
  /** The owner and two members, all three in the room. */
  function inTheRoom(): ChannelState {
    let s = communityOf(3);
    for (const id of [OWNER, member(1), member(2)]) {
      s = reduce(s, { type: 'ENTER', userId: id }, T0);
    }
    return s;
  }

  it('mutes themselves, claims the floor, pastes and clears the clipboard', () => {
    const s = inTheRoom();
    expect(canSetSelfMute(s, member(1), true)).toBe(true);
    expect(canClaimFloor(s, member(1), T0)).toBe(true);
    expect(canPasteClip(s, member(1))).toBe(true);
    const claimed = reduce(s, { type: 'CLAIM_FLOOR', userId: member(1) }, T0);
    expect(claimed.floor.holder).toBe(member(1));
  });

  it('cannot rename, describe, invite, record, play, watch or mute anybody else', () => {
    const s = inTheRoom();
    expect(canEditChannel(s, member(1))).toBe(false);
    expect(canInvite(s, member(1), 'usr_new')).toBe(false);
    expect(canInviteGuest(s, member(1))).toBe(false);
    expect(canStartRecording(s, member(1))).toBe(false);
    expect(canStartWatch(s, member(1))).toBe(false);
    expect(canControlWatch(s, member(1))).toBe(false);
    expect(canMuteOther(s, member(1), member(2), true, T0)).toBe(false);
    expect(reduce(s, { type: 'SET_NAME', userId: member(1), name: 'Mine now' }, T0)).toBe(s);
    expect(
      reduce(s, { type: 'SET_DESCRIPTION', userId: member(1), description: 'Mine' }, T0)
    ).toBe(s);
    expect(reduce(s, { type: 'SET_AUTO_RECORD', userId: member(1), autoRecord: true }, T0)).toBe(
      s
    );
  });

  it('leaves the owner every one of those', () => {
    const s = inTheRoom();
    expect(canEditChannel(s, OWNER)).toBe(true);
    expect(canInvite(s, OWNER, 'usr_new')).toBe(true);
    expect(canInviteGuest(s, OWNER)).toBe(true);
    expect(canStartRecording(s, OWNER)).toBe(true);
    expect(canStartWatch(s, OWNER)).toBe(true);
    expect(canMuteOther(s, OWNER, member(2), true, T0)).toBe(true);
  });

  it('is recorded automatically all the same, the owner having turned it on', () => {
    let s = communityOf(2);
    s = reduce(s, { type: 'SET_AUTO_RECORD', userId: OWNER, autoRecord: true }, T0);
    s = reduce(s, { type: 'STEP_OUT', userId: OWNER }, T0);
    s = reduce(s, { type: 'ENTER', userId: member(1) }, T0);
    expect(s.present).toEqual([member(1)]);
    expect(autoRecordStarter(s)).toBe(member(1));
  });

  it('leaves a flat channel as it was: everybody holds the controls', () => {
    let s = createChannel({ id: 'f1', initiator: member(1), invitees: [member(2)], now: T0 });
    s = reduce(s, { type: 'ENTER', userId: member(1) }, T0);
    s = reduce(s, { type: 'ENTER', userId: member(2) }, T0);
    expect(canEditChannel(s, member(2))).toBe(true);
    expect(canStartRecording(s, member(2))).toBe(true);
    expect(canInviteGuest(s, member(2))).toBe(true);
  });

  it('is never refused by name the floor, a self-mute, the clipboard or leaving', () => {
    for (const type of [
      'CLAIM_FLOOR',
      'RELEASE_FLOOR',
      'SET_SELF_MUTE',
      'PASTE_CLIP',
      'CLEAR_CLIP',
      'ENTER',
      'STEP_OUT',
      'LEAVE_CHANNEL',
    ] as const) {
      expect(COMMUNITY_OWNER_ACTIONS.has(type)).toBe(false);
    }
  });
});

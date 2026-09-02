import {
  channelOf,
  detailOfNav,
  navOfDetail,
  NO_DETAIL,
  type Detail,
} from '../detail';
import { NOWHERE, pathOf, screenOf } from '../webRoute';

/**
 * The value that replaced the precedence chain, and the one property the chain
 * could not have.
 */

/** Every kind, so a case added to `Detail` and forgotten here is visible. */
const ALL: Detail[] = [
  NO_DETAIL,
  { kind: 'channel', channelId: 'chan_1' },
  { kind: 'profile', id: 'acct_1', name: 'Ada' },
  { kind: 'settings' },
  { kind: 'standings' },
  { kind: 'support' },
];

describe('what is showing', () => {
  it('is whatever was assigned last, whatever it was showing before', () => {
    // The whole of the point. Under the chain this was the bug: a profile
    // outranked a channel, so tapping a channel while a profile was open
    // changed nothing on screen unless the handler remembered to clear it.
    let detail: Detail = { kind: 'profile', id: 'acct_1', name: 'Ada' };
    detail = { kind: 'channel', channelId: 'chan_1' };
    expect(channelOf(detail)).toBe('chan_1');

    // And back the other way, which the chain did get right — a value gets
    // both directions for the same reason it gets neither wrong.
    detail = { kind: 'profile', id: 'acct_2', name: 'Grace' };
    expect(channelOf(detail)).toBeNull();
  });

  it('names a channel only when a channel is what is open', () => {
    for (const detail of ALL) {
      expect(channelOf(detail)).toBe(
        detail.kind === 'channel' ? detail.channelId : null
      );
    }
  });
});

describe('the address', () => {
  it('round-trips every kind that has one', () => {
    for (const detail of ALL) {
      if (detail.kind === 'profile' || detail.kind === 'none') continue;
      expect(detailOfNav(navOfDetail(detail, 'channels'))).toEqual({
        detail,
        list: 'channels',
      });
    }
  });

  it('gives a profile the address of the list beside it', () => {
    const profile: Detail = { kind: 'profile', id: 'acct_1', name: 'Ada' };
    expect(pathOf(screenOf(navOfDetail(profile, 'contacts')))).toBe('/contacts');
    expect(pathOf(screenOf(navOfDetail(profile, 'channels')))).toBe('/');
  });

  it('carries which list is showing independently of what is open', () => {
    for (const detail of ALL) {
      expect(navOfDetail(detail, 'contacts').contactsOpen).toBe(true);
      expect(navOfDetail(detail, 'channels').contactsOpen).toBe(false);
    }
  });

  it('reads a contact-list address as that list and an empty detail', () => {
    expect(detailOfNav({ ...NOWHERE, contactsOpen: true })).toEqual({
      detail: NO_DETAIL,
      list: 'contacts',
    });
  });

  it('puts the channels back for an address that names a screen', () => {
    // `screenOf` prefers the screen, so an address that named both would be
    // showing the screen; leaving the flag set would put the contact list in
    // the pane beside it, which is not what the address said.
    expect(
      detailOfNav({ ...NOWHERE, channelId: 'chan_1', contactsOpen: true })
    ).toEqual({
      detail: { kind: 'channel', channelId: 'chan_1' },
      list: 'channels',
    });
  });

  it('reads home as the channels, with nothing open', () => {
    expect(detailOfNav(NOWHERE)).toEqual({
      detail: NO_DETAIL,
      list: 'channels',
    });
  });
});

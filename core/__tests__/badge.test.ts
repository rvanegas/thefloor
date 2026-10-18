import { badgeCount } from '../badge';

const room = (channelId: string, presentCount: number) => ({
  channelId,
  presentCount,
});

describe('badgeCount', () => {
  it('is nought for a Home with nothing waiting', () => {
    expect(badgeCount({ contacts: [], invites: [], rejoinable: [] }, [])).toBe(0);
  });

  it('counts requests you can answer, and not the ones you sent', () => {
    const contacts = [
      { status: 'incoming' },
      { status: 'incoming' },
      { status: 'outgoing' },
      { status: 'accepted' },
    ];
    expect(badgeCount({ contacts, invites: [], rejoinable: [] }, [])).toBe(2);
  });

  it('counts every invitation', () => {
    expect(
      badgeCount({ contacts: [], invites: [{}, {}, {}], rejoinable: [] }, [])
    ).toBe(3);
  });

  it('counts the rooms with somebody in them, and not the empty ones', () => {
    const rejoinable = [room('a', 2), room('b', 0), room('c', 1)];
    expect(badgeCount({ contacts: [], invites: [], rejoinable }, [])).toBe(2);
  });

  it('leaves out the room you are standing in yourself', () => {
    const rejoinable = [room('a', 2), room('c', 1)];
    expect(badgeCount({ contacts: [], invites: [], rejoinable }, ['a'])).toBe(1);
  });

  it('adds the three together', () => {
    expect(
      badgeCount(
        {
          contacts: [{ status: 'incoming' }],
          invites: [{}],
          rejoinable: [room('a', 1)],
        },
        []
      )
    ).toBe(3);
  });
});

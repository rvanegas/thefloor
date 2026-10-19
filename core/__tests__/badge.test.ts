import { badgeCount } from '../badge';

const contact = (id: string, status = 'accepted') => ({
  account: { id },
  status,
});
const none = new Set<string>();

describe('badgeCount', () => {
  it('is nought for a Home with nothing waiting', () => {
    expect(badgeCount({ contacts: [], invites: [] }, none)).toBe(0);
  });

  it('counts requests you can answer, and not the ones you sent', () => {
    const contacts = [
      contact('a', 'incoming'),
      contact('b', 'incoming'),
      contact('', 'outgoing'),
      contact('c'),
    ];
    expect(badgeCount({ contacts, invites: [] }, none)).toBe(2);
  });

  it('counts every invitation', () => {
    expect(badgeCount({ contacts: [], invites: [{}, {}, {}] }, none)).toBe(3);
  });

  it('counts the contacts who are about, and not the others', () => {
    const contacts = [contact('a'), contact('b'), contact('c')];
    expect(badgeCount({ contacts, invites: [] }, new Set(['a', 'c']))).toBe(2);
  });

  it('counts nobody who is about but is not a contact', () => {
    const contacts = [contact('a'), contact('b', 'incoming')];
    // `b` is counted once, as a request, and `z` is a stranger.
    expect(
      badgeCount({ contacts, invites: [] }, new Set(['b', 'z']))
    ).toBe(1);
  });

  it('adds the three together', () => {
    expect(
      badgeCount(
        {
          contacts: [contact('a', 'incoming'), contact('b')],
          invites: [{}],
        },
        new Set(['b'])
      )
    ).toBe(3);
  });
});

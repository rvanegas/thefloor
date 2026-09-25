import { inviteOfUrl } from '../useInviteLink';

/**
 * The matcher that turns the invite page's *Open in the app* into an
 * invitation this app can spend.
 *
 * What is worth testing is the refusals rather than the happy case: this reads
 * a string handed over by the operating system, from a page that may be older
 * than the app, and every wrong answer is either a silently dropped invitation
 * or a pin sent somewhere it should not go.
 */
describe('inviteOfUrl', () => {
  it('reads both halves out of the link the invite page writes', () => {
    expect(inviteOfUrl('thefloor://i/annak/042317')).toEqual({
      username: 'annak',
      pin: '042317',
    });
  });

  it('keeps a leading zero, the pin being a string and not a number', () => {
    // `042317` and `42317` are different pins — see `invite_pins` in db.ts.
    expect(inviteOfUrl('thefloor://i/annak/000123')?.pin).toBe('000123');
  });

  it('decodes each half exactly once', () => {
    expect(inviteOfUrl('thefloor://i/anna%5Fk/042317')?.username).toBe('anna_k');
  });

  it('ignores a query and a fragment', () => {
    expect(inviteOfUrl('thefloor://i/annak/042317?from=mail')).toEqual({
      username: 'annak',
      pin: '042317',
    });
    expect(inviteOfUrl('thefloor://i/annak/042317#x')?.pin).toBe('042317');
  });

  it('wants both halves and refuses a partial link', () => {
    expect(inviteOfUrl('thefloor://i/annak')).toBeNull();
    expect(inviteOfUrl('thefloor://i/annak/')).toBeNull();
    expect(inviteOfUrl('thefloor://i//042317')).toBeNull();
    expect(inviteOfUrl('thefloor://i/')).toBeNull();
    expect(inviteOfUrl(null)).toBeNull();
  });

  it('answers no other URL, including the app’s own other one', () => {
    // The scheme carries exactly two things and reading one as the other is
    // the failure `useChannelLink`'s docstring has always warned about.
    expect(inviteOfUrl('thefloor://channel/chan_one')).toBeNull();
    expect(inviteOfUrl('thefloor://')).toBeNull();
    expect(inviteOfUrl('otherapp://i/annak/042317')).toBeNull();
  });

  /**
   * **Not a universal link, deliberately.** No AASA claims this domain, so
   * nothing can deliver an `https://` address to this app; matching one would
   * be answering a string that never arrives. planning/UNIVERSAL-LINKS.md is
   * why, and the commit that claims the domain is where this changes.
   */
  it('does not answer the https form of the same address', () => {
    expect(
      inviteOfUrl('https://thefloor.rvanegas.co/i/annak/042317')
    ).toBeNull();
  });

  it('refuses a malformed escape rather than throwing', () => {
    expect(inviteOfUrl('thefloor://i/annak/%ZZ')).toBeNull();
    expect(inviteOfUrl('thefloor://i/%E0%A4%A/042317')).toBeNull();
  });
});

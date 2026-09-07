import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  foldUsername,
  normaliseUsername,
  usernameProblem,
} from '../username';

/**
 * What a username may be, which is the half of the rule that can be settled
 * without a database. Whether one is *taken* is the other half and is tested
 * against the server, in `server/__tests__/profiles.test.ts`.
 */
describe('what counts as a username', () => {
  it('takes letters, digits and underscores', () => {
    expect(normaliseUsername('anna_k99')).toBe('anna_k99');
    expect(normaliseUsername('_____')).toBe('_____');
    expect(normaliseUsername('99999')).toBe('99999');
  });

  it('forgives the at it is written with, and the space around it', () => {
    expect(normaliseUsername('@annak')).toBe('annak');
    expect(normaliseUsername('  @annak  ')).toBe('annak');
  });

  it('refuses rather than repairs anything else', () => {
    // A space is not an underscore and a dot is not nothing: each of these
    // would have to become a different name to be stored.
    expect(normaliseUsername('anna k')).toBeNull();
    expect(normaliseUsername('anna.k')).toBeNull();
    expect(normaliseUsername('anna-k')).toBeNull();
    expect(normaliseUsername('annä')).toBeNull();
    expect(normaliseUsername('an@nak')).toBeNull();
  });

  it('refuses one longer than the cap, and takes one exactly at it', () => {
    const longest = 'a'.repeat(MAX_USERNAME_LENGTH);
    expect(normaliseUsername(longest)).toBe(longest);
    expect(normaliseUsername(longest + 'a')).toBeNull();
  });

  it('refuses one shorter than the floor, and takes one exactly at it', () => {
    const shortest = 'a'.repeat(MIN_USERNAME_LENGTH);
    expect(normaliseUsername(shortest)).toBe(shortest);
    expect(normaliseUsername('a'.repeat(MIN_USERNAME_LENGTH - 1))).toBeNull();
  });

  it('keeps the case that was typed', () => {
    expect(normaliseUsername('AnnaK')).toBe('AnnaK');
  });

  it('judges sameness folded, which is what the unique index does', () => {
    expect(foldUsername('AnnaK')).toBe(foldUsername('annak'));
    expect(foldUsername('anna_k')).not.toBe(foldUsername('annak'));
  });

  /** Blank is how one is given up, so it is nobody's mistake to report. */
  it('treats an empty field as nothing to say rather than as a fault', () => {
    expect(normaliseUsername('')).toBe('');
    expect(usernameProblem('')).toBeNull();
    expect(usernameProblem('   ')).toBeNull();
    expect(usernameProblem('@')).toBeNull();
  });

  it('says what is wrong, and says nothing about a name that is fine', () => {
    expect(usernameProblem('anna_k')).toBeNull();
    expect(usernameProblem('anna k')).toMatch(/underscores/);
    expect(usernameProblem('a'.repeat(MAX_USERNAME_LENGTH + 1))).toMatch(
      /at most/
    );
    // Short and otherwise perfectly well formed: the sentence has to be about
    // the length rather than about the alphabet.
    expect(usernameProblem('ab')).toMatch(/at least/);
  });
});

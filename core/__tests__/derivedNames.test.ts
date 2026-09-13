import {
  displayNameFromIdentifier,
  usernameAttempts,
  usernameStem,
} from '../derivedNames';
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  normaliseUsername,
} from '../username';
import { MAX_DISPLAY_NAME_LENGTH } from '../constants';

/**
 * What an account is called when nobody typed anything. The interesting cases
 * are the ones where a derivation could produce something that is not a name
 * at all — a domain, an underscore, a string the validator would refuse.
 */

describe('a display name out of an address', () => {
  it('takes the local part and capitalises it', () => {
    expect(displayNameFromIdentifier('rvanegas@gmail.com')).toBe('Rvanegas');
  });

  it('reads separators as spaces', () => {
    expect(displayNameFromIdentifier('anna.k@example.com')).toBe('Anna K');
    expect(displayNameFromIdentifier('anna_k-b@example.com')).toBe('Anna K B');
  });

  it('drops a routing tag, which its owner wrote to themselves', () => {
    expect(displayNameFromIdentifier('anna+floor@example.com')).toBe('Anna');
  });

  it('keeps a capital somebody typed themselves', () => {
    expect(displayNameFromIdentifier('annaK@example.com')).toBe('AnnaK');
  });

  it('never says where somebody reads their mail', () => {
    expect(displayNameFromIdentifier('alice@gmail.com')).not.toContain('gmail');
  });

  it('falls back to the address when there is nothing before the @', () => {
    expect(displayNameFromIdentifier('@example.com')).toBe('@example.com');
    expect(displayNameFromIdentifier('...@example.com')).toBe('...@example.com');
  });

  it('is never blank and never over the cap', () => {
    const long = `${'a.'.repeat(60)}z@example.com`;
    const name = displayNameFromIdentifier(long);
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(MAX_DISPLAY_NAME_LENGTH);
    expect(name.trim()).toBe(name);
  });
});

describe('a username stem out of a display name', () => {
  it('prefers lowercase, whatever the name above it does', () => {
    expect(usernameStem('Anna Kowalski')).toBe('anna_kowalski');
  });

  it('folds an accent rather than dropping the letter', () => {
    expect(usernameStem('José Álvarez')).toBe('jose_alvarez');
  });

  it('collapses runs and trims the edges', () => {
    expect(usernameStem('  Anna   —  K!! ')).toBe('anna_k');
  });

  it('is null when the alphabet admits nothing in the name', () => {
    expect(usernameStem('芽衣')).toBeNull();
    expect(usernameStem('!!!')).toBeNull();
    expect(usernameStem('')).toBeNull();
  });

  it('stays inside the cap', () => {
    const stem = usernameStem('Wolfeschlegelsteinhausenbergerdorff Jr Esquire');
    expect(stem!.length).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
  });
});

describe('the candidates offered for a stem', () => {
  it('offers the stem first, then numbers the way a person would', () => {
    expect(usernameAttempts('alice', 3)).toEqual(['alice', 'alice2', 'alice3']);
  });

  it('uses the number to reach the floor when the stem is short', () => {
    expect(usernameAttempts('al', 3)).toEqual(['al01', 'al02', 'al03']);
  });

  it('truncates the stem to make room at the cap', () => {
    const stem = 'a'.repeat(MAX_USERNAME_LENGTH);
    for (const name of usernameAttempts(stem, 4)) {
      expect(name.length).toBeLessThanOrEqual(MAX_USERNAME_LENGTH);
    }
    expect(usernameAttempts(stem, 2)[1]).toBe(
      `${'a'.repeat(MAX_USERNAME_LENGTH - 1)}2`
    );
  });

  it('offers nothing but names the validator accepts', () => {
    for (const stem of ['al', 'alice', 'a', 'anna_k']) {
      for (const name of usernameAttempts(stem, 12)) {
        expect(normaliseUsername(name)).toBe(name);
        expect(name.length).toBeGreaterThanOrEqual(MIN_USERNAME_LENGTH);
      }
    }
  });

  it('never offers the same name twice', () => {
    const names = usernameAttempts('al', 12);
    expect(new Set(names).size).toBe(names.length);
  });
});

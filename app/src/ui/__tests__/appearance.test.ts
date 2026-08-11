import { Appearance, Platform } from 'react-native';
import { applyPreference, isPreference } from '../appearance';

/**
 * The preference, and the one thing it must not get wrong.
 *
 * "System" is not a third scheme to apply — it is the *absence* of an
 * override, which is what lets the phone go on changing its mind (on a
 * schedule, say) after the app has been told to follow it. Sending 'system'
 * where null belongs would pin the app to whatever it happened to be.
 */
describe('applying a colour scheme preference', () => {
  const setColorScheme = jest.spyOn(Appearance, 'setColorScheme');

  beforeEach(() => setColorScheme.mockClear());

  it('overrides the window for an explicit choice', () => {
    applyPreference('light');
    applyPreference('dark');
    if (Platform.OS === 'ios') {
      expect(setColorScheme.mock.calls).toEqual([['light'], ['dark']]);
    }
  });

  it('clears the override for system, rather than pinning the current one', () => {
    applyPreference('system');
    if (Platform.OS === 'ios') {
      expect(setColorScheme).toHaveBeenCalledWith(null);
    }
  });
});

describe('reading a stored preference', () => {
  it('accepts the three it wrote', () => {
    expect(isPreference('light')).toBe(true);
    expect(isPreference('dark')).toBe(true);
    expect(isPreference('system')).toBe(true);
  });

  it('refuses anything else, a stored value being outside our control', () => {
    // It comes back from the keychain as a string, from a build that may have
    // written something else. Falling through to the default beats applying a
    // scheme nobody has heard of.
    for (const value of ['Dark', '', null, undefined, 'auto', 0]) {
      expect(isPreference(value)).toBe(false);
    }
  });
});

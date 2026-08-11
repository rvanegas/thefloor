import { Platform } from 'react-native';
import { colors, palettes } from '../theme';

/**
 * The palettes, and the one property that can silently rot.
 *
 * What the colours *look like* cannot be tested here — `DynamicColorIOS`
 * returns an opaque value that UIKit resolves at draw time, below anything
 * JavaScript can observe. That is checked on a phone with the appearance
 * toggled, per DECISIONS.md. What can be checked is that the two palettes
 * describe the same set of tokens.
 */
describe('the light and dark palettes', () => {
  it('name exactly the same tokens', () => {
    // Drift is already a type error, by construction. This states the rule for
    // a reader, and catches it if the construction is ever loosened.
    expect(Object.keys(palettes.light).sort()).toEqual(
      Object.keys(palettes.dark).sort()
    );
  });

  it('give every token a distinct value in the two schemes', () => {
    // A token identical in both is a token that was not thought about. There
    // is no reason for one here — every one of the fourteen is either a
    // surface, a text colour, or an accent that has to survive both grounds.
    const same = Object.keys(palettes.dark).filter(
      (key) =>
        palettes.dark[key as keyof typeof palettes.dark] ===
        palettes.light[key as keyof typeof palettes.light]
    );
    expect(same).toEqual([]);
  });

  it('resolves every token to something usable on this platform', () => {
    // Confirming rather than assuming DynamicColorIOS survives the test
    // preset: it throws on Android, which is why the export is guarded.
    for (const key of Object.keys(palettes.dark)) {
      const value = colors[key as keyof typeof palettes.dark];
      expect(value).toBeDefined();
      if (Platform.OS !== 'ios') expect(typeof value).toBe('string');
    }
  });
});

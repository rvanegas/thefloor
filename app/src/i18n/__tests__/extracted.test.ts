import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../en';
import { es } from '../es';
import { stringsFor } from '../index';

/**
 * That the extraction stays done.
 *
 * **A test rather than a lint rule, because this repository has no linter**
 * and `core/__tests__/purity.test.ts` is the precedent: a constraint nothing
 * enforces is one that decays the week after it lands, and the decay here is
 * invisible — a literal added to a view is a screen that silently stays
 * English in a Spanish build, with nothing failing anywhere.
 *
 * It looks for prose rather than for strings. A string is how this codebase
 * writes an action type, a style token and a URL; what it must not write any
 * more is a sentence, and the difference a machine can see is a capital
 * letter, a lower-case word and a space.
 */
const UI = join(__dirname, '..', '..', 'ui');
const WATCH = join(__dirname, '..', '..', 'watch');

/**
 * **The two developer screens, by name.** They are instruments, read by
 * whoever is holding the phone and the source at once, and translating them
 * would cost sixty messages to make a diagnostic harder to correlate with the
 * code it is diagnosing. Named here so that it is a decision rather than an
 * oversight — see the head of `en.ts`, which says the same thing from the
 * other side.
 */
const NOT_TRANSLATED = ['AudioLabView.tsx', 'AudioDebugPanel.tsx'];

/**
 * Prose, as a machine can recognise it: quoted, opening with a capital and a
 * lower-case letter, and containing a space.
 *
 * Deliberately not clever. Its job is to fail on a sentence somebody typed
 * into a view, and every way of making it cleverer is a way of making it
 * quieter.
 */
const PROSE = /(['"])([A-Z][a-z]+(?: +[^'"\\\n]+)+)\1/g;

/** Everything that is not a comment, which is where most of this project's prose is. */
function code(contents: string): string {
  let inBlock = false;
  return contents
    .split('\n')
    .filter((line) => {
      const bare = line.trim();
      if (bare.startsWith('/*') || bare.startsWith('{/*')) inBlock = true;
      if (inBlock) {
        if (bare.includes('*/')) inBlock = false;
        return false;
      }
      return !bare.startsWith('//') && !bare.startsWith('*');
    })
    .join('\n');
}

function sourcesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !NOT_TRANSLATED.includes(f))
    .filter((f) => statSync(join(dir, f)).isFile());
}

describe('the words stay in the catalogue', () => {
  const files = [
    ...sourcesIn(UI).map((f) => join(UI, f)),
    ...sourcesIn(WATCH).map((f) => join(WATCH, f)),
  ];

  it('has screens to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(f.lastIndexOf('/') + 1), f]))(
    '%s writes no sentence of its own',
    (_name, path) => {
      const found = [...code(readFileSync(path, 'utf8')).matchAll(PROSE)].map(
        (m) => m[2]
      );
      expect(found).toEqual([]);
    }
  );
});

describe('the two languages', () => {
  const shape = (o: Record<string, unknown>): string[] =>
    Object.entries(o)
      .flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? shape(v as Record<string, unknown>).map((n) => `${k}.${n}`)
          : [k]
      )
      .sort();

  /**
   * Structural rather than textual: `es` is typed as `Strings`, so a missing
   * message is already a typecheck failure. What a test adds is that the two
   * agree at runtime as well.
   */
  it('hold the same messages', () => {
    expect(shape(es)).toEqual(shape(en));
  });

  /**
   * The one thing a type cannot catch: a Spanish message left as the English
   * one because somebody copied the file and stopped. Proper nouns and a few
   * shapes are the same in both deliberately, and are listed.
   */
  it('say something different in Spanish', () => {
    const SAME_ON_PURPOSE = new Set([
      'auth.brand',
      'panes.brand',
      'shared.labelWithBadge',
      'channel.knockLead',
      'channel.no',
      'home.podcasts',
      'naming.pair',
      'naming.andOthers',
      'transcript.data',
    ]);
    const differences: string[] = [];
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === 'function' && typeof b === 'function') {
        // Only the messages that take no argument can be called blind here;
        // the rest are covered by the shape test above and by reading.
        if (a.length > 0) return;
        if (a() === (b as () => unknown)() && !SAME_ON_PURPOSE.has(path)) {
          differences.push(path);
        }
        return;
      }
      if (typeof a !== 'object' || a === null) return;
      for (const key of Object.keys(a as object)) {
        walk(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key
        );
      }
    };
    walk(en, es, '');
    expect(differences).toEqual([]);
  });
});

describe('which catalogue a device gets', () => {
  it('reads the language and ignores the region', () => {
    expect(stringsFor('es')).toBe(es);
    expect(stringsFor('es-MX')).toBe(es);
    expect(stringsFor('es-419')).toBe(es);
    expect(stringsFor('ES_es')).toBe(es);
  });

  it('is English for everything else, and for nothing at all', () => {
    expect(stringsFor('en-GB')).toBe(en);
    expect(stringsFor('fr')).toBe(en);
    expect(stringsFor(undefined)).toBe(en);
    expect(stringsFor('')).toBe(en);
  });
});
